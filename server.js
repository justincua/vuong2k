const path = require('path');
const express = require('express');
const {
  EA_TOKEN,
  PANEL_TOKEN,
  db,
  nowIso,
  cleanStr,
  makeBotKey,
  pickHeartbeat,
  getMergedManual,
  getIgnored,
  pruneRecent,
  randomNonce,
  ok,
  fail,
  optionsResponse,
  buildDayPayload,
  upsertMonthlyCalendarSnapshot,
  readMonthlyCalendar,
  mirrorMonthJsonToDisk,
  monthStorageKeyFromFileName,
} = require('./lib/common');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.join(__dirname, 'public');

app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));
app.use((req, res, next) => {
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-methods', 'GET,POST,OPTIONS');
  res.setHeader('access-control-allow-headers', 'content-type');
  if (req.method === 'OPTIONS') return optionsResponse(res);
  next();
});
app.use(express.static(PUBLIC_DIR, { extensions: ['html'] }));

app.get('/health', (_req, res) => ok(res, { ok: true, service: 'railway-firebase-ea-dashboard', server_time: nowIso() }));

app.get('/ea/heartbeat', async (req, res) => {
  try {
    if (cleanStr(req.query.ea_token) !== EA_TOKEN) return fail(res, 401, 'UNAUTHORIZED');
    const hb = pickHeartbeat(req.query);
    if (!hb.id || !hb.bot || !hb.symbol) return fail(res, 400, 'MISSING_ID_BOT_SYMBOL');
    if (await getIgnored(hb.botKey)) {
      return ok(res, { ok: true, ignored: true, botKey: hb.botKey, server_time: nowIso() });
    }

    const manual = await getMergedManual(hb.botKey);
    const display = { ...hb, ...(manual.liveOverrides || {}) };

    const dayRef = db().ref(`bots/${hb.botKey}/days/${hb.dayKey}`);
    const daySnap = await dayRef.get();
    const prevDay = daySnap.exists() ? (daySnap.val() || {}) : {};
    const dayPayload = buildDayPayload(hb, prevDay);

    const updates = {};
    updates[`bots/${hb.botKey}/live`] = display;
    updates[`bots/${hb.botKey}/meta`] = {
      botKey: hb.botKey,
      id: hb.id,
      bot: hb.bot,
      symbol: hb.symbol,
      name: hb.name,
      updatedAt: hb.serverTime,
      updatedTs: hb.heartbeatAt,
    };
    updates[`bots/${hb.botKey}/days/${hb.dayKey}`] = dayPayload;
    updates[`bots/${hb.botKey}/recentHeartbeats/${String(hb.heartbeatAt)}`] = hb;
    updates[`indexes/byAccount/${hb.id}/${hb.botKey}`] = true;
    updates[`indexes/byBotName/${hb.bot}/${hb.botKey}`] = true;
    updates[`lastHeartbeat/${hb.botKey}`] = hb.serverTime;

    await db().ref().update(updates);
    await upsertMonthlyCalendarSnapshot(hb, dayPayload);
    pruneRecent(hb.botKey).catch(() => {});

    return ok(res, {
      ok: true,
      botKey: hb.botKey,
      saved: true,
      month_file: `lich_thang_${hb.dayKey.slice(0, 7).replace('-', '_')}.json`,
      server_time: nowIso(),
    });
  } catch (error) {
    console.error('/ea/heartbeat error', error);
    return fail(res, 500, 'SERVER_ERROR', error.message || 'Unknown error');
  }
});

app.get('/panel/summary', async (req, res) => {
  try {
    if (cleanStr(req.query.token) !== PANEL_TOKEN) return fail(res, 401, 'UNAUTHORIZED');
    const snap = await db().ref('bots').get();
    const raw = snap.val() || {};
    const items = Object.keys(raw).map((botKey) => ({ botKey, ...(raw[botKey].live || {}) }));
    items.sort((a, b) => (b.updatedTs || 0) - (a.updatedTs || 0));
    return ok(res, { ok: true, items, count: items.length, server_time: nowIso() });
  } catch (error) {
    console.error('/panel/summary error', error);
    return fail(res, 500, 'SERVER_ERROR', error.message || 'Unknown error');
  }
});

app.all('/panel/cmd', async (req, res) => {
  try {
    const body = req.body || {};
    const token = cleanStr(body.token || req.query.token);
    if (token !== PANEL_TOKEN) return fail(res, 401, 'UNAUTHORIZED');
    const botKey = cleanStr(body.botKey || req.query.botKey);
    const cmd = cleanStr(body.cmd || req.query.cmd);
    const timemode = cleanStr(body.timemode || req.query.timemode);
    if (!botKey || !cmd) return fail(res, 400, 'MISSING_BOTKEY_OR_CMD');
    const nonce = randomNonce();
    await db().ref(`commands/${botKey}/${nonce}`).set({
      cmd,
      timemode,
      status: 'queued',
      createdAt: nowIso(),
    });
    return ok(res, { ok: true, botKey, nonce, server_time: nowIso() });
  } catch (error) {
    console.error('/panel/cmd error', error);
    return fail(res, 500, 'SERVER_ERROR', error.message || 'Unknown error');
  }
});

app.get('/ea/next', async (req, res) => {
  try {
    if (cleanStr(req.query.ea_token) !== EA_TOKEN) return fail(res, 401, 'UNAUTHORIZED');
    const botKey = makeBotKey(req.query);
    const snap = await db().ref(`commands/${botKey}`).orderByChild('status').equalTo('queued').limitToFirst(1).get();
    if (!snap.exists()) return ok(res, { ok: true, cmd: '', server_time: nowIso() });
    const data = snap.val() || {};
    const [nonce, item] = Object.entries(data)[0];
    await db().ref(`commands/${botKey}/${nonce}`).update({
      status: 'sent',
      sentAt: nowIso(),
    });
    return ok(res, {
      ok: true,
      nonce,
      cmd: item.cmd || '',
      timemode: item.timemode || '',
      createdAt: item.createdAt || '',
      server_time: nowIso(),
    });
  } catch (error) {
    console.error('/ea/next error', error);
    return fail(res, 500, 'SERVER_ERROR', error.message || 'Unknown error');
  }
});

app.get('/ea/ack', async (req, res) => {
  try {
    if (cleanStr(req.query.ea_token) !== EA_TOKEN) return fail(res, 401, 'UNAUTHORIZED');
    const botKey = makeBotKey(req.query);
    const nonce = cleanStr(req.query.nonce);
    if (!nonce) return fail(res, 400, 'MISSING_NONCE');
    await db().ref(`commands/${botKey}/${nonce}`).update({
      status: 'acked',
      result: cleanStr(req.query.result),
      ackAt: nowIso(),
    });
    return ok(res, { ok: true, botKey, nonce, server_time: nowIso() });
  } catch (error) {
    console.error('/ea/ack error', error);
    return fail(res, 500, 'SERVER_ERROR', error.message || 'Unknown error');
  }
});

app.get('/calendar/:fileName', async (req, res) => {
  try {
    const storageKey = monthStorageKeyFromFileName(req.params.fileName);
    if (!storageKey || !/^lich_thang_\d{4}_\d{2}$/i.test(storageKey)) {
      return fail(res, 400, 'INVALID_MONTH_FILE');
    }
    const payload = await readMonthlyCalendar(storageKey);
    await mirrorMonthJsonToDisk(payload.file, payload);
    return ok(res, payload);
  } catch (error) {
    console.error('/calendar/:fileName error', error);
    return fail(res, 500, 'SERVER_ERROR', error.message || 'Unknown error');
  }
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Railway dashboard listening on ${PORT}`);
});
