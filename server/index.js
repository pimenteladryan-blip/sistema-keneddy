'use strict';
require('dotenv').config();
const path = require('node:path');
const express = require('express');
const helmet = require('helmet');
const { firebaseConfigured, projectId, firebaseApp } = require('./firebase');
const isProduction = process.env.NODE_ENV === 'production';
if (isProduction && !firebaseConfigured) {
  throw new Error('Firebase Admin precisa estar configurado antes de iniciar o SGVE em produção.');
}
// Firebase mode must not initialize an ephemeral SQLite database on the hosting filesystem.
const { db, audit } = firebaseConfigured ? { db: null, audit: () => {} } : require('./db');
const { getAuth } = require('firebase-admin/auth');
const firestoreAuth = require('./firestore-auth');
const firestoreSchool = require('./firestore-school');
const { hashPassword, verifyPassword, randomToken, sha256 } = require('./security');
const { randomInt } = require('node:crypto');
const { createMemoryRateLimiter } = require('./rate-limit');
const { ROLE_LABELS, RECORD_MANAGERS, USER_MANAGERS, hasRole } = require('./access');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const SESSION_HOURS = 8;
const COOKIE_NAME = 'sgve_session';
const VALID_ROLES = Object.keys(ROLE_LABELS);
if (isProduction) app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: { directives: {
  defaultSrc: ["'self'"], scriptSrc: ["'self'", 'https://www.gstatic.com'], styleSrc: ["'self'"],
  imgSrc: ["'self'", 'data:'],
  connectSrc: ["'self'", 'https://identitytoolkit.googleapis.com', 'https://securetoken.googleapis.com', 'https://www.googleapis.com'],
  frameSrc: ["'self'", 'https://svge-14ec7.firebaseapp.com'], objectSrc: ["'none'"],
  frameAncestors: ["'none'"], upgradeInsecureRequests: isProduction ? [] : null
} } }));
app.use(express.json({ limit: '20kb' }));
app.use(express.urlencoded({ extended: false, limit: '20kb' }));

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_LOGIN_ATTEMPTS = 5;
const REGISTRATION_WINDOW_MS = 60 * 60 * 1000;
const MAX_REGISTRATION_ATTEMPTS = 5;
const memoryRateLimiter = createMemoryRateLimiter({ maxBuckets: 10000 });
async function consumeAttempts(scope, keys, windowMs, maxAttempts) {
  const input = { scope, keys, windowMs, maxAttempts };
  if (firebaseConfigured) {
    const result = await firestoreAuth.consumeRateLimit(input);
    return result.allowed;
  }
  return memoryRateLimiter.consume(input);
}

async function resetAttempts(scope, keys) {
  if (firebaseConfigured) return firestoreAuth.resetRateLimit({ scope, keys });
  return memoryRateLimiter.reset({ scope, keys });
}
const VERIFICATION_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function createVerificationCode() {
  return Array.from({ length: 6 }, () => VERIFICATION_CODE_ALPHABET[randomInt(VERIFICATION_CODE_ALPHABET.length)]).join('');
}
function parseCookies(header = '') {
  return Object.fromEntries(header.split(';').map(part => {
    const index = part.indexOf('=');
    if (index < 0) return ['', ''];
    try { return [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1).trim())]; }
    catch { return ['', '']; }
  }).filter(([key]) => key));
}
function setSessionCookie(res, token) {
  const secure = isProduction ? '; Secure' : '';
  res.setHeader('Set-Cookie', COOKIE_NAME + '=' + encodeURIComponent(token) +
    '; HttpOnly; SameSite=Strict; Path=/; Max-Age=' + (SESSION_HOURS * 3600) + secure);
}
function clearSessionCookie(res) {
  const secure = isProduction ? '; Secure' : '';
  res.setHeader('Set-Cookie', COOKIE_NAME + '=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0' + secure);
}
function sameOrigin(req) {
  const origin = req.get('origin');
  if (!origin || !req.get('host')) return false;
  try {
    const parsed = new URL(origin);
    return ['http:', 'https:'].includes(parsed.protocol) &&
      parsed.host === req.get('host');
  } catch { return false; }
}
app.use(async (req, res, next) => {
  try {
    const token = parseCookies(req.headers.cookie)[COOKIE_NAME];
    if (!token || token.length > 200) return next();
    const tokenHash = sha256(token);
    const now = new Date().toISOString();
    if (!firebaseConfigured) {
      const session = db.prepare('SELECT s.id AS session_id, s.csrf_token, u.id, u.display_name, u.email, u.role, u.active FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?').get(tokenHash, now);
      if (session && session.active) {
        req.auth = { sessionId: session.session_id, sessionStore: 'sqlite', csrfToken: session.csrf_token,
          user: { id: session.id, name: session.display_name, email: session.email, role: session.role } };
        return next();
      }
    } else {
      const cloudSession = await firestoreAuth.findSession(tokenHash, now);
      if (cloudSession) {
        req.auth = { sessionId: cloudSession.session_id, sessionStore: 'firestore', tokenHash,
          csrfToken: cloudSession.csrf_token,
          user: { id: cloudSession.id, name: cloudSession.display_name, email: cloudSession.email, role: cloudSession.role } };
      }
    }
    next();
  } catch (error) { next(error); }
});
function requireAuth(req, res, next) {
  if (!req.auth) return res.status(401).json({ error: 'Faça login para continuar.' });
  next();
}
function requireCsrf(req, res, next) {
  if (!sameOrigin(req)) return res.status(403).json({ error: 'Origem não permitida.' });
  if (!req.auth || req.get('x-csrf-token') !== req.auth.csrfToken) return res.status(403).json({ error: 'Token de segurança inválido. Atualize a página.' });
  next();
}
function requireRoles(...roles) {
  return (req, res, next) => hasRole(req.auth?.user, roles) ? next() : res.status(403).json({ error: 'Seu perfil não permite esta operação.' });
}
function cleanText(value, max) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, max) : '';
}
function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;
}
function classInput(body) {
  const level = cleanText(body.level, 20);
  const grade = cleanText(body.grade, 30);
  const course = cleanText(body.course || 'regular', 20).toLowerCase();
  const section = cleanText(body.section, 12).toUpperCase();
  const schoolYear = Number(body.school_year);
  if (!['fundamental', 'medio'].includes(level) || !grade || !section ||
      !Number.isInteger(schoolYear) || schoolYear < 2020 || schoolYear > 2100 ||
      !['regular', 'adm', 'ds'].includes(course) || (level === 'fundamental' && course !== 'regular')) return null;
  return { level, grade, course, section, schoolYear };
}
function publicUser(user) {
  return { id: user.id, name: user.display_name, email: user.email, role: user.role,
    roleLabel: ROLE_LABELS[user.role], active: Boolean(user.active) };
}
async function bootstrapAdmin() {
  const email = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = String(process.env.ADMIN_PASSWORD || '');
  const name = String(process.env.ADMIN_NAME || 'Administrador').trim();
  if (!password) return;
  if (!validEmail(email) || password.length < 14) throw new Error('Configure ADMIN_EMAIL válido e ADMIN_PASSWORD com pelo menos 14 caracteres.');
  if (firebaseConfigured) {
    if (await firestoreAuth.findUserByEmail(email)) return;
    const passwordHash = await hashPassword(password);
    await firestoreAuth.createUser({ display_name: name || 'Administrador', email, password_hash: passwordHash, role: 'admin', active: true });
    console.log('Conta administrativa inicial criada no Firestore a partir das variáveis de ambiente.');
    return;
  }
  if (db.prepare('SELECT id FROM users WHERE email = ?').get(email)) return;
  const passwordHash = await hashPassword(password);
  db.prepare('INSERT INTO users (display_name, email, password_hash, role) VALUES (?, ?, ?, ?)').run(name || 'Administrador', email, passwordHash, 'admin');
  console.log('Conta administrativa inicial criada a partir das variáveis de ambiente.');
}

app.get('/api/health', (_req, res) => res.json({ status: 'ok', service: 'SGVE', environment: isProduction ? 'production' : 'development', firebaseAdmin: firebaseConfigured ? 'initialized' : 'not_configured' }));

