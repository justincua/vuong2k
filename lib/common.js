const crypto = require('crypto');
const path = require('path');
const fs = require('fs/promises');
const { db } = require('./firebase');

const EA_TOKEN = process.env.EA_TOKEN || 'cua';
const PANEL_TOKEN = process.env.PANEL_TOKEN || '07072000';
const TZ = 'Asia/Taipei';
const MONTH_JSON_CACHE_DIR = process.env.MONTH_JSON_CACHE_DIR || path.join(process.cwd(), 'generated', 'month_json');

function nowIso() {
  return new Date().toISOString();
}

function cleanStr(v, fallback = '') {
  if (v === undefined || v === null) return fallback;
  return String(v).trim();
}

function cleanNum(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function partsInTz(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type)?.value || '00';
  return { year: get('year'), month: get('month'), day: get('day') };
}

function twDayKey(date = new Date()) {
  const { year, month, day } = partsInTz(date);
  return `${year}-${month}-${day}`;
}

function twMonthKey(date = new Date()) {
  const { year, month } = partsInTz(date);
  return `${year}_${month}`;
}

function monthStorageKeyFromDate(date = new Date()) {
  return `lich_thang_${twMonthKey(date)}`;
}

function monthFileNameFromDate(date = new Date()) {
  return `${monthStorageKeyFromDate(date)}.json`;
}

function monthStorageKeyFromFileName(fileName = '') {
  return cleanStr(fileName).replace(/\.json$/i, '').replace(/[^a-zA-Z0-9_-]/g, '');
}

function monthFileNameFromStorageKey(storageKey = '') {
  const clean = monthStorageKeyFromFileName(storageKey);
  return clean ? `${clean}.json` : 'lich_thang_unknown.json';
}

