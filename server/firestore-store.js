'use strict';

const { createHash } = require('node:crypto');
const { firestore } = require('./firebase');

const COLLECTIONS = Object.freeze({
  users: 'users',
  sessions: 'sessions',
  classes: 'classes',
  students: 'students',
  studentGuardians: 'student_guardians',
  trips: 'trips',
  tripClasses: 'trip_classes',
  tripStudents: 'trip_students',
  tripStaff: 'trip_staff',
  auditLogs: 'audit_logs',
  registrationRequests: 'registration_requests'
});

function requireFirestore() {
  if (!firestore) {
    throw new Error('Firestore não configurado. Defina FIREBASE_PROJECT_ID e FIREBASE_SERVICE_ACCOUNT_JSON.');
  }
  return firestore;
}

function collection(name) {
  const path = COLLECTIONS[name];
  if (!path) throw new Error('Coleção SGVE desconhecida: ' + name);
  return requireFirestore().collection(path);
}

function normalizeId(id) {
  const value = String(id ?? '').trim();
  if (!value || value.length > 150 || value.includes('/')) {
    throw new TypeError('Identificador inválido.');
  }
  return value;
}

async function get(name, id) {
  const snapshot = await collection(name).doc(normalizeId(id)).get();
  return snapshot.exists ? { id: snapshot.id, ...snapshot.data() } : null;
}

async function list(name, options = {}) {
  let query = collection(name);
  for (const filter of options.filters || []) {
    if (!filter || typeof filter.field !== 'string' ||
        !['==', '!=', '<', '<=', '>', '>=', 'in', 'array-contains'].includes(filter.op)) {
      throw new TypeError('Filtro Firestore inválido.');
    }
    query = query.where(filter.field, filter.op, filter.value);
  }
  if (options.orderBy) {
    query = query.orderBy(options.orderBy.field, options.orderBy.direction || 'asc');
  }
  if (Number.isInteger(options.limit) && options.limit > 0) {
    query = query.limit(Math.min(options.limit, 500));
  }
  const snapshot = await query.get();
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

async function create(name, data, id) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new TypeError('Os dados do documento devem ser um objeto.');
  }
  const ref = id === undefined ? collection(name).doc() : collection(name).doc(normalizeId(id));
  await ref.create({ ...data, created_at: data.created_at || new Date().toISOString() });
  return ref.id;
}

async function set(name, id, data, options = {}) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new TypeError('Os dados do documento devem ser um objeto.');
  }
  await collection(name).doc(normalizeId(id)).set(data, { merge: options.merge === true });
}

async function update(name, id, data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new TypeError('Os dados do documento devem ser um objeto.');
  }
  await collection(name).doc(normalizeId(id)).update(data);
}

async function remove(name, id) {
  await collection(name).doc(normalizeId(id)).delete();
}


const UNIQUE_FIELDS = Object.freeze({
  users: ['email'],
  registrationRequests: ['email']
});

function uniqueIndexRef(name, field, value) {
  if (!UNIQUE_FIELDS[name]?.includes(field)) {
    throw new TypeError('Campo único não permitido para esta coleção.');
  }
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!normalized || normalized.length > 254) throw new TypeError('Valor único inválido.');
  const key = createHash('sha256').update(normalized).digest('hex');
  return requireFirestore().collection('_sgve_unique_indexes').doc(name + '_' + field + '_' + key);
}

async function getByUnique(name, field, value) {
  const index = await uniqueIndexRef(name, field, value).get();
  if (!index.exists) return null;
  return get(name, index.data().documentId);
}

async function createUnique(name, field, value, data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new TypeError('Os dados do documento devem ser um objeto.');
  }
  const db = requireFirestore();
  const indexRef = uniqueIndexRef(name, field, value);
  const counterRef = db.collection('_sgve_counters').doc(name);
  const normalized = String(value).trim().toLowerCase();
  return db.runTransaction(async transaction => {
    const indexSnapshot = await transaction.get(indexRef);
    if (indexSnapshot.exists) {
      const error = new Error('Registro duplicado: ' + field);
      error.code = 'already-exists';
      throw error;
    }
    const counterSnapshot = await transaction.get(counterRef);
    const id = (counterSnapshot.exists ? Number(counterSnapshot.data().value) : 0) + 1;
    const documentRef = collection(name).doc(String(id));
    transaction.create(documentRef, { ...data, [field]: normalized });
    transaction.set(counterRef, { value: id, updated_at: new Date().toISOString() });
    transaction.create(indexRef, { documentId: String(id), value: normalized });
    return id;
  });
}

async function nextNumericId(name) {
  if (!COLLECTIONS[name]) throw new Error('Coleção SGVE desconhecida: ' + name);
  const db = requireFirestore();
  const counter = db.collection('_sgve_counters').doc(name);
  return db.runTransaction(async transaction => {
    const snapshot = await transaction.get(counter);
    const next = (snapshot.exists ? Number(snapshot.data().value) : 0) + 1;
    transaction.set(counter, { value: next, updated_at: new Date().toISOString() });
    return next;
  });
}

async function createWithNumericId(name, data) {
  const id = await nextNumericId(name);
  await create(name, data, id);
  return id;
}

module.exports = {
  COLLECTIONS,
  get,
  list,
  create,
  set,
  update,
  remove,
  nextNumericId,
  createWithNumericId,
  getByUnique,
  createUnique
};