app.post('/api/registration-requests', async (req, res, next) => {
  try {
    if (!sameOrigin(req)) return res.status(403).json({ error: 'Origem não permitida.' });
    const name = cleanText(req.body.name, 100);
    const email = String(req.body.email || '').trim().toLowerCase();
    const role = String(req.body.role || '');
    const password = String(req.body.password || '');
    if (name.length < 3 || !validEmail(email) || !['teacher', 'guardian', 'student'].includes(role) ||
        password.length < 14 || password.length > 200) {
      return res.status(400).json({ error: 'Informe nome, e-mail, perfil e senha com pelo menos 14 caracteres.' });
    }
    const allowedIp = await consumeAttempts('registration-ip', [String(req.ip || 'unknown')], REGISTRATION_WINDOW_MS, 20);
    const allowedEmail = allowedIp && await consumeAttempts('registration-email', [email], REGISTRATION_WINDOW_MS, MAX_REGISTRATION_ATTEMPTS);
    if (!allowedIp || !allowedEmail) {
      return res.status(429).json({ error: 'Muitas solicitações. Aguarde um pouco e tente novamente.' });
    }
    const existingUser = firebaseConfigured
      ? await firestoreAuth.findUserByEmail(email)
      : db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existingUser) return res.status(409).json({ error: 'Este e-mail já possui uma conta. Tente entrar ou fale com a secretaria.' });
    const previousRequest = firebaseConfigured ? null
      : db.prepare('SELECT id, status FROM registration_requests WHERE email = ?').get(email);
    if (previousRequest?.status === 'pending') {
      return res.status(409).json({ error: 'Já existe uma solicitação pendente para este e-mail.' });
    }
    const passwordHash = await hashPassword(password);
    const verificationCode = createVerificationCode();
    if (firebaseConfigured) {
      await firestoreAuth.createRegistrationRequest({ display_name: name, email, password_hash: passwordHash, role, verification_code: verificationCode });
    } else if (previousRequest?.status === 'rejected') {
      db.prepare("UPDATE registration_requests SET display_name = ?, password_hash = ?, role = ?, verification_code = ?, status = 'pending', reviewed_by = NULL, reviewed_at = NULL, created_at = CURRENT_TIMESTAMP WHERE id = ?")
        .run(name, passwordHash, role, verificationCode, previousRequest.id);
    } else {
      db.prepare('INSERT INTO registration_requests (display_name, email, password_hash, role, verification_code) VALUES (?, ?, ?, ?, ?)').run(name, email, passwordHash, role, verificationCode);
    }
    res.status(201).json({ message: 'Solicitação enviada. Informe o código ao administrador para conferir seu cadastro. A conta só será liberada após a aprovação.', verificationCode });
  } catch (error) {
    if (String(error.message).includes('UNIQUE') || error.code === 'already-pending' || error.code === 'already-exists') return res.status(409).json({ error: 'Já existe uma solicitação para este e-mail.' });
    next(error);
  }
});
app.post('/api/auth/login', async (req, res, next) => {
  try {
    if (!sameOrigin(req)) return res.status(403).json({ error: 'Origem não permitida.' });
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const requestedRole = typeof req.body.role === 'string' ? req.body.role : '';
    if (!VALID_ROLES.includes(requestedRole)) return res.status(400).json({ error: 'Selecione um perfil válido para entrar.' });
    if (!email || !password || email.length > 254 || password.length > 200) return res.status(400).json({ error: 'Informe e-mail e senha válidos.' });
    const now = Date.now();
    const allowedIp = await consumeAttempts('login-ip', [String(req.ip || 'unknown')], LOGIN_WINDOW_MS, 60);
    const allowedEmail = allowedIp && await consumeAttempts('login-email', [email], LOGIN_WINDOW_MS, MAX_LOGIN_ATTEMPTS);
    if (!allowedIp || !allowedEmail) return res.status(429).json({ error: 'Muitas tentativas. Aguarde alguns minutos.' });
    const user = firebaseConfigured
      ? await firestoreAuth.findUserByEmail(email)
      : db.prepare('SELECT id, display_name, email, password_hash, role, active FROM users WHERE email = ?').get(email);
    const valid = user && (firebaseConfigured ? user.active === true : Boolean(user.active)) && await verifyPassword(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
    if (requestedRole && user.role !== requestedRole) return res.status(403).json({ error: 'O perfil selecionado não corresponde a esta conta.' });
    await resetAttempts('login-email', [email]);
    const token = randomToken(32);
    const csrfToken = randomToken(24);
    const expiresAt = new Date(now + SESSION_HOURS * 3600000).toISOString();
    if (firebaseConfigured) {
      await firestoreAuth.deleteExpiredSessions(new Date(now).toISOString());
      await firestoreAuth.createSessionWithAudit({ token_hash: sha256(token), csrf_token: csrfToken,
        user_id: Number(user.id), expires_at: expiresAt, action: 'login_password' });
    } else {
      db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(new Date(now).toISOString());
      db.prepare('INSERT INTO sessions (token_hash, csrf_token, user_id, expires_at) VALUES (?, ?, ?, ?)').run(sha256(token), csrfToken, user.id, expiresAt);
      audit(user.id, 'login', 'user', user.id);
    }
    setSessionCookie(res, token);
    res.json({ user: { id: user.id, name: user.display_name, email: user.email, role: user.role, roleLabel: ROLE_LABELS[user.role] }, csrfToken });
  } catch (error) { next(error); }
});
app.post('/api/auth/google', async (req, res, next) => {
  try {
    if (!sameOrigin(req)) return res.status(403).json({ error: 'Origem não permitida.' });
    if (!firebaseConfigured) return res.status(503).json({ error: 'Login Google ainda não está configurado no servidor.' });
    const allowedIp = await consumeAttempts('google-login-ip', [String(req.ip || 'unknown')], LOGIN_WINDOW_MS, 60);
    if (!allowedIp) return res.status(429).json({ error: 'Muitas tentativas. Aguarde alguns minutos.' });
    const idToken = typeof req.body.idToken === 'string' ? req.body.idToken : '';
    if (!idToken || idToken.length > 12000) return res.status(400).json({ error: 'Token Google ausente ou inválido.' });
    const decoded = await getAuth(firebaseApp).verifyIdToken(idToken, true);
    if (decoded.aud !== projectId || decoded.iss !== 'https://securetoken.google.com/' + projectId ||
        decoded.firebase?.sign_in_provider !== 'google.com' || decoded.email_verified !== true ||
        typeof decoded.email !== 'string') {
      return res.status(401).json({ error: 'A conta Google precisa ter e-mail verificado.' });
    }
    const user = await firestoreAuth.findUserByEmail(decoded.email);
    const requestedRole = typeof req.body.role === 'string' ? req.body.role : '';
    if (!requestedRole || !ROLE_LABELS[requestedRole]) return res.status(400).json({ error: 'Selecione um perfil válido para entrar.' });
    if (user?.role !== requestedRole) {
      return res.status(403).json({ error: 'O perfil selecionado não corresponde a esta conta.' });
    }
    if (!user || user.active !== true || !ROLE_LABELS[user.role]) {
      return res.status(403).json({ error: 'Esta conta ainda não foi autorizada pela administração do SGVE.' });
    }
    const now = Date.now();
    const token = randomToken(32);
    const csrfToken = randomToken(24);
    const expiresAt = new Date(now + SESSION_HOURS * 3600000).toISOString();
    await firestoreAuth.deleteExpiredSessions(new Date(now).toISOString());
    await firestoreAuth.createSessionWithAudit({
      token_hash: sha256(token), csrf_token: csrfToken,
      user_id: Number(user.id), expires_at: expiresAt,
      action: 'login_google'
    });
    setSessionCookie(res, token);
    res.json({ user: { id: Number(user.id), name: user.display_name, email: user.email,
      role: user.role, roleLabel: ROLE_LABELS[user.role] }, csrfToken });
  } catch (error) {
    if (error.code === 'auth/id-token-expired' || error.code === 'auth/argument-error' ||
        error.code === 'auth/invalid-id-token' || error.code === 'auth/revoked-id-token') {
      return res.status(401).json({ error: 'A sessão Google expirou. Entre novamente.' });
    }
    next(error);
  }
});
app.get('/api/auth/me', requireAuth, (req, res) => res.json({ user: { ...req.auth.user, roleLabel: ROLE_LABELS[req.auth.user.role] }, csrfToken: req.auth.csrfToken }));
app.post('/api/auth/logout', requireAuth, requireCsrf, async (req, res, next) => {
  try {
    if (req.auth.sessionStore === 'firestore') {
      await firestoreAuth.deleteSessionWithAudit(req.auth.tokenHash, req.auth.user.id);
    } else {
      db.prepare('DELETE FROM sessions WHERE id = ?').run(req.auth.sessionId);
      audit(req.auth.user.id, 'logout', 'user', req.auth.user.id);
    }
    clearSessionCookie(res);
    res.json({ ok: true });
  } catch (error) { next(error); }
});

app.get('/api/classes', requireAuth, async (_req, res, next) => {
  try {
    if (firebaseConfigured) return res.json({ classes: await firestoreSchool.listClasses() });
    const rows = db.prepare('SELECT id, level, grade, course, section, school_year, active FROM classes WHERE active = 1 ORDER BY school_year DESC, level, grade, course, section').all();
    res.json({ classes: rows });
  } catch (error) { next(error); }
});
app.post('/api/classes', requireAuth, requireCsrf, requireRoles(...RECORD_MANAGERS), async (req, res, next) => {
  const data = classInput(req.body);
  if (!data) return res.status(400).json({ error: 'Confira etapa, ano/série, curso, turma e ano letivo.' });
  try {
    if (firebaseConfigured) {
      const id = await firestoreSchool.createClass(data, req.auth.user.id);
      return res.status(201).json({ id, message: 'Turma cadastrada.' });
    }
    const result = db.prepare('INSERT INTO classes (level, grade, course, section, school_year) VALUES (?, ?, ?, ?, ?)').run(data.level, data.grade, data.course, data.section, data.schoolYear);
    audit(req.auth.user.id, 'create', 'class', result.lastInsertRowid);
    res.status(201).json({ id: Number(result.lastInsertRowid), message: 'Turma cadastrada.' });
  } catch (error) {
    if (String(error.message).includes('UNIQUE') || error.code === 'already-exists') return res.status(409).json({ error: 'Essa turma já está cadastrada para o ano letivo.' });
    next(error);
  }
});

app.get('/api/students', requireAuth, async (req, res, next) => {
  try {
    if (firebaseConfigured) return res.json({ students: await firestoreSchool.listStudentsForUser(req.auth.user) });
    let rows;
    if (hasRole(req.auth.user, RECORD_MANAGERS)) {
      rows = db.prepare('SELECT s.id, s.full_name, s.class_id, c.grade, c.course, c.section, c.level, s.active FROM students s JOIN classes c ON c.id = s.class_id WHERE s.active = 1 ORDER BY s.full_name LIMIT 500').all();
    } else if (req.auth.user.role === 'guardian') {
      rows = db.prepare('SELECT s.id, s.full_name, s.class_id, c.grade, c.course, c.section, c.level, s.active FROM students s JOIN classes c ON c.id = s.class_id JOIN student_guardians sg ON sg.student_id = s.id WHERE sg.guardian_user_id = ? AND s.active = 1 ORDER BY s.full_name').all(req.auth.user.id);
    } else if (req.auth.user.role === 'student') {
      rows = db.prepare('SELECT s.id, s.full_name, s.class_id, c.grade, c.course, c.section, c.level, s.active FROM students s JOIN classes c ON c.id = s.class_id WHERE s.user_id = ? AND s.active = 1').all(req.auth.user.id);
    } else return res.status(403).json({ error: 'Seu perfil não permite consultar estudantes.' });
    res.json({ students: rows });
  } catch (error) { res.status(error.code === 'forbidden' ? 403 : 500).json({ error: error.code === 'forbidden' ? error.message : 'Não foi possível consultar estudantes.' }); }
});
app.post('/api/students', requireAuth, requireCsrf, requireRoles(...RECORD_MANAGERS), async (req, res, next) => {
  const fullName = cleanText(req.body.full_name, 120);
  const classId = Number(req.body.class_id);
  if (fullName.length < 3 || !Number.isInteger(classId) || classId < 1) return res.status(400).json({ error: 'Informe nome e turma válidos.' });
  try {
    if (firebaseConfigured) {
      const id = await firestoreSchool.createStudent(fullName, classId, req.auth.user.id);
      if (!id) return res.status(400).json({ error: 'A turma selecionada não existe ou está inativa.' });
      return res.status(201).json({ id, message: 'Estudante cadastrado.' });
    }
    if (!db.prepare('SELECT id FROM classes WHERE id = ? AND active = 1').get(classId)) return res.status(400).json({ error: 'A turma selecionada não existe ou está inativa.' });
    const result = db.prepare('INSERT INTO students (full_name, class_id) VALUES (?, ?)').run(fullName, classId);
    audit(req.auth.user.id, 'create', 'student', result.lastInsertRowid);
    res.status(201).json({ id: Number(result.lastInsertRowid), message: 'Estudante cadastrado.' });
  } catch (error) { next(error); }
});
app.post('/api/students/:id/account', requireAuth, requireCsrf, requireRoles(...RECORD_MANAGERS), async (req, res, next) => {
  const studentId = Number(req.params.id);
  const email = String(req.body.email || '').trim().toLowerCase();
  if (!Number.isSafeInteger(studentId) || studentId < 1 || !validEmail(email)) {
    return res.status(400).json({ error: 'Informe um estudante e e-mail de conta válidos.' });
  }
  let transactionOpen = false;
  try {
    if (firebaseConfigured) {
      const result = await firestoreSchool.linkStudentAccount(studentId, email, req.auth.user.id);
      if (result.error === 'student-account-not-found') return res.status(404).json({ error: 'Conta ativa de estudante não encontrada.' });
      if (result.error === 'student-not-found') return res.status(404).json({ error: 'Estudante não encontrado ou inativo.' });
      if (result.error === 'student-already-linked') return res.status(409).json({ error: 'Este cadastro já está vinculado a outra conta.' });
      if (result.error === 'account-already-linked') return res.status(409).json({ error: 'Esta conta já está vinculada a outro estudante.' });
      return res.json({ message: result.changed ? 'Conta vinculada ao estudante.' : 'Esta conta já estava vinculada ao estudante.' });
    }
    db.exec('BEGIN IMMEDIATE');
    transactionOpen = true;
    const fail = (status, message) => {
      db.exec('ROLLBACK');
      transactionOpen = false;
      return res.status(status).json({ error: message });
    };
    const student = db.prepare('SELECT id, user_id FROM students WHERE id = ? AND active = 1').get(studentId);
    const account = db.prepare("SELECT id FROM users WHERE email = ? AND role = 'student' AND active = 1").get(email);
    if (!student) return fail(404, 'Estudante não encontrado ou inativo.');
    if (!account) return fail(404, 'Conta ativa de estudante não encontrada.');
    if (Number(student.user_id) === Number(account.id)) {
      db.exec('COMMIT');
      transactionOpen = false;
      return res.json({ message: 'Esta conta já estava vinculada ao estudante.' });
    }
    if (student.user_id != null) return fail(409, 'Este cadastro já está vinculado a outra conta.');
    const other = db.prepare('SELECT id FROM students WHERE user_id = ? AND id <> ?').get(account.id, studentId);
    if (other) return fail(409, 'Esta conta já está vinculada a outro estudante.');
    db.prepare('UPDATE students SET user_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id IS NULL').run(account.id, studentId);
    audit(req.auth.user.id, 'link_student_account', 'student', studentId);
    db.exec('COMMIT');
    transactionOpen = false;
    return res.json({ message: 'Conta vinculada ao estudante.' });
  } catch (error) {
    if (transactionOpen) {
      try { db.exec('ROLLBACK'); } catch {}
    }
    if (String(error.message).includes('UNIQUE constraint failed: students.user_id')) {
      return res.status(409).json({ error: 'Esta conta já está vinculada a outro estudante.' });
    }
    next(error);
  }
});
app.post('/api/students/:id/guardians', requireAuth, requireCsrf, requireRoles(...RECORD_MANAGERS), async (req, res, next) => {
  const studentId = Number(req.params.id);
  const email = String(req.body.email || '').trim().toLowerCase();
  const relationship = cleanText(req.body.relationship, 40);
  if (!Number.isInteger(studentId) || studentId < 1 || !validEmail(email)) return res.status(400).json({ error: 'Informe um estudante e e-mail de responsável válidos.' });
  try {
    if (firebaseConfigured) {
      const linked = await firestoreSchool.linkGuardian(studentId, email, relationship, req.auth.user.id);
      if (!linked) return res.status(404).json({ error: 'Estudante ou conta de responsável não encontrada.' });
      return res.json({ message: 'Responsável vinculado ao estudante.' });
    }
    const student = db.prepare('SELECT id FROM students WHERE id = ? AND active = 1').get(studentId);
    const guardian = db.prepare("SELECT id FROM users WHERE email = ? AND role = 'guardian' AND active = 1").get(email);
    if (!student || !guardian) return res.status(404).json({ error: 'Estudante ou conta de responsável não encontrada.' });
    const linkedGuardian = db.prepare('INSERT OR IGNORE INTO student_guardians (student_id, guardian_user_id, relationship_label) VALUES (?, ?, ?)').run(studentId, guardian.id, relationship || null);
    if (linkedGuardian.changes) audit(req.auth.user.id, 'link_guardian', 'student', studentId);
    res.json({ message: 'Responsável vinculado ao estudante.' });
  } catch (error) { next(error); }
});

app.post('/api/users', requireAuth, requireCsrf, requireRoles(...USER_MANAGERS), async (req, res, next) => {
  try {
    const name = cleanText(req.body.name, 100);
    const email = String(req.body.email || '').trim().toLowerCase();
    const role = String(req.body.role || '');
    const password = String(req.body.password || '');
    if (name.length < 3 || !validEmail(email) || !VALID_ROLES.includes(role) || password.length < 14 || password.length > 200) return res.status(400).json({ error: 'Informe nome, e-mail, perfil e senha com pelo menos 14 caracteres.' });
    if (req.auth.user.role === 'secretariat' && !['teacher', 'guardian', 'student'].includes(role)) return res.status(403).json({ error: 'A secretaria não pode criar contas administrativas ou de direção.' });
    if (req.auth.user.role === 'direction' && role === 'admin') return res.status(403).json({ error: 'Somente um administrador pode criar outro administrador.' });
    const passwordHash = await hashPassword(password);
    if (firebaseConfigured) {
      const id = await firestoreAuth.createUser({ display_name: name, email, password_hash: passwordHash, role, active: true, actor_user_id: req.auth.user.id });
      return res.status(201).json({ user: { id: Number(id), name, email, role, roleLabel: ROLE_LABELS[role], active: true }, message: 'Conta criada.' });
    }
    const result = db.prepare('INSERT INTO users (display_name, email, password_hash, role) VALUES (?, ?, ?, ?)').run(name, email, passwordHash, role);
    audit(req.auth.user.id, 'create', 'user', result.lastInsertRowid);
    res.status(201).json({ user: { id: Number(result.lastInsertRowid), name, email, role, roleLabel: ROLE_LABELS[role] }, message: 'Conta criada.' });
  } catch (error) {
    if (String(error.message).includes('UNIQUE')) return res.status(409).json({ error: 'Já existe uma conta com esse e-mail.' });
    next(error);
  }
});
app.get('/api/registration-requests', requireAuth, requireRoles('admin'), async (_req, res, next) => {
  try {
    if (firebaseConfigured) {
      const requests = await firestoreAuth.listPendingRegistrationRequests();
      return res.json({ requests: requests.map(item => ({ id: item.id, name: item.display_name, email: item.email, role: item.role, verification_code: item.verification_code, status: item.status, created_at: item.created_at, roleLabel: ROLE_LABELS[item.role] })) });
    }
    const requests = db.prepare("SELECT id, display_name AS name, email, role, verification_code, status, created_at FROM registration_requests WHERE status = 'pending' ORDER BY created_at ASC LIMIT 200").all();
    res.json({ requests: requests.map(item => ({ ...item, roleLabel: ROLE_LABELS[item.role] })) });
  } catch (error) { next(error); }
});
app.post('/api/registration-requests/:id/approve', requireAuth, requireCsrf, requireRoles('admin'), async (req, res, next) => {
  if (firebaseConfigured) {
    try {
      const id = req.params.id;
      if (!/^\d+$/.test(id) || Number(id) < 1) return res.status(400).json({ error: 'Solicitação inválida.' });
      const userId = await firestoreAuth.reviewRegistrationRequest(id, req.auth.user.id, 'approved');
      return res.json({ message: 'Cadastro aprovado. A pessoa já pode entrar com o e-mail e a senha cadastrados.', userId });
    } catch (error) {
      if (error.code === 'not-found') return res.status(404).json({ error: 'Solicitação não encontrada ou já analisada.' });
      if (error.code === 'already-exists') return res.status(409).json({ error: 'Já existe uma conta com este e-mail.' });
      return next(error);
    }
  }
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: 'Solicitação inválida.' });
  const request = db.prepare("SELECT id, display_name, email, password_hash, role FROM registration_requests WHERE id = ? AND status = 'pending'").get(id);
  if (!request || !request.password_hash) return res.status(404).json({ error: 'Solicitação não encontrada ou já analisada.' });
  if (db.prepare('SELECT id FROM users WHERE email = ?').get(request.email)) return res.status(409).json({ error: 'Já existe uma conta com este e-mail.' });
  db.exec('BEGIN IMMEDIATE');
  try {
    const created = db.prepare('INSERT INTO users (display_name, email, password_hash, role) VALUES (?, ?, ?, ?)').run(request.display_name, request.email, request.password_hash, request.role);
    db.prepare("UPDATE registration_requests SET status = 'approved', password_hash = NULL, verification_code = '', reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'pending'").run(req.auth.user.id, id);
    audit(req.auth.user.id, 'approve_registration', 'registration_request', id);
    db.exec('COMMIT');
    res.json({ message: 'Cadastro aprovado. A pessoa já pode entrar com o e-mail e a senha cadastrados.', userId: Number(created.lastInsertRowid) });
  } catch (error) {
    db.exec('ROLLBACK');
    if (String(error.message).includes('UNIQUE')) return res.status(409).json({ error: 'Já existe uma conta com este e-mail.' });
    throw error;
  }
});
app.post('/api/registration-requests/:id/reject', requireAuth, requireCsrf, requireRoles('admin'), async (req, res, next) => {
  if (firebaseConfigured) {
    try {
      const id = req.params.id;
      if (!/^\d+$/.test(id) || Number(id) < 1) return res.status(400).json({ error: 'Solicitação inválida.' });
      await firestoreAuth.reviewRegistrationRequest(id, req.auth.user.id, 'rejected');
      return res.json({ message: 'Solicitação rejeitada.' });
    } catch (error) {
      if (error.code === 'not-found') return res.status(404).json({ error: 'Solicitação não encontrada ou já analisada.' });
      return next(error);
    }
  }
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: 'Solicitação inválida.' });
  const result = db.prepare("UPDATE registration_requests SET status = 'rejected', password_hash = NULL, verification_code = '', reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'pending'").run(req.auth.user.id, id);
  if (!result.changes) return res.status(404).json({ error: 'Solicitação não encontrada ou já analisada.' });
  audit(req.auth.user.id, 'reject_registration', 'registration_request', id);
  res.json({ message: 'Solicitação rejeitada.' });
});
app.get('/api/linkable-users', requireAuth, requireRoles(...RECORD_MANAGERS), async (_req, res, next) => {
  try {
    if (firebaseConfigured) {
      const users = await firestoreAuth.listUsers(300);
      return res.json({ users: users.filter(user => user.active && ['teacher', 'guardian'].includes(user.role))
        .map(user => ({ id: Number(user.id), name: user.display_name, email: user.email, role: user.role, active: true })) });
    }
    const rows = db.prepare("SELECT id, display_name, email, role, active FROM users WHERE active = 1 AND role IN ('teacher', 'guardian') ORDER BY display_name LIMIT 300").all();
    return res.json({ users: rows.map(user => ({ id: Number(user.id), name: user.display_name, email: user.email, role: user.role, active: Boolean(user.active) })) });
  } catch (error) { next(error); }
});
app.get('/api/users', requireAuth, requireRoles('admin', 'direction'), async (_req, res, next) => {
  try {
    if (firebaseConfigured) {
      const users = await firestoreAuth.listUsers(300);
      return res.json({ users: users.map(user => ({ id: user.id, name: user.display_name, email: user.email, role: user.role, roleLabel: ROLE_LABELS[user.role], active: user.active })) });
    }
    const rows = db.prepare('SELECT id, display_name, email, role, active FROM users ORDER BY display_name LIMIT 300').all();
    res.json({ users: rows.map(user => ({ id: user.id, name: user.display_name, email: user.email, role: user.role, roleLabel: ROLE_LABELS[user.role], active: Boolean(user.active) })) });
  } catch (error) { next(error); }
});