function makeBotKey({ id, bot, symbol }) {
  const safeId = cleanStr(id, '0');
  const safeBot = cleanStr(bot, 'BOT').replace(/[.#$\[\]/]/g, '_');
  const safeSymbol = cleanStr(symbol, 'SYMBOL').replace(/[.#$\[\]/]/g, '_');
  return `${safeId}__${safeBot}__${safeSymbol}`;
}

function pickHeartbeat(query = {}) {
  const base = {
    id: cleanStr(query.id),
    bot: cleanStr(query.bot),
    name: cleanStr(query.name),
    symbol: cleanStr(query.symbol),

    balance: cleanNum(query.balance),
    equity: cleanNum(query.equity),
    freeMargin: cleanNum(query.freeMargin),
    margin: cleanNum(query.margin),
    marginLevel: cleanNum(query.marginLevel),

    realProfit: cleanNum(query.realProfit),
    realPct: cleanNum(query.realPct),
    dayFloating: cleanNum(query.dayFloating),
    dayClosed: cleanNum(query.dayClosed),
    dayTotal: cleanNum(query.dayTotal),
    dayPct: cleanNum(query.dayPct),

    dd: cleanNum(query.dd),
    dayMaxDD: cleanNum(query.dayMaxDD),
    dayWorstEDD: cleanNum(query.dayWorstEDD),

    buyOpen: cleanNum(query.buyOpen),
    sellOpen: cleanNum(query.sellOpen),
    pairOpen: cleanNum(query.pairOpen),
    buyLotsOpen: cleanNum(query.buyLotsOpen),
    sellLotsOpen: cleanNum(query.sellLotsOpen),

    dayBuy: cleanNum(query.dayBuy),
    daySell: cleanNum(query.daySell),
    dayOrders: cleanNum(query.dayOrders),
    dayLots: cleanNum(query.dayLots),
    dayVolume: cleanNum(query.dayVolume),

    trend: cleanStr(query.trend),
    m1: cleanNum(query.m1),
    m5: cleanNum(query.m5),
    m15: cleanNum(query.m15),
    buyScore: cleanNum(query.buyScore),
    sellScore: cleanNum(query.sellScore),

    spread: cleanNum(query.spread),
    atrPts: cleanNum(query.atrPts),
    rsiM1: cleanNum(query.rsiM1),
    adxM1: cleanNum(query.adxM1),
    rsiM5: cleanNum(query.rsiM5),
    adxM5: cleanNum(query.adxM5),

    hedgeRatio: cleanNum(query.hedgeRatio),
    tpUSD: cleanNum(query.tpUSD),
    state: cleanStr(query.state),
    reason: cleanStr(query.reason),
    status: cleanStr(query.status),
    action: cleanStr(query.action),
    autoTrade: cleanStr(query.autoTrade),
    cooldown: cleanStr(query.cooldown),
    targetReached: cleanStr(query.targetReached),

    eaTs: cleanNum(query.ts),
  };

  base.botKey = makeBotKey(base);
  base.dayKey = twDayKey();
  base.serverTime = nowIso();
  base.heartbeatAt = Date.now();
  base.isAlive = true;
  return base;
}

async function getMergedManual(botKey) {
  const snap = await db().ref(`manual/${botKey}`).get();
  return snap.exists() ? snap.val() : {};
}

async function getIgnored(botKey) {
  const snap = await db().ref(`ignoredBots/${botKey}`).get();
  return !!snap.val();
}

async function pruneRecent(botKey, keep = 200) {
  const ref = db().ref(`bots/${botKey}/recentHeartbeats`).orderByKey().limitToLast(keep + 50);
  const snap = await ref.get();
  if (!snap.exists()) return;
  const keys = Object.keys(snap.val() || {});
  if (keys.length <= keep) return;
  const updates = {};
  for (const key of keys.slice(0, keys.length - keep)) {
    updates[`bots/${botKey}/recentHeartbeats/${key}`] = null;
  }
  await db().ref().update(updates);
}

function randomNonce() {
  return `${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
}

function sendJson(res, statusCode, payload) {
  res.status(statusCode).set({
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type',
  }).send(JSON.stringify(payload));
}

function ok(res, payload) {
  return sendJson(res, 200, payload);
}

function fail(res, statusCode, error, message = '') {
  return sendJson(res, statusCode, {
    ok: false,
    error,
    message,
    server_time: nowIso(),
  });
}

function optionsResponse(res) {
  res.status(204).set({
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type',
    'cache-control': 'no-store',
  }).send('');
}

function buildDayPayload(hb, prevDay = {}) {
  const hasOpenPositions = Number(hb.buyOpen || 0) > 0 || Number(hb.sellOpen || 0) > 0 || Number(hb.pairOpen || 0) > 0;
  const paused = String(hb.state || '').toUpperCase() === 'PAUSED';
  const stopLike = paused && !hasOpenPositions;
  const dayStartBalance = Number.isFinite(Number(prevDay.dayStartBalance)) ? Number(prevDay.dayStartBalance) : hb.balance;
  const dayStartEquity = Number.isFinite(Number(prevDay.dayStartEquity)) ? Number(prevDay.dayStartEquity) : hb.equity;
  const latestBalance = hb.balance;
  const latestEquity = hb.equity;
  const stopBalance = stopLike ? hb.balance : (Number.isFinite(Number(prevDay.stopBalance)) ? Number(prevDay.stopBalance) : null);
  const stopEquity = stopLike ? hb.equity : (Number.isFinite(Number(prevDay.stopEquity)) ? Number(prevDay.stopEquity) : null);
  const endBalance = stopBalance !== null ? stopBalance : latestBalance;
  const endEquity = stopEquity !== null ? stopEquity : latestEquity;
  const actualDayProfitBalance = endBalance - dayStartBalance;
  const actualDayProfitEquity = endEquity - dayStartEquity;
  const actualDayPctBalance = dayStartBalance > 0 ? (actualDayProfitBalance / dayStartBalance) * 100.0 : 0;
  const actualDayPctEquity = dayStartEquity > 0 ? (actualDayProfitEquity / dayStartEquity) * 100.0 : 0;

  return {
    id: hb.id,
    bot: hb.bot,
    symbol: hb.symbol,
    name: hb.name,
    balance: hb.balance,
    equity: hb.equity,
    realProfit: hb.realProfit,
    realPct: hb.realPct,
    dayFloating: hb.dayFloating,
    dayClosed: hb.dayClosed,
    dayTotal: hb.dayTotal,
    dayPct: hb.dayPct,
    dd: hb.dd,
    dayMaxDD: hb.dayMaxDD,
    dayWorstEDD: hb.dayWorstEDD,
    dayBuy: hb.dayBuy,
    daySell: hb.daySell,
    dayOrders: hb.dayOrders,
    dayLots: hb.dayLots,
    dayVolume: hb.dayVolume,
    buyOpen: hb.buyOpen,
    sellOpen: hb.sellOpen,
    pairOpen: hb.pairOpen,
    state: hb.state,
    reason: hb.reason,
    status: hb.status,
    trend: hb.trend,
    dayStartBalance,
    dayStartEquity,
    latestBalance,
    latestEquity,
    stopBalance,
    stopEquity,
    endBalance,
    endEquity,
    actualDayProfitBalance,
    actualDayProfitEquity,
    actualDayPctBalance,
    actualDayPctEquity,
    stoppedTrade: stopLike,
    updatedAt: hb.serverTime,
    updatedTs: hb.heartbeatAt,
  };
}

function buildMonthlyDaySnapshot(hb, dayPayload) {
  return {
    dayKey: hb.dayKey,
    id: hb.id,
    bot: hb.bot,
    symbol: hb.symbol,
    name: hb.name,
    state: hb.state,
    reason: hb.reason,
    status: hb.status,
    action: hb.action,
    balance: hb.balance,
    equity: hb.equity,
    realProfit: hb.realProfit,
    realPct: hb.realPct,
    dayTotal: hb.dayTotal,
    dayPct: hb.dayPct,
    dayOrders: hb.dayOrders,
    dayBuy: hb.dayBuy,
    daySell: hb.daySell,
    dayLots: hb.dayLots,
    dayVolume: hb.dayVolume,
    dd: hb.dd,
    dayMaxDD: hb.dayMaxDD,
    dayWorstEDD: hb.dayWorstEDD,
    dayStartBalance: dayPayload.dayStartBalance,
    dayStartEquity: dayPayload.dayStartEquity,
    latestBalance: dayPayload.latestBalance,
    latestEquity: dayPayload.latestEquity,
    endBalance: dayPayload.endBalance,
    endEquity: dayPayload.endEquity,
    actualDayProfitBalance: dayPayload.actualDayProfitBalance,
    actualDayProfitEquity: dayPayload.actualDayProfitEquity,
    actualDayPctBalance: dayPayload.actualDayPctBalance,
    actualDayPctEquity: dayPayload.actualDayPctEquity,
    finalized: !!dayPayload.stoppedTrade,
    updatedAt: hb.serverTime,
    updatedTs: hb.heartbeatAt,
    source: 'heartbeat',
  };
}

async function upsertMonthlyCalendarSnapshot(hb, dayPayload) {
  const storageKey = monthStorageKeyFromDate();
  const fileName = monthFileNameFromDate();
  const monthRef = `calendarFiles/${storageKey}`;
  const snapshot = buildMonthlyDaySnapshot(hb, dayPayload);
  const updates = {};
  updates[`${monthRef}/meta`] = {
    fileName,
    storageKey,
    monthKey: twMonthKey(),
    tz: TZ,
    updatedAt: hb.serverTime,
    updatedTs: hb.heartbeatAt,
  };
  updates[`${monthRef}/bots/${hb.botKey}/meta`] = {
    botKey: hb.botKey,
    id: hb.id,
    bot: hb.bot,
    symbol: hb.symbol,
    name: hb.name,
    updatedAt: hb.serverTime,
    updatedTs: hb.heartbeatAt,
  };
  updates[`${monthRef}/bots/${hb.botKey}/days/${hb.dayKey}`] = snapshot;
  await db().ref().update(updates);
  return { storageKey, fileName };
}

async function readMonthlyCalendar(storageKey) {
  const cleanKey = monthStorageKeyFromFileName(storageKey);
  const fileName = monthFileNameFromStorageKey(cleanKey);
  const snap = await db().ref(`calendarFiles/${cleanKey}`).get();
  const val = snap.exists() ? (snap.val() || {}) : {};
  return {
    ok: true,
    file: fileName,
    storageKey: cleanKey,
    tz: TZ,
    updatedAt: val?.meta?.updatedAt || nowIso(),
    bots: val?.bots || {},
    meta: val?.meta || {
      fileName,
      storageKey: cleanKey,
      tz: TZ,
      updatedAt: nowIso(),
    },
  };
}

async function mirrorMonthJsonToDisk(fileName, payload) {
  try {
    await fs.mkdir(MONTH_JSON_CACHE_DIR, { recursive: true });
    const filePath = path.join(MONTH_JSON_CACHE_DIR, fileName);
    await fs.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf8');
    return filePath;
  } catch (error) {
    console.error('mirrorMonthJsonToDisk error', error);
    return '';
  }
}

module.exports = {
  db,
  EA_TOKEN,
  PANEL_TOKEN,
  TZ,
  nowIso,
  cleanStr,
  cleanNum,
  twDayKey,
  twMonthKey,
  monthStorageKeyFromDate,
  monthFileNameFromDate,
  monthStorageKeyFromFileName,
  monthFileNameFromStorageKey,
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
};
