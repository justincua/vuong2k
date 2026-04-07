const admin = require('firebase-admin');

let booted = false;

function getDatabaseURL() {
  return process.env.FIREBASE_DATABASE_URL || '';
}

function parseServiceAccount() {
  if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    throw new Error('Missing FIREBASE_SERVICE_ACCOUNT_JSON');
  }
  return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
}

function ensureBoot() {
  if (booted && admin.apps.length) return;
  const databaseURL = getDatabaseURL();
  if (!databaseURL) throw new Error('Missing FIREBASE_DATABASE_URL');
  const serviceAccount = parseServiceAccount();
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL,
  });
  booted = true;
}

function db() {
  ensureBoot();
  return admin.database();
}

module.exports = { db };