function tripInput(body) {
  const title = cleanText(body.title, 120);
  const destination = cleanText(body.destination, 160);
  const purpose = cleanText(body.educational_purpose, 500);
  const departure = new Date(body.departure_at);
  const returning = new Date(body.return_at);
  const capacity = Number(body.capacity);
  if (title.length < 3 || destination.length < 2 || purpose.length < 8 ||
      !Number.isFinite(departure.getTime()) || !Number.isFinite(returning.getTime()) ||
      returning <= departure || !Number.isInteger(capacity) || capacity < 1 || capacity > 5000) return null;
  return { title, destination, purpose, departure: departure.toISOString(), returning: returning.toISOString(), capacity };
}
function vehicleInput(body) {
  const name = cleanText(body.name, 40);
  const type = String(body.type || '');
  const capacity = Number(body.capacity);
  if (name.length < 3 || !['Ônibus', 'Micro-ônibus', 'Van'].includes(type) ||
      !Number.isSafeInteger(capacity) || capacity < 1 || capacity > 100) return null;
  return { name, type, capacity };
}
function driverInput(body) {
  const name = cleanText(body.name, 80);
  if (name.length < 3) return null;
  return { name };
}
function getTripStatusLabel(status) {
  return ({ draft: 'Rascunho', pending_approval: 'Aguardando aprovação', approved: 'Aprovada',
    open: 'Inscrições abertas', completed: 'Concluída', cancelled: 'Cancelada' })[status] || status;
}
app.get('/api/trips', requireAuth, async (req, res, next) => {
  try {
    if (firebaseConfigured) {
      return res.json({ trips: await firestoreSchool.listTripsForUser(req.auth.user) });
    }
    const user = req.auth.user;
    let rows;
    const select = hasRole(user, RECORD_MANAGERS)
      ? 'SELECT DISTINCT t.id, t.title, t.destination, t.educational_purpose, t.departure_at, t.return_at, t.capacity, t.vehicle_id, v.name AS vehicle_name, d.name AS driver_name, t.status, (SELECT COUNT(*) FROM trip_students ts WHERE ts.trip_id = t.id) AS participant_count FROM trips t LEFT JOIN vehicles v ON v.id = t.vehicle_id LEFT JOIN drivers d ON d.id = t.driver_id'
      : 'SELECT DISTINCT t.id, t.title, t.destination, t.educational_purpose, t.departure_at, t.return_at, t.capacity, t.vehicle_id, v.name AS vehicle_name, t.status, (SELECT COUNT(*) FROM trip_students ts WHERE ts.trip_id = t.id) AS participant_count FROM trips t LEFT JOIN vehicles v ON v.id = t.vehicle_id';
    if (hasRole(user, RECORD_MANAGERS)) {
      rows = db.prepare(select + ' ORDER BY t.departure_at DESC LIMIT 100').all();
    } else if (user.role === 'teacher') {
      rows = db.prepare(select + ' JOIN trip_staff tsf ON tsf.trip_id = t.id WHERE tsf.user_id = ? ORDER BY t.departure_at DESC').all(user.id);
    } else if (user.role === 'guardian') {
      rows = db.prepare(select + ' JOIN trip_students ts ON ts.trip_id = t.id JOIN students s ON s.id = ts.student_id JOIN student_guardians sg ON sg.student_id = s.id WHERE sg.guardian_user_id = ? ORDER BY t.departure_at DESC').all(user.id);
    } else if (user.role === 'student') {
      rows = db.prepare(select + ' JOIN trip_students ts ON ts.trip_id = t.id JOIN students s ON s.id = ts.student_id WHERE s.user_id = ? ORDER BY t.departure_at DESC').all(user.id);
    } else return res.status(403).json({ error: 'Seu perfil não permite consultar viagens.' });
    res.json({ trips: rows.map(row => ({ ...row, statusLabel: getTripStatusLabel(row.status) })) });
  } catch (error) {
    if (error.code === 'forbidden') return res.status(403).json({ error: error.message });
    next(error);
  }
});
app.post('/api/trips', requireAuth, requireCsrf, requireRoles(...RECORD_MANAGERS), async (req, res, next) => {
  const data = tripInput(req.body);
  if (!data) return res.status(400).json({ error: 'Confira título, destino, objetivo, horários e capacidade da viagem.' });
  try {
    if (firebaseConfigured) {
      const id = await firestoreSchool.createTrip(data, req.auth.user.id);
      return res.status(201).json({ id, message: 'Viagem criada como rascunho.' });
    }
    const result = db.prepare('INSERT INTO trips (title, destination, educational_purpose, departure_at, return_at, capacity, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)').
      run(data.title, data.destination, data.purpose, data.departure, data.returning, data.capacity, req.auth.user.id);
    audit(req.auth.user.id, 'create', 'trip', result.lastInsertRowid);
    res.status(201).json({ id: Number(result.lastInsertRowid), message: 'Viagem criada como rascunho.' });
  } catch (error) { next(error); }
});
app.post('/api/trips/:id/classes', requireAuth, requireCsrf, requireRoles(...RECORD_MANAGERS), async (req, res, next) => {
  const tripId = Number(req.params.id);
  const classId = Number(req.body.class_id);
  if (!Number.isInteger(tripId) || tripId < 1 || !Number.isInteger(classId) || classId < 1) return res.status(400).json({ error: 'Viagem ou turma inválida.' });
  try {
    if (firebaseConfigured) {
      const result = await firestoreSchool.linkTripClass(tripId, classId, req.auth.user.id);
      if (result.error === 'not-found' || result.error === 'target-not-found') return res.status(404).json({ error: 'Viagem ou turma não encontrada.' });
      if (result.error === 'not-draft') return res.status(409).json({ error: 'Turmas só podem ser vinculadas enquanto a viagem estiver em rascunho.' });
      return res.json({ message: 'Turma vinculada à viagem.' });
    }
    const trip = db.prepare("SELECT id, status FROM trips WHERE id = ?").get(tripId);
    const schoolClass = db.prepare('SELECT id FROM classes WHERE id = ? AND active = 1').get(classId);
    if (!trip || !schoolClass) return res.status(404).json({ error: 'Viagem ou turma não encontrada.' });
    if (trip.status !== 'draft') return res.status(409).json({ error: 'Turmas só podem ser vinculadas enquanto a viagem estiver em rascunho.' });
    const linkedClass = db.prepare('INSERT OR IGNORE INTO trip_classes (trip_id, class_id) VALUES (?, ?)').run(tripId, classId);
    if (linkedClass.changes) audit(req.auth.user.id, 'link_class', 'trip', tripId);
    res.json({ message: 'Turma vinculada à viagem.' });
  } catch (error) { next(error); }
});
app.post('/api/trips/:id/students', requireAuth, requireCsrf, requireRoles(...RECORD_MANAGERS), async (req, res, next) => {
  const tripId = Number(req.params.id);
  const studentId = Number(req.body.student_id);
  if (!Number.isInteger(tripId) || tripId < 1 || !Number.isInteger(studentId) || studentId < 1) return res.status(400).json({ error: 'Viagem ou estudante inválido.' });
  try {
    if (firebaseConfigured) {
      const result = await firestoreSchool.linkTripStudent(tripId, studentId, req.auth.user.id);
      if (result.error === 'not-found' || result.error === 'class-not-found') return res.status(404).json({ error: 'Viagem, estudante ou turma não encontrado.' });
      if (result.error === 'not-draft') return res.status(409).json({ error: 'Participantes só podem ser vinculados enquanto a viagem estiver em rascunho.' });
      if (result.error === 'class-not-linked') return res.status(400).json({ error: 'Vincule primeiro a turma do estudante à viagem.' });
      if (result.error === 'capacity') return res.status(409).json({ error: 'A capacidade da viagem foi atingida.' });
      if (result.error) return res.status(409).json({ error: 'Não foi possível vincular o estudante à viagem.' });
      return res.json({ message: 'Estudante vinculado à viagem.' });
    }
    const trip = db.prepare("SELECT id, status, capacity FROM trips WHERE id = ?").get(tripId);
    const student = db.prepare('SELECT id, class_id FROM students WHERE id = ? AND active = 1').get(studentId);
    if (!trip || !student) return res.status(404).json({ error: 'Viagem ou estudante não encontrado.' });
    if (trip.status !== 'draft') return res.status(409).json({ error: 'Participantes só podem ser vinculados enquanto a viagem estiver em rascunho.' });
    if (!db.prepare('SELECT trip_id FROM trip_classes WHERE trip_id = ? AND class_id = ?').get(tripId, student.class_id)) return res.status(400).json({ error: 'Vincule primeiro a turma do estudante à viagem.' });
    const exists = db.prepare('SELECT 1 AS found FROM trip_students WHERE trip_id = ? AND student_id = ?').get(tripId, studentId);
    const count = db.prepare('SELECT COUNT(*) AS total FROM trip_students WHERE trip_id = ?').get(tripId).total;
    if (!exists && count >= trip.capacity) return res.status(409).json({ error: 'A capacidade da viagem foi atingida.' });
    const linkedStudent = db.prepare("INSERT OR IGNORE INTO trip_students (trip_id, student_id) VALUES (?, ?)").run(tripId, studentId);
    if (linkedStudent.changes) audit(req.auth.user.id, 'link_student', 'trip', tripId);
    res.json({ message: 'Estudante vinculado à viagem.' });
  } catch (error) { next(error); }
});
app.post('/api/trips/:id/staff', requireAuth, requireCsrf, requireRoles(...RECORD_MANAGERS), async (req, res, next) => {
  const tripId = Number(req.params.id);
  const userId = Number(req.body.user_id);
  if (!Number.isInteger(tripId) || tripId < 1 || !Number.isInteger(userId) || userId < 1) return res.status(400).json({ error: 'Viagem ou usuário inválido.' });
  try {
    if (firebaseConfigured) {
      const result = await firestoreSchool.assignTripTeacher(tripId, userId, req.auth.user.id);
      if (result.error === 'not-found' || result.error === 'target-not-found') return res.status(404).json({ error: 'Viagem ou professor não encontrado.' });
      if (result.error === 'not-draft') return res.status(409).json({ error: 'Equipe só pode ser alterada enquanto a viagem estiver em rascunho.' });
      return res.json({ message: 'Professor vinculado à viagem.' });
    }
    const trip = db.prepare('SELECT id, status FROM trips WHERE id = ?').get(tripId);
    const teacher = db.prepare("SELECT id FROM users WHERE id = ? AND role = 'teacher' AND active = 1").get(userId);
    if (!trip || !teacher) return res.status(404).json({ error: 'Viagem ou professor não encontrado.' });
    if (trip.status !== 'draft') return res.status(409).json({ error: 'Equipe só pode ser alterada enquanto a viagem estiver em rascunho.' });
    const assignedTeacher = db.prepare('INSERT OR IGNORE INTO trip_staff (trip_id, user_id) VALUES (?, ?)').run(tripId, userId);
    if (assignedTeacher.changes) audit(req.auth.user.id, 'assign_teacher', 'trip', tripId);
    res.json({ message: 'Professor vinculado à viagem.' });
  } catch (error) { next(error); }
});
app.post('/api/trips/:id/submit', requireAuth, requireCsrf, requireRoles(...RECORD_MANAGERS), async (req, res, next) => {
  const tripId = Number(req.params.id);
  if (!Number.isInteger(tripId) || tripId < 1) return res.status(400).json({ error: 'Viagem inválida.' });
  try {
    if (firebaseConfigured) {
      const result = await firestoreSchool.submitTrip(tripId, req.auth.user.id);
      if (result.error === 'not-found') return res.status(404).json({ error: 'Viagem não encontrada.' });
      if (result.error === 'no-classes') return res.status(400).json({ error: 'Vincule pelo menos uma turma antes de enviar para aprovação.' });
      if (result.error) return res.status(409).json({ error: 'Somente rascunhos podem ser enviados para aprovação.' });
      return res.json({ message: 'Viagem enviada para aprovação da direção.' });
    }
    const trip = db.prepare('SELECT id, status FROM trips WHERE id = ?').get(tripId);
    if (!trip) return res.status(404).json({ error: 'Viagem não encontrada.' });
    if (trip.status !== 'draft') return res.status(409).json({ error: 'Somente rascunhos podem ser enviados para aprovação.' });
    const classes = db.prepare('SELECT COUNT(*) AS total FROM trip_classes WHERE trip_id = ?').get(tripId).total;
    if (!classes) return res.status(400).json({ error: 'Vincule pelo menos uma turma antes de enviar para aprovação.' });
    db.prepare("UPDATE trips SET status = 'pending_approval', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(tripId);
    audit(req.auth.user.id, 'submit_for_approval', 'trip', tripId);
    res.json({ message: 'Viagem enviada para aprovação da direção.' });
  } catch (error) { next(error); }
});
app.post('/api/trips/:id/approve', requireAuth, requireCsrf, requireRoles('admin', 'direction'), async (req, res, next) => {
  const tripId = Number(req.params.id);
  if (!Number.isInteger(tripId) || tripId < 1) return res.status(400).json({ error: 'Viagem inválida.' });
  try {
    if (firebaseConfigured) {
      const result = await firestoreSchool.approveTrip(tripId, req.auth.user.id);
      if (result.error === 'not-found') return res.status(404).json({ error: 'Viagem não encontrada.' });
      if (result.error) return res.status(409).json({ error: 'A viagem não está aguardando aprovação.' });
      return res.json({ message: 'Viagem aprovada.' });
    }
    const trip = db.prepare("SELECT id, status FROM trips WHERE id = ?").get(tripId);
    if (!trip) return res.status(404).json({ error: 'Viagem não encontrada.' });
    if (trip.status !== 'pending_approval') return res.status(409).json({ error: 'A viagem não está aguardando aprovação.' });
    db.prepare("UPDATE trips SET status = 'approved', approved_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(req.auth.user.id, tripId);
    audit(req.auth.user.id, 'approve', 'trip', tripId);
    res.json({ message: 'Viagem aprovada.' });
  } catch (error) { next(error); }
});



app.get('/api/vehicles', requireAuth, requireRoles(...RECORD_MANAGERS), async (req, res, next) => {
  try {
    if (firebaseConfigured) {
      return res.json({ vehicles: await firestoreSchool.listVehicles() });
    }
    const vehicles = db.prepare(
      'SELECT id, name, type, capacity FROM vehicles WHERE active = 1 ORDER BY name'
    ).all();
    return res.json({ vehicles });
  } catch (error) { next(error); }
});

app.post('/api/vehicles', requireAuth, requireCsrf, requireRoles(...RECORD_MANAGERS), async (req, res, next) => {
  const data = vehicleInput(req.body);
  if (!data) return res.status(400).json({ error: 'Informe identificação, tipo e capacidade válidos (1 a 100 lugares).' });
  try {
    if (firebaseConfigured) {
      const id = await firestoreSchool.createVehicle(data, req.auth.user.id);
      return res.status(201).json({ id, message: 'Veículo cadastrado.' });
    }
    const result = db.prepare(
      'INSERT INTO vehicles (name, type, capacity, created_by) VALUES (?, ?, ?, ?)'
    ).run(data.name, data.type, data.capacity, req.auth.user.id);
    audit(req.auth.user.id, 'create', 'vehicle', result.lastInsertRowid);
    return res.status(201).json({ id: Number(result.lastInsertRowid), message: 'Veículo cadastrado.' });
  } catch (error) {
    if (error.code === 'already-exists' || /UNIQUE constraint failed: vehicles\.name/i.test(error.message)) {
      return res.status(409).json({ error: 'Já existe um veículo com essa identificação.' });
    }
    next(error);
  }
});

app.get('/api/drivers', requireAuth, requireRoles(...RECORD_MANAGERS), async (req, res, next) => {
  try {
    if (firebaseConfigured) return res.json({ drivers: await firestoreSchool.listDrivers() });
    const drivers = db.prepare(
      'SELECT id, name FROM drivers WHERE active = 1 ORDER BY name'
    ).all();
    return res.json({ drivers });
  } catch (error) { next(error); }
});

app.post('/api/drivers', requireAuth, requireCsrf, requireRoles(...RECORD_MANAGERS), async (req, res, next) => {
  const data = driverInput(req.body);
  if (!data) return res.status(400).json({ error: 'Informe um nome de condutor válido.' });
  try {
    if (firebaseConfigured) {
      const id = await firestoreSchool.createDriver(data, req.auth.user.id);
      return res.status(201).json({ id, message: 'Condutor cadastrado.' });
    }
    const result = db.prepare(
      'INSERT INTO drivers (name, created_by) VALUES (?, ?)'
    ).run(data.name, req.auth.user.id);
    audit(req.auth.user.id, 'create', 'driver', result.lastInsertRowid);
    return res.status(201).json({ id: Number(result.lastInsertRowid), message: 'Condutor cadastrado.' });
  } catch (error) {
    if (error.code === 'already-exists' || error.message.includes('UNIQUE constraint failed: drivers.name')) {
      return res.status(409).json({ error: 'Já existe um condutor com esse nome.' });
    }
    next(error);
  }
});

app.post('/api/trips/:id/driver', requireAuth, requireCsrf, requireRoles(...RECORD_MANAGERS), async (req, res, next) => {
  const tripId = Number(req.params.id);
  const driverId = Number(req.body.driver_id);
  if (!Number.isSafeInteger(tripId) || tripId < 1 ||
      !Number.isSafeInteger(driverId) || driverId < 1) {
    return res.status(400).json({ error: 'Informe uma viagem e um condutor válidos.' });
  }
  let transactionOpen = false;
  try {
    if (firebaseConfigured) {
      const result = await firestoreSchool.assignTripDriver(tripId, driverId, req.auth.user.id);
      if (result.error === 'not-found') return res.status(404).json({ error: 'Viagem não encontrada.' });
      if (result.error === 'driver-not-found') return res.status(404).json({ error: 'Condutor não encontrado ou inativo.' });
      if (result.error === 'not-draft') return res.status(409).json({ error: 'O condutor só pode ser alterado enquanto a viagem estiver em rascunho.' });
      if (result.error === 'invalid-schedule') return res.status(409).json({ error: 'Os horários da viagem são inválidos.' });
      if (result.error === 'schedule-conflict') return res.status(409).json({ error: 'Este condutor já está atribuído a uma viagem com horário sobreposto.' });
      return res.json({ message: 'Condutor vinculado à viagem.' });
    }
    const fail = (code, message) => {
      if (transactionOpen) { db.exec('ROLLBACK'); transactionOpen = false; }
      return res.status(code).json({ error: message });
    };
    db.exec('BEGIN IMMEDIATE');
    transactionOpen = true;
    const trip = db.prepare(
      'SELECT id, status, departure_at, return_at, driver_id FROM trips WHERE id = ?'
    ).get(tripId);
    if (!trip) return fail(404, 'Viagem não encontrada.');
    if (trip.status !== 'draft') return fail(409, 'O condutor só pode ser alterado enquanto a viagem estiver em rascunho.');
    const driver = db.prepare(
      'SELECT id FROM drivers WHERE id = ? AND active = 1'
    ).get(driverId);
    if (!driver) return fail(404, 'Condutor não encontrado ou inativo.');
    const departure = Date.parse(trip.departure_at);
    const returning = Date.parse(trip.return_at);
    if (!Number.isFinite(departure) || !Number.isFinite(returning) || departure >= returning) {
      return fail(409, 'Os horários da viagem são inválidos.');
    }
    const assignments = db.prepare(
      "SELECT id, departure_at, return_at FROM trips WHERE driver_id = ? AND id <> ? AND status NOT IN ('cancelled','completed')"
    ).all(driverId, tripId);
    for (const assigned of assignments) {
      const existingDeparture = Date.parse(assigned.departure_at);
      const existingReturn = Date.parse(assigned.return_at);
      if (!Number.isFinite(existingDeparture) || !Number.isFinite(existingReturn) ||
          (departure < existingReturn && returning > existingDeparture)) {
        return fail(409, 'Este condutor já está atribuído a uma viagem com horário sobreposto.');
      }
    }
    if (Number(trip.driver_id) !== driverId) {
      db.prepare('UPDATE trips SET driver_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(driverId, tripId);
      audit(req.auth.user.id, 'assign_driver', 'trip', tripId);
    }
    db.exec('COMMIT');
    transactionOpen = false;
    return res.json({ message: 'Condutor vinculado à viagem.' });
  } catch (error) {
    if (transactionOpen) { try { db.exec('ROLLBACK'); } catch {} }
    next(error);
  }
});

app.post('/api/trips/:id/vehicle', requireAuth, requireCsrf, requireRoles(...RECORD_MANAGERS), async (req, res, next) => {
  const tripId = Number(req.params.id);
  const vehicleId = Number(req.body.vehicle_id);
  if (!Number.isSafeInteger(tripId) || tripId < 1 ||
      !Number.isSafeInteger(vehicleId) || vehicleId < 1) {
    return res.status(400).json({ error: 'Informe uma viagem e um veículo válidos.' });
  }
  let transactionOpen = false;
  try {
    if (firebaseConfigured) {
      const result = await firestoreSchool.assignTripVehicle(tripId, vehicleId, req.auth.user.id);
      if (result.error === 'not-found') return res.status(404).json({ error: 'Viagem não encontrada.' });
      if (result.error === 'vehicle-not-found') return res.status(404).json({ error: 'Veículo não encontrado ou inativo.' });
      if (result.error === 'not-draft') return res.status(409).json({ error: 'O transporte só pode ser alterado enquanto a viagem estiver em rascunho.' });
      if (result.error === 'insufficient-capacity') return res.status(409).json({ error: 'A capacidade do veículo precisa ser igual ou maior que a capacidade da viagem.' });
      if (result.error === 'invalid-schedule') return res.status(409).json({ error: 'Os horários da viagem são inválidos.' });
      if (result.error === 'schedule-conflict') return res.status(409).json({ error: 'Este veículo já está reservado em uma viagem com horário sobreposto.' });
      return res.json({ message: 'Veículo vinculado à viagem.' });
    }
    const fail = (code, message) => {
      if (transactionOpen) { db.exec('ROLLBACK'); transactionOpen = false; }
      return res.status(code).json({ error: message });
    };
    db.exec('BEGIN IMMEDIATE');
    transactionOpen = true;
    const trip = db.prepare(
      'SELECT id, status, capacity, departure_at, return_at, vehicle_id FROM trips WHERE id = ?'
    ).get(tripId);
    if (!trip) return fail(404, 'Viagem não encontrada.');
    if (trip.status !== 'draft') return fail(409, 'O transporte só pode ser alterado enquanto a viagem estiver em rascunho.');
    const vehicle = db.prepare(
      'SELECT id, capacity FROM vehicles WHERE id = ? AND active = 1'
    ).get(vehicleId);
    if (!vehicle) return fail(404, 'Veículo não encontrado ou inativo.');
    if (vehicle.capacity < trip.capacity) {
      return fail(409, 'A capacidade do veículo precisa ser igual ou maior que a capacidade da viagem.');
    }
    const departure = Date.parse(trip.departure_at);
    const returning = Date.parse(trip.return_at);
    if (!Number.isFinite(departure) || !Number.isFinite(returning) || departure >= returning) {
      return fail(409, 'Os horários da viagem são inválidos.');
    }
    const assignments = db.prepare(
      "SELECT id, departure_at, return_at FROM trips WHERE vehicle_id = ? AND id <> ? AND status NOT IN ('cancelled','completed')"
    ).all(vehicleId, tripId);
    for (const assigned of assignments) {
      const existingDeparture = Date.parse(assigned.departure_at);
      const existingReturn = Date.parse(assigned.return_at);
      if (!Number.isFinite(existingDeparture) || !Number.isFinite(existingReturn) ||
          (departure < existingReturn && returning > existingDeparture)) {
        return fail(409, 'Este veículo já está reservado em uma viagem com horário sobreposto.');
      }
    }
    if (Number(trip.vehicle_id) !== vehicleId) {
      db.prepare('UPDATE trips SET vehicle_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(vehicleId, tripId);
      audit(req.auth.user.id, 'assign_vehicle', 'trip', tripId);
    }
    db.exec('COMMIT');
    transactionOpen = false;
    return res.json({ message: 'Veículo vinculado à viagem.' });
  } catch (error) {
    if (transactionOpen) { try { db.exec('ROLLBACK'); } catch {} }
    next(error);
  }
});


app.get('/api/reports/summary', requireAuth, requireRoles(...RECORD_MANAGERS), async (req, res, next) => {
  try {
    if (firebaseConfigured) {
      return res.json(await firestoreSchool.getReportSummary());
    }
    const count = sql => Number(db.prepare(sql).get().total);
    const authorization = db.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN authorization_status = 'authorized' THEN 1 ELSE 0 END), 0) AS authorized,
        COALESCE(SUM(CASE WHEN authorization_status = 'declined' THEN 1 ELSE 0 END), 0) AS declined,
        COALESCE(SUM(CASE WHEN authorization_status = 'paper_recorded' THEN 1 ELSE 0 END), 0) AS paper_recorded,
        COALESCE(SUM(CASE WHEN authorization_status = 'pending' THEN 1 ELSE 0 END), 0) AS pending,
        COALESCE(SUM(CASE WHEN departure_present = 1 THEN 1 ELSE 0 END), 0) AS departure_present,
        COALESCE(SUM(CASE WHEN departure_present = 0 THEN 1 ELSE 0 END), 0) AS departure_absent,
        COALESCE(SUM(CASE WHEN return_present = 1 THEN 1 ELSE 0 END), 0) AS return_present,
        COALESCE(SUM(CASE WHEN return_present = 0 THEN 1 ELSE 0 END), 0) AS return_absent
      FROM trip_students
    `).get();
    const totals = {
      trips: count('SELECT COUNT(*) AS total FROM trips'),
      students: count('SELECT COUNT(*) AS total FROM students WHERE active = 1'),
      vehicles: count('SELECT COUNT(*) AS total FROM vehicles WHERE active = 1'),
      participants: count('SELECT COUNT(*) AS total FROM trip_students'),
      authorized: Number(authorization.authorized),
      pending: Number(authorization.pending),
      declined: Number(authorization.declined),
      paper_recorded: Number(authorization.paper_recorded),
      departure_present: Number(authorization.departure_present),
      departure_absent: Number(authorization.departure_absent),
      return_present: Number(authorization.return_present),
      return_absent: Number(authorization.return_absent)
    };
    const trips = db.prepare(`
      SELECT
        t.id, t.title, t.destination, t.departure_at, t.status, t.capacity,
        v.name AS vehicle_name,
        COUNT(ts.student_id) AS participants,
        COALESCE(SUM(CASE WHEN ts.authorization_status = 'authorized' THEN 1 ELSE 0 END), 0) AS authorized,
        COALESCE(SUM(CASE WHEN ts.authorization_status = 'pending' THEN 1 ELSE 0 END), 0) AS pending,
        COALESCE(SUM(CASE WHEN ts.authorization_status = 'declined' THEN 1 ELSE 0 END), 0) AS declined,
        COALESCE(SUM(CASE WHEN ts.authorization_status = 'paper_recorded' THEN 1 ELSE 0 END), 0) AS paper_recorded,
        COALESCE(SUM(CASE WHEN ts.departure_present = 1 THEN 1 ELSE 0 END), 0) AS departure_present,
        COALESCE(SUM(CASE WHEN ts.departure_present = 0 THEN 1 ELSE 0 END), 0) AS departure_absent,
        COALESCE(SUM(CASE WHEN ts.return_present = 1 THEN 1 ELSE 0 END), 0) AS return_present,
        COALESCE(SUM(CASE WHEN ts.return_present = 0 THEN 1 ELSE 0 END), 0) AS return_absent
      FROM trips t
      LEFT JOIN vehicles v ON v.id = t.vehicle_id
      LEFT JOIN trip_students ts ON ts.trip_id = t.id
      GROUP BY t.id
      ORDER BY t.departure_at DESC
      LIMIT 100
    `).all();
    return res.json({
      generated_at: new Date().toISOString(),
      partial: totals.trips > 100,
      totals,
      trips
    });
  } catch (error) { next(error); }
});

app.get('/api/trips/:id/participants', requireAuth, async (req, res, next) => {
  const tripId = Number(req.params.id);
  if (!Number.isSafeInteger(tripId) || tripId < 1) return res.status(400).json({ error: 'Viagem inválida.' });
  try {
    if (firebaseConfigured) {
      const participants = await firestoreSchool.listTripParticipantsForUser(tripId, req.auth.user);
      if (participants === null) return res.status(404).json({ error: 'Viagem não encontrada.' });
      return res.json({ participants });
    }
    if (!db.prepare('SELECT id FROM trips WHERE id = ?').get(tripId)) {
      return res.status(404).json({ error: 'Viagem não encontrada.' });
    }
    const user = req.auth.user;
    let rows;
    const query = 'SELECT ts.student_id, s.full_name, ts.authorization_status, ts.departure_present, ts.return_present FROM trip_students ts JOIN students s ON s.id = ts.student_id WHERE ts.trip_id = ? AND s.active = 1';
    if (hasRole(user, RECORD_MANAGERS)) {
      rows = db.prepare(query + ' ORDER BY s.full_name').all(tripId);
    } else if (user.role === 'teacher') {
      if (!db.prepare('SELECT 1 FROM trip_staff WHERE trip_id = ? AND user_id = ?').get(tripId, user.id)) {
        return res.status(403).json({ error: 'Você não está vinculado a esta viagem.' });
      }
      rows = db.prepare(query + ' ORDER BY s.full_name').all(tripId);
    } else if (user.role === 'guardian') {
      rows = db.prepare(query + ' AND EXISTS (SELECT 1 FROM student_guardians sg WHERE sg.student_id = s.id AND sg.guardian_user_id = ?) ORDER BY s.full_name').all(tripId, user.id);
    } else if (user.role === 'student') {
      rows = db.prepare(query + ' AND s.user_id = ? ORDER BY s.full_name').all(tripId, user.id);
    } else {
      return res.status(403).json({ error: 'Seu perfil não permite consultar participantes.' });
    }
    return res.json({ participants: rows });
  } catch (error) {
    if (error.code === 'forbidden') return res.status(403).json({ error: error.message });
    next(error);
  }
});

app.post('/api/trips/:id/participants/:studentId/authorization', requireAuth, requireCsrf, requireRoles('guardian'), async (req, res, next) => {
  const tripId = Number(req.params.id);
  const studentId = Number(req.params.studentId);
  const status = req.body.status;
  if (!Number.isSafeInteger(tripId) || tripId < 1 ||
      !Number.isSafeInteger(studentId) || studentId < 1 ||
      !['authorized', 'declined'].includes(status)) {
    return res.status(400).json({ error: 'Informe uma viagem, estudante e decisão válidos.' });
  }
  let transactionOpen = false;
  try {
    if (firebaseConfigured) {
      const result = await firestoreSchool.setTripStudentAuthorization(
        tripId, studentId, req.auth.user.id, status
      );
      if (result.error === 'not-found' || result.error === 'not-participant' || result.error === 'forbidden') {
        return res.status(404).json({ error: 'Participação ou vínculo de responsável não encontrado.' });
      }
      if (result.error === 'not-approved') return res.status(409).json({ error: 'A autorização só pode ser registrada após a aprovação da viagem.' });
      if (result.error === 'closed') return res.status(409).json({ error: 'O prazo de autorização desta viagem foi encerrado.' });
      if (result.error === 'already-decided') return res.status(409).json({ error: 'A autorização em papel já foi registrada e não pode ser substituída digitalmente.' });
      return res.json({ message: status === 'authorized' ? 'Autorização registrada.' : 'Não autorização registrada.' });
    }
    const fail = (code, message) => {
      if (transactionOpen) { db.exec('ROLLBACK'); transactionOpen = false; }
      return res.status(code).json({ error: message });
    };
    db.exec('BEGIN IMMEDIATE');
    transactionOpen = true;
    const trip = db.prepare('SELECT status, departure_at FROM trips WHERE id = ?').get(tripId);
    if (!trip) return fail(404, 'Viagem não encontrada.');
    if (!['approved', 'open'].includes(trip.status)) return fail(409, 'A autorização só pode ser registrada após a aprovação da viagem.');
    const departureAt = Date.parse(trip.departure_at);
    if (!Number.isFinite(departureAt) || Date.now() >= departureAt) return fail(409, 'O prazo de autorização desta viagem foi encerrado.');
    const student = db.prepare('SELECT id FROM students WHERE id = ? AND active = 1').get(studentId);
    const guardianLink = db.prepare('SELECT 1 FROM student_guardians WHERE student_id = ? AND guardian_user_id = ?').get(studentId, req.auth.user.id);
    if (!student || !guardianLink) return fail(404, 'Participação ou vínculo de responsável não encontrado.');
    const participant = db.prepare('SELECT authorization_status FROM trip_students WHERE trip_id = ? AND student_id = ?').get(tripId, studentId);
    if (!participant) return fail(404, 'Participação ou vínculo de responsável não encontrado.');
    if (participant.authorization_status === 'paper_recorded') {
      return fail(409, 'A autorização em papel já foi registrada e não pode ser substituída digitalmente.');
    }
    if (participant.authorization_status !== status) {
      db.prepare('UPDATE trip_students SET authorization_status = ? WHERE trip_id = ? AND student_id = ?').run(status, tripId, studentId);
      audit(req.auth.user.id, status === 'authorized' ? 'authorize_trip_student' : 'decline_trip_student',
        'trip_student', tripId + '_' + studentId);
    }
    db.exec('COMMIT');
    transactionOpen = false;
    return res.json({ message: status === 'authorized' ? 'Autorização registrada.' : 'Não autorização registrada.' });
  } catch (error) {
    if (transactionOpen) { try { db.exec('ROLLBACK'); } catch {} }
    next(error);
  }
});


app.post('/api/trips/:id/participants/:studentId/paper-authorization',
  requireAuth, requireCsrf, requireRoles(...RECORD_MANAGERS), async (req, res, next) => {
    const tripId = Number(req.params.id);
    const studentId = Number(req.params.studentId);
    if (!Number.isSafeInteger(tripId) || tripId < 1 ||
        !Number.isSafeInteger(studentId) || studentId < 1) {
      return res.status(400).json({ error: 'Informe uma viagem e um estudante válidos.' });
    }
    let transactionOpen = false;
    try {
      if (firebaseConfigured) {
        const result = await firestoreSchool.recordPaperAuthorization(
          tripId, studentId, req.auth.user
        );
        if (result.error === 'not-found' || result.error === 'not-participant') {
          return res.status(404).json({ error: 'Participação não encontrada.' });
        }
        if (result.error === 'not-approved') return res.status(409).json({ error: 'O registro em papel só pode ser lançado após a aprovação da viagem.' });
        if (result.error === 'closed') return res.status(409).json({ error: 'O prazo de autorização desta viagem foi encerrado.' });
        if (result.error === 'already-decided') return res.status(409).json({ error: 'Já existe uma decisão digital registrada para esta participação.' });
        if (result.error === 'forbidden') return res.status(403).json({ error: 'Seu perfil não permite registrar autorização em papel.' });
        return res.json({ message: 'Autorização em papel registrada.' });
      }
      const fail = (code, message) => {
        if (transactionOpen) { db.exec('ROLLBACK'); transactionOpen = false; }
        return res.status(code).json({ error: message });
      };
      db.exec('BEGIN IMMEDIATE');
      transactionOpen = true;
      const trip = db.prepare('SELECT status, departure_at FROM trips WHERE id = ?').get(tripId);
      if (!trip) return fail(404, 'Viagem não encontrada.');
      if (!['approved', 'open'].includes(trip.status)) {
        return fail(409, 'O registro em papel só pode ser lançado após a aprovação da viagem.');
      }
      const departureAt = Date.parse(trip.departure_at);
      if (!Number.isFinite(departureAt) || Date.now() >= departureAt) {
        return fail(409, 'O prazo de autorização desta viagem foi encerrado.');
      }
      const student = db.prepare('SELECT id FROM students WHERE id = ? AND active = 1').get(studentId);
      const participant = db.prepare(
        'SELECT authorization_status FROM trip_students WHERE trip_id = ? AND student_id = ?'
      ).get(tripId, studentId);
      if (!student || !participant) return fail(404, 'Participação não encontrada.');
      if (participant.authorization_status === 'paper_recorded') {
        db.exec('COMMIT');
        transactionOpen = false;
        return res.json({ message: 'Autorização em papel já estava registrada.' });
      }
      if (participant.authorization_status !== 'pending') {
        return fail(409, 'Já existe uma decisão digital registrada para esta participação.');
      }
      db.prepare(
        "UPDATE trip_students SET authorization_status = 'paper_recorded' WHERE trip_id = ? AND student_id = ?"
      ).run(tripId, studentId);
      audit(req.auth.user.id, 'record_paper_authorization', 'trip_student', tripId + '_' + studentId);
      db.exec('COMMIT');
      transactionOpen = false;
      return res.json({ message: 'Autorização em papel registrada.' });
    } catch (error) {
      if (transactionOpen) { try { db.exec('ROLLBACK'); } catch {} }
      next(error);
    }
  });

app.post('/api/trips/:id/participants/:studentId/attendance', requireAuth, requireCsrf,
  requireRoles(...RECORD_MANAGERS, 'teacher'), async (req, res, next) => {
    const tripId = Number(req.params.id);
    const studentId = Number(req.params.studentId);
    const { checkpoint, present } = req.body;
    if (!Number.isSafeInteger(tripId) || tripId < 1 ||
        !Number.isSafeInteger(studentId) || studentId < 1 ||
        !['departure', 'return'].includes(checkpoint) || typeof present !== 'boolean') {
      return res.status(400).json({ error: 'Informe viagem, estudante, etapa e presença válidos.' });
    }
    let transactionOpen = false;
    try {
      if (firebaseConfigured) {
        const result = await firestoreSchool.setTripAttendance(
          tripId, studentId, req.auth.user, checkpoint, present
        );
        if (result.error === 'not-found' || result.error === 'not-participant') {
          return res.status(404).json({ error: 'Participação não encontrada.' });
        }
        if (result.error === 'not-assigned') return res.status(403).json({ error: 'Professor não está vinculado a esta viagem.' });
        if (result.error === 'not-approved') return res.status(409).json({ error: 'A presença só pode ser registrada em viagens aprovadas.' });
        if (result.error === 'forbidden') return res.status(403).json({ error: 'Seu perfil não permite registrar presença.' });
        return res.json({ message: 'Presença atualizada.' });
      }
      const fail = (code, message) => {
        if (transactionOpen) { db.exec('ROLLBACK'); transactionOpen = false; }
        return res.status(code).json({ error: message });
      };
      db.exec('BEGIN IMMEDIATE');
      transactionOpen = true;
      const trip = db.prepare('SELECT status FROM trips WHERE id = ?').get(tripId);
      if (!trip) return fail(404, 'Viagem não encontrada.');
      if (!['approved', 'open'].includes(trip.status)) return fail(409, 'A presença só pode ser registrada em viagens aprovadas.');
      if (req.auth.user.role === 'teacher' &&
          !db.prepare('SELECT 1 FROM trip_staff WHERE trip_id = ? AND user_id = ?').get(tripId, req.auth.user.id)) {
        return fail(403, 'Professor não está vinculado a esta viagem.');
      }
      const student = db.prepare('SELECT id FROM students WHERE id = ? AND active = 1').get(studentId);
      const participant = db.prepare('SELECT student_id, departure_present, return_present FROM trip_students WHERE trip_id = ? AND student_id = ?').get(tripId, studentId);
      if (!student || !participant) return fail(404, 'Participação não encontrada.');
      const field = checkpoint === 'departure' ? 'departure_present' : 'return_present';
      if (participant[field] !== Number(present)) {
        db.prepare('UPDATE trip_students SET ' + field + ' = ? WHERE trip_id = ? AND student_id = ?')
          .run(Number(present), tripId, studentId);
        audit(req.auth.user.id, 'mark_' + checkpoint + '_' + (present ? 'present' : 'absent'),
          'trip_student', tripId + '_' + studentId);
      }
      db.exec('COMMIT');
      transactionOpen = false;
      return res.json({ message: 'Presença atualizada.' });
    } catch (error) {
      if (transactionOpen) { try { db.exec('ROLLBACK'); } catch {} }
      next(error);
    }
  });

app.use(express.static(path.join(__dirname, '..', 'public'), { extensions: ['html'], index: 'index.html', maxAge: isProduction ? '1h' : 0 }));
app.use('/api', (_req, res) => res.status(404).json({ error: 'Rota não encontrada.' }));
app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: 'Ocorreu um erro interno.' });
});
bootstrapAdmin().then(() => app.listen(PORT, () => console.log('SGVE disponível na porta ' + PORT))).catch(error => {
  console.error('Falha ao preparar o SGVE:', error.message);
  process.exit(1);
});
