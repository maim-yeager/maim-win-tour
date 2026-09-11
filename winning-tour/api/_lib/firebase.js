const admin = require('firebase-admin');

let firebaseRegister = { initialized: false, app: null };

function initFirebase() {
    if (firebaseRegister.initialized) return admin;
    // Service account is supplied via GOOGLE_APPLICATION_CREDENTIALS (recommended)
    // or via a base64-encoded JSON in FIREBASE_SERVICE_ACCOUNT.
    if (process.env.FIREBASE_SERVICE_ACCOUNT_B64) {
        const cred = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_B64, 'base64').toString('utf8'));
        admin.initializeApp({ credential: admin.credential.cert(cred), databaseURL: process.env.FIREBASE_DB_URL });
    } else {
        admin.initializeApp({ databaseURL: process.env.FIREBASE_DB_URL || undefined });
    }
    firebaseRegister.initialized = true;
    firebaseRegister.app = admin;
    return admin;
}

function db() {
    return initFirebase().database();
}

function auth() {
    return initFirebase().auth();
}

module.exports = { initFirebase, db, auth, admin };