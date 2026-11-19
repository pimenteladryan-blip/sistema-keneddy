'use strict';

const crypto = require('node:crypto');
const store = require('./firestore-store');

function validateRegistrationRequest(request) {
  const email = typeof request?.email === 'string' ? request.email.trim().toLowerCase() : '';
  const validEmail = email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const name = typeof request?.display_name === 'string' ? request.display_name.trim() : '';
  const validPasswordHash = typeof request?.password_hash === 'string' &&
    /^scrypt:[a-f0-9]{32}:[a-f0-9]{128}$/.test(request.password_hash);
  const validVerificationCode = typeof request?.verification_code === 'string' &&
    /^[A-HJ-NP-Z2-9]{6}$/.test(request.verification_code);
  if (!['teacher', 'guardian', 'student'].includes(request?.role) ||
      !validEmail || name.length < 3 || name.length > 100 ||
      !validPasswordHash || !validVerificationCode) {
    const error = new Error('Os dados da solicitação são inválidos.');
    error.code = 'invalid-request';
    throw error;
  }
  return { ...request, email, display_name: name };
}

function approvedUserData(request, now = new Date().toISOString()) {
  return {
    display_name: request.display_name,
    email: request.email,
    password_hash: request.password_hash,
    role: request.role,
    active: true,
    created_at: now,
    updated_at: now
  };
}

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
  if (typeof email !== 'string') return null;
  return store.getByUnique('users', 'email', email.trim().toLowerCase());
}

async function findUserById(id) {
  const userId = Number(id);
  if (!Number.isSafeInteger(userId) || userId < 1) return null;
  return store.get('users', userId);
}

async function listUsers(limit = 300) {
  const safeLimit = Number.isInteger(limit) ? Math.max(1, Math.min(limit, 300)) : 300;
  const users = await store.list('users', {
    orderBy: { field: 'display_name', direction: 'asc' },
    limit: safeLimit
  });
  return users.map(publicUser);
}

async function createUser({ display_name, email, password_hash, role, active = true, actor_user_id = null }) {
  const name = typeof display_name === 'string' ? display_name.trim() : '';
  const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
  const validEmail = normalizedEmail.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail);
  const validPasswordHash = typeof password_hash === 'string' &&
    /^scrypt:[a-f0-9]{32}:[a-f0-9]{128}$/.test(password_hash);
  if (name.length < 3 || name.length > 100 || !validEmail ||
      !validPasswordHash || !['admin', 'direction', 'secretariat', 'teacher', 'guardian', 'student'].includes(role) ||
      typeof active !== 'boolean') {
    const error = new Error('Os dados da conta são inválidos.');
    error.code = 'invalid-user';
    throw error;
  }
  const now = new Date().toISOString();
  return store.createUnique('users', 'email', normalizedEmail, {
    display_name: name,
    password_hash,
    role,
    active,
    created_at: now,
    updated_at: now
  }, actor_user_id == null ? null : { actor_user_id, action: 'create', entity_type: 'user' });
}

async function createFirebaseUser({ display_name, email, firebase_uid, role, active = true, actor_user_id = null }) {
  const name = typeof display_name === 'string' ? display_name.trim() : '';
  const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
  if (name.length < 3 || name.length > 100 ||
      !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(normalizedEmail) ||
      normalizedEmail.length > 254 ||
      typeof firebase_uid !== 'string' || !firebase_uid || firebase_uid.length > 128 ||
      !['admin', 'direction', 'secretariat', 'teacher', 'guardian', 'student'].includes(role) ||
      typeof active !== 'boolean') {
    const error = new Error('Os dados da conta Firebase são inválidos.');
    error.code = 'invalid-user';
    throw error;
  }
  const now = new Date().toISOString();
  return store.createUnique('users', 'email', normalizedEmail, {
    display_name: name, firebase_uid, role, active,
    created_at: now, updated_at: now
  }, actor_user_id == null ? null : {
    actor_user_id: Number(actor_user_id), action: 'create', entity_type: 'user'
  });
}

async function setFirebaseUid(id, firebase_uid) {
  const user = await findUserById(id);
  if (!user || typeof firebase_uid !== 'string' || !firebase_uid) return false;
  await store.update('users', user.id, { firebase_uid, updated_at: new Date().toISOString() });
  return true;
}

