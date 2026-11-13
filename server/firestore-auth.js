'use strict';

const store = require('./firestore-store');

function publicUser(user) {
  if (!user) return null;
  return {
    id: Number(user.id),
    display_name: user.display_name,
    email: user.email,
    role: user.role,
    active: user.active === true
  };
}

async function findUserByEmail(email) {
  return store.getByUnique('users', 'email', String(email).trim().toLowerCase());
}

async function createUser({ display_name, email, password_hash, role, active = true }) {
  const id = await store.createUnique('users', 'email', email, {
    display_name: String(display_name).trim(),
    password_hash,
    role,
    active: Boolean(active),
    updated_at: new Date().toISOString()
  });
  return id;
}

async function createSession({ token_hash, csrf_token, user_id, expires_at }) {
  const id = String(token_hash);
  await store.create('sessions', {
    csrf_token,
    user_id: Number(user_id),
    expires_at,
    created_at: new Date().toISOString()
  }, id);
  return id;
}

async function findSession(tokenHash, now = new Date().toISOString()) {
  const session = await store.get('sessions', tokenHash);
  if (!session || typeof session.expires_at !== 'string' ||
      !Number.isFinite(Date.parse(session.expires_at)) || session.expires_at <= now) return null;
  const user = await store.get('users', session.user_id);
  if (!user || user.active !== true) return null;
  return {
    session_id: session.id,
    csrf_token: session.csrf_token,
    id: Number(user.id),
    display_name: user.display_name,
    email: user.email,
    role: user.role,
    active: user.active === true
  };
}

async function deleteSession(tokenHash) {
  await store.remove('sessions', tokenHash);
}

async function deleteExpiredSessions(now = new Date().toISOString()) {
  const expired = await store.list('sessions', {
    filters: [{ field: 'expires_at', op: '<=', value: now }],
    limit: 500
  });
  await Promise.all(expired.map(session => store.remove('sessions', session.id)));
  return expired.length;
}

async function createRegistrationRequest({ display_name, email, password_hash, role, verification_code }) {
  const now = new Date().toISOString();
  return store.upsertUnique('registrationRequests', 'email', email, {
    display_name,
    password_hash,
    role,
    verification_code,
    status: 'pending',
    reviewed_by: null,
    reviewed_at: null,
    created_at: now
  }, {
    display_name,
    password_hash,
    role,
    verification_code,
    status: 'pending',
    reviewed_by: null,
    reviewed_at: null,
    created_at: now
  }, ['rejected']);
}

async function listPendingRegistrationRequests() {
  return store.list('registrationRequests', {
    filters: [{ field: 'status', op: '==', value: 'pending' }],
    orderBy: { field: 'created_at', direction: 'asc' },
    limit: 200
  });
}

async function reviewRegistrationRequest(id, reviewerId, decision) {
  if (!['approved', 'rejected'].includes(decision)) {
    throw new TypeError('Decisão de cadastro inválida.');
  }
  const db = require('./firebase').firestore;
  if (!db) throw new Error('Firestore não configurado.');
  const requestRef = db.collection('registration_requests').doc(String(id));
  const counterRef = db.collection('_sgve_counters').doc('users');
  const userIndexRef = email => {
    const { createHash } = require('node:crypto');
    const digest = createHash('sha256').update(String(email).trim().toLowerCase()).digest('hex');
    return db.collection('_sgve_unique_indexes').doc('users_email_' + digest);
  };
  return db.runTransaction(async transaction => {
    const requestSnapshot = await transaction.get(requestRef);
    if (!requestSnapshot.exists || requestSnapshot.data().status !== 'pending' ||
        !requestSnapshot.data().password_hash) {
      const error = new Error('Solicitação não encontrada ou já analisada.');
      error.code = 'not-found';
      throw error;
    }
    const request = requestSnapshot.data();
    if (!['teacher', 'guardian', 'student'].includes(request.role) ||
        typeof request.email !== 'string' || !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(request.email)) {
      const error = new Error('Os dados da solicitação são inválidos.');
      error.code = 'invalid-request';
      throw error;
    }
    if (decision === 'rejected') {
      transaction.update(requestRef, {
        status: 'rejected',
        password_hash: null,
        reviewed_by: Number(reviewerId),
        reviewed_at: new Date().toISOString()
      });
      return null;
    }
    const indexRef = userIndexRef(request.email);
    const indexSnapshot = await transaction.get(indexRef);
    if (indexSnapshot.exists) {
      const error = new Error('Já existe uma conta com este e-mail.');
      error.code = 'already-exists';
      throw error;
    }
    const counterSnapshot = await transaction.get(counterRef);
    const userId = (counterSnapshot.exists ? Number(counterSnapshot.data().value) : 0) + 1;
    const userRef = db.collection('users').doc(String(userId));
    const now = new Date().toISOString();
    transaction.create(userRef, {
      display_name: request.display_name,
      email: String(request.email).trim().toLowerCase(),
      password_hash: request.password_hash,
      role: request.role,
      active: true,
      created_at: now,
      updated_at: now
    });
    transaction.set(counterRef, { value: userId, updated_at: now });
    transaction.create(indexRef, { documentId: String(userId), value: String(request.email).trim().toLowerCase() });
    transaction.update(requestRef, {
      status: 'approved',
      password_hash: null,
      reviewed_by: Number(reviewerId),
      reviewed_at: now
    });
    return userId;
  });
}

module.exports = {
  publicUser,
  findUserByEmail,
  createUser,
  createSession,
  findSession,
  deleteSession,
  deleteExpiredSessions,
  createRegistrationRequest,
  listPendingRegistrationRequests,
  reviewRegistrationRequest
};
