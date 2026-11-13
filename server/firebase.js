'use strict';

// Firebase Admin is server-side only. Never expose service-account credentials to the browser.
const { cert, getApps, initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const projectId = String(process.env.FIREBASE_PROJECT_ID || 'svge-14ec7').trim();
const rawServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

let firestore = null;
let firebaseConfigured = false;

if (rawServiceAccount && rawServiceAccount.trim()) {
  let serviceAccount;
  try {
    serviceAccount = JSON.parse(rawServiceAccount);
  } catch {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON precisa conter um JSON válido da conta de serviço.');
  }

  if (!serviceAccount.project_id || serviceAccount.project_id !== projectId) {
    throw new Error('A conta de serviço não corresponde ao FIREBASE_PROJECT_ID configurado.');
  }
  if (!serviceAccount.client_email || !serviceAccount.private_key) {
    throw new Error('A conta de serviço do Firebase está incompleta.');
  }

  const existingApp = getApps().find(app => app.name === 'sgve');
  const app = existingApp || initializeApp({
    credential: cert(serviceAccount),
    projectId
  }, 'sgve');

  firestore = getFirestore(app);
  firebaseConfigured = true;
}

module.exports = { firestore, firebaseConfigured, projectId };