async function importUserWithId({ id, display_name, email, password_hash, role, active = true }) {
  const userId = Number(id);
  const name = typeof display_name === 'string' ? display_name.trim() : '';
  const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
  const validEmail = normalizedEmail.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail);
  const validPasswordHash = typeof password_hash === 'string' &&
    /^scrypt:[a-f0-9]{32}:[a-f0-9]{128}$/.test(password_hash);
  if (!Number.isSafeInteger(userId) || userId < 1 || name.length < 3 ||
      name.length > 100 || !validEmail || !validPasswordHash ||
      !['admin', 'direction', 'secretariat', 'teacher', 'guardian', 'student'].includes(role) ||
      typeof active !== 'boolean') {
    const error = new Error('Os dados da conta para importação são inválidos.');
    error.code = 'invalid-user';
    throw error;
  }
  const now = new Date().toISOString();
  return store.createUniqueWithId('users', 'email', normalizedEmail, userId, {
    display_name: name,
    password_hash,
    role,
    active,
    created_at: now,
    updated_at: now
  });
}

async function setUserActive(id, active) {
  if (typeof active !== 'boolean') throw new TypeError('Estado da conta inválido.');
  const user = await findUserById(id);
  if (!user) return false;
  await store.update('users', user.id, {
    active,
    updated_at: new Date().toISOString()
  });
  return true;
}

async function createAuditLog({ actor_user_id = null, action, entity_type, entity_id = null }) {
  if (typeof action !== 'string' || !action.trim() || action.length > 80 ||
      typeof entity_type !== 'string' || !entity_type.trim() || entity_type.length > 80 ||
      (actor_user_id !== null && (!Number.isSafeInteger(Number(actor_user_id)) || Number(actor_user_id) < 1))) {
    throw new TypeError('Evento de auditoria inválido.');
  }
  return store.create('auditLogs', {
    actor_user_id: actor_user_id === null ? null : Number(actor_user_id),
    action: action.trim(),
    entity_type: entity_type.trim(),
    entity_id: entity_id === null ? null : String(entity_id),
    created_at: new Date().toISOString()
  });
}

async function createSessionWithAudit({ token_hash, csrf_token, user_id, expires_at, action = 'login_google' }) {
  const userId = Number(user_id);
  if (typeof token_hash !== 'string' || !/^[a-f0-9]{64}$/.test(token_hash) ||
      typeof csrf_token !== 'string' || csrf_token.length < 32 ||
      !Number.isSafeInteger(userId) || userId < 1 ||
      !Number.isFinite(Date.parse(expires_at)) ||
      !['login_google', 'login_password'].includes(action)) {
    throw new TypeError('Dados de sessão inválidos.');
  }
  const db = require('./firebase').firestore;
  if (!db) throw new Error('Firestore não configurado.');
  const sessionRef = db.collection('sessions').doc(token_hash);
  const auditRef = db.collection('audit_logs').doc();
  const now = new Date().toISOString();
  await db.runTransaction(async transaction => {
    transaction.create(sessionRef, {
      csrf_token, user_id: userId, expires_at,
      created_at: now
    });
    transaction.create(auditRef, {
      actor_user_id: userId, action, entity_type: 'user',
      entity_id: String(userId), created_at: now
    });
  });
  return token_hash;
}

async function deleteSessionWithAudit(tokenHash, userId) {
  const actorId = Number(userId);
  if (typeof tokenHash !== 'string' || !/^[a-f0-9]{64}$/.test(tokenHash) ||
      !Number.isSafeInteger(actorId) || actorId < 1) {
    throw new TypeError('Dados de encerramento de sessão inválidos.');
  }
  const db = require('./firebase').firestore;
  if (!db) throw new Error('Firestore não configurado.');
  const sessionRef = db.collection('sessions').doc(tokenHash);
  const auditRef = db.collection('audit_logs').doc();
  const now = new Date().toISOString();
  await db.runTransaction(async transaction => {
    const sessionSnapshot = await transaction.get(sessionRef);
    if (sessionSnapshot.exists) transaction.delete(sessionRef);
    transaction.create(auditRef, {
      actor_user_id: actorId, action: 'logout', entity_type: 'user',
      entity_id: String(actorId), created_at: now
    });
  });
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


async function consumeRateLimit({ scope, keys, windowMs, maxAttempts, nowMs = Date.now() }) {
  if (typeof scope !== 'string' || !/^[a-z0-9_-]{1,60}$/i.test(scope) ||
      !Array.isArray(keys) || !keys.length || keys.length > 10 ||
      keys.some(key => typeof key !== 'string' || !key || key.length > 512) ||
      !Number.isSafeInteger(windowMs) || windowMs < 1000 ||
      !Number.isSafeInteger(maxAttempts) || maxAttempts < 1 ||
      !Number.isSafeInteger(nowMs) || nowMs < 0) {
    throw new TypeError('Parâmetros de limitação de tentativas inválidos.');
  }
  const db = require('./firebase').firestore;
  if (!db) throw new Error('Firestore não configurado para limitar tentativas.');
  const uniqueKeys = [...new Set(keys)];
  const refs = uniqueKeys.map(key => {
    const digest = crypto.createHash('sha256').update(scope + '\0' + key).digest('hex');
    return db.collection('_sgve_rate_limits').doc(digest);
  });

  return db.runTransaction(async transaction => {
    const snapshots = [];
    for (const ref of refs) snapshots.push(await transaction.get(ref));

    const now = nowMs;
    const states = snapshots.map(snapshot => {
      const data = snapshot.exists ? snapshot.data() : {};
      const startedAt = Number(data.started_at_ms);
      const activeWindow = Number.isSafeInteger(startedAt) &&
        now >= startedAt && now - startedAt < windowMs;
      const count = activeWindow && Number.isSafeInteger(Number(data.count))
        ? Number(data.count) : 0;
      return { startedAt: activeWindow ? startedAt : now, count };
    });

    if (states.some(state => state.count >= maxAttempts)) {
      return { allowed: false };
    }

    refs.forEach((ref, index) => {
      const state = states[index];
      transaction.set(ref, {
        scope,
        count: state.count + 1,
        started_at_ms: state.startedAt,
        expires_at: new Date(state.startedAt + windowMs)
      });
    });
    return { allowed: true };
  });
}

async function resetRateLimit({ scope, keys }) {
  if (typeof scope !== 'string' || !/^[a-z0-9_-]{1,60}$/i.test(scope) ||
      !Array.isArray(keys) || !keys.length || keys.length > 10 ||
      keys.some(key => typeof key !== 'string' || !key || key.length > 512)) {
    throw new TypeError('Parâmetros de limpeza do limitador inválidos.');
  }
  const db = require('./firebase').firestore;
  if (!db) throw new Error('Firestore não configurado para limpar tentativas.');
  const refs = [...new Set(keys)].map(key => {
    const digest = crypto.createHash('sha256').update(scope + '\0' + key).digest('hex');
    return db.collection('_sgve_rate_limits').doc(digest);
  });
  await Promise.all(refs.map(ref => ref.delete()));
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
  const reviewer = Number(reviewerId);
  if (!Number.isSafeInteger(reviewer) || reviewer < 1) {
    throw new TypeError('Revisor inválido.');
  }
  if (!['approved', 'rejected'].includes(decision)) {
    throw new TypeError('Decisão de cadastro inválida.');
  }
  const db = require('./firebase').firestore;
  if (!db) throw new Error('Firestore não configurado.');
  const requestRef = db.collection('registration_requests').doc(String(id));
  const auditRef = db.collection('audit_logs').doc();
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
    const request = validateRegistrationRequest(requestSnapshot.data());
    if (decision === 'rejected') {
      const now = new Date().toISOString();
      transaction.update(requestRef, {
        status: 'rejected', password_hash: null, verification_code: null,
        reviewed_by: reviewer, reviewed_at: now
      });
      transaction.create(auditRef, {
        actor_user_id: reviewer, action: 'reject_registration',
        entity_type: 'registration_request', entity_id: String(id), created_at: now
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
    transaction.create(userRef, approvedUserData(request, now));
    transaction.set(counterRef, { value: userId, updated_at: now });
    transaction.create(indexRef, { documentId: String(userId), value: request.email });
    transaction.update(requestRef, {
      status: 'approved', password_hash: null, verification_code: null,
      reviewed_by: reviewer, reviewed_at: now
    });
    transaction.create(auditRef, {
      actor_user_id: reviewer, action: 'approve_registration',
      entity_type: 'registration_request', entity_id: String(id), created_at: now
    });
    return userId;
  });
}

module.exports = {
  publicUser,
  approvedUserData,
  validateRegistrationRequest,
  findUserByEmail,
  findUserById,
  listUsers,
  createUser,
  importUserWithId,
  setUserActive,
  createAuditLog,
  createSessionWithAudit,
  deleteSessionWithAudit,
  createSession,
  findSession,
  deleteSession,
  deleteExpiredSessions,
  consumeRateLimit,
  resetRateLimit,
  createRegistrationRequest,
  listPendingRegistrationRequests,
  reviewRegistrationRequest
};
