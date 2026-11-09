'use strict';
require('dotenv').config();
const path = require('node:path');
const express = require('express');
const helmet = require('helmet');
const { db, audit } = require('./db');
const { hashPassword, verifyPassword, randomToken, sha256 } = require('./security');
const { randomInt } = require('node:crypto');
const { ROLE_LABELS, RECORD_MANAGERS, USER_MANAGERS, hasRole } = require('./access');

const app = express();
const isProduction = process.env.NODE_ENV === 'production';
const PORT = Number(process.env.PORT || 3000);
const SESSION_HOURS = 8;
const COOKIE_NAME = 'sgve_session';
const VALID_ROLES = Object.keys(ROLE_LABELS);
if (isProduction) app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: { directives: {
  defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'"],
  imgSrc: ["'self'", 'data:'], connectSrc: ["'self'"], objectSrc: ["'none'"],
  frameAncestors: ["'none'"], upgradeInsecureRequests: isProduction ? [] : null
} } }));
app.use(express.json({ limit: '20kb' }));
app.use(express.urlencoded({ extended: false, limit: '20kb' }));

const loginAttempts = new Map();
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_LOGIN_ATTEMPTS = 5;
const registrationAttempts = new Map();
const REGISTRATION_WINDOW_MS = 60 * 60 * 1000;
const MAX_REGISTRATION_ATTEMPTS = 5;
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
  if (!origin) return true;
  try { return new URL(origin).host === req.get('host'); } catch { return false; }
}
app.use((req, res, next) => {
  try {
    const token = parseCookies(req.headers.cookie)[COOKIE_NAME];
    if (!token || token.length > 200) return next();
    const session = db.prepare('SELECT s.id AS session_id, s.csrf_token, u.id, u.display_name, u.email, u.role, u.active FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?').get(sha256(token), new Date().toISOString());
    if (!session || !session.active) {
      if (session) db.prepare('DELETE FROM sessions WHERE id = ?').run(session.session_id);
      return next();
    }
    req.auth = { sessionId: session.session_id, csrfToken: session.csrf_token,
      user: { id: session.id, name: session.display_name, email: session.email, role: session.role } };
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
  if (db.prepare('SELECT id FROM users WHERE email = ?').get(email)) return;
  const passwordHash = await hashPassword(password);
  db.prepare('INSERT INTO users (display_name, email, password_hash, role) VALUES (?, ?, ?, ?)').run(name || 'Administrador', email, passwordHash, 'admin');
  console.log('Conta administrativa inicial criada a partir das variáveis de ambiente.');
}

app.get('/api/health', (_req, res) => res.json({ status: 'ok', service: 'SGVE', environment: isProduction ? 'production' : 'development' }));

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
    const now = Date.now();
    const key = String(req.ip || 'unknown') + ':' + email;
    const attempt = registrationAttempts.get(key);
    if (attempt && now - attempt.startedAt < REGISTRATION_WINDOW_MS && attempt.count >= MAX_REGISTRATION_ATTEMPTS) {
      return res.status(429).json({ error: 'Muitas solicitações para este e-mail. Aguarde uma hora e tente novamente.' });
    }
    if (!attempt || now - attempt.startedAt >= REGISTRATION_WINDOW_MS) registrationAttempts.set(key, { startedAt: now, count: 1 });
    else attempt.count += 1;
    if (db.prepare('SELECT id FROM users WHERE email = ?').get(email)) {
      return res.status(409).json({ error: 'Este e-mail já possui uma conta. Tente entrar ou fale com a secretaria.' });
    }
    const previousRequest = db.prepare('SELECT id, status FROM registration_requests WHERE email = ?').get(email);
    if (previousRequest?.status === 'pending') {
      return res.status(409).json({ error: 'Já existe uma solicitação pendente para este e-mail.' });
    }
    const passwordHash = await hashPassword(password);
    const verificationCode = createVerificationCode();
    if (previousRequest?.status === 'rejected') {
      db.prepare("UPDATE registration_requests SET display_name = ?, password_hash = ?, role = ?, verification_code = ?, status = 'pending', reviewed_by = NULL, reviewed_at = NULL, created_at = CURRENT_TIMESTAMP WHERE id = ?")
        .run(name, passwordHash, role, verificationCode, previousRequest.id);
    } else {
      db.prepare('INSERT INTO registration_requests (display_name, email, password_hash, role, verification_code) VALUES (?, ?, ?, ?, ?)').run(name, email, passwordHash, role, verificationCode);
    }
    res.status(201).json({ message: 'Solicitação enviada. Informe o código ao administrador para conferir seu cadastro. A conta só será liberada após a aprovação.', verificationCode });
  } catch (error) {
    if (String(error.message).includes('UNIQUE')) return res.status(409).json({ error: 'Já existe uma solicitação para este e-mail.' });
    next(error);
  }
});
app.post('/api/auth/login', async (req, res, next) => {
  try {
    if (!sameOrigin(req)) return res.status(403).json({ error: 'Origem não permitida.' });
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    if (!email || !password || email.length > 254 || password.length > 200) return res.status(400).json({ error: 'Informe e-mail e senha válidos.' });
    const now = Date.now();
    const attempts = loginAttempts.get(email);
    if (attempts && now - attempts.startedAt < LOGIN_WINDOW_MS && attempts.count >= MAX_LOGIN_ATTEMPTS) return res.status(429).json({ error: 'Muitas tentativas. Aguarde alguns minutos.' });
    const user = db.prepare('SELECT id, display_name, email, password_hash, role, active FROM users WHERE email = ?').get(email);
    const valid = user && user.active && await verifyPassword(password, user.password_hash);
    if (!valid) {
      const current = loginAttempts.get(email);
      if (!current || now - current.startedAt >= LOGIN_WINDOW_MS) loginAttempts.set(email, { startedAt: now, count: 1 });
      else current.count += 1;
      return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
    }
    loginAttempts.delete(email);
    const token = randomToken(32);
    const csrfToken = randomToken(24);
    const expiresAt = new Date(now + SESSION_HOURS * 3600000).toISOString();
    db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(new Date(now).toISOString());
    db.prepare('INSERT INTO sessions (token_hash, csrf_token, user_id, expires_at) VALUES (?, ?, ?, ?)').run(sha256(token), csrfToken, user.id, expiresAt);
    audit(user.id, 'login', 'user', user.id);
    setSessionCookie(res, token);
    res.json({ user: { id: user.id, name: user.display_name, email: user.email, role: user.role, roleLabel: ROLE_LABELS[user.role] }, csrfToken });
  } catch (error) { next(error); }
});
app.get('/api/auth/me', requireAuth, (req, res) => res.json({ user: { ...req.auth.user, roleLabel: ROLE_LABELS[req.auth.user.role] }, csrfToken: req.auth.csrfToken }));
app.post('/api/auth/logout', requireAuth, requireCsrf, (req, res) => {
  db.prepare('DELETE FROM sessions WHERE id = ?').run(req.auth.sessionId);
  audit(req.auth.user.id, 'logout', 'user', req.auth.user.id);
  clearSessionCookie(res);
  res.json({ ok: true });
});

app.get('/api/classes', requireAuth, (_req, res) => {
  const rows = db.prepare('SELECT id, level, grade, course, section, school_year, active FROM classes WHERE active = 1 ORDER BY school_year DESC, level, grade, course, section').all();
  res.json({ classes: rows });
});
app.post('/api/classes', requireAuth, requireCsrf, requireRoles(...RECORD_MANAGERS), (req, res) => {
  const data = classInput(req.body);
  if (!data) return res.status(400).json({ error: 'Confira etapa, ano/série, curso, turma e ano letivo.' });
  try {
    const result = db.prepare('INSERT INTO classes (level, grade, course, section, school_year) VALUES (?, ?, ?, ?, ?)').run(data.level, data.grade, data.course, data.section, data.schoolYear);
    audit(req.auth.user.id, 'create', 'class', result.lastInsertRowid);
    res.status(201).json({ id: Number(result.lastInsertRowid), message: 'Turma cadastrada.' });
  } catch (error) {
    if (String(error.message).includes('UNIQUE')) return res.status(409).json({ error: 'Essa turma já está cadastrada para o ano letivo.' });
    throw error;
  }
});

app.get('/api/students', requireAuth, (req, res) => {
  let rows;
  if (hasRole(req.auth.user, RECORD_MANAGERS)) {
    rows = db.prepare('SELECT s.id, s.full_name, s.class_id, c.grade, c.course, c.section, c.level, s.active FROM students s JOIN classes c ON c.id = s.class_id WHERE s.active = 1 ORDER BY s.full_name LIMIT 500').all();
  } else if (req.auth.user.role === 'guardian') {
    rows = db.prepare('SELECT s.id, s.full_name, s.class_id, c.grade, c.course, c.section, c.level, s.active FROM students s JOIN classes c ON c.id = s.class_id JOIN student_guardians sg ON sg.student_id = s.id WHERE sg.guardian_user_id = ? AND s.active = 1 ORDER BY s.full_name').all(req.auth.user.id);
  } else if (req.auth.user.role === 'student') {
    rows = db.prepare('SELECT s.id, s.full_name, s.class_id, c.grade, c.course, c.section, c.level, s.active FROM students s JOIN classes c ON c.id = s.class_id WHERE s.user_id = ? AND s.active = 1').all(req.auth.user.id);
  } else return res.status(403).json({ error: 'Seu perfil não permite consultar estudantes.' });
  res.json({ students: rows });
});
app.post('/api/students', requireAuth, requireCsrf, requireRoles(...RECORD_MANAGERS), (req, res) => {
  const fullName = cleanText(req.body.full_name, 120);
  const classId = Number(req.body.class_id);
  if (fullName.length < 3 || !Number.isInteger(classId) || classId < 1) return res.status(400).json({ error: 'Informe nome e turma válidos.' });
  if (!db.prepare('SELECT id FROM classes WHERE id = ? AND active = 1').get(classId)) return res.status(400).json({ error: 'A turma selecionada não existe ou está inativa.' });
  const result = db.prepare('INSERT INTO students (full_name, class_id) VALUES (?, ?)').run(fullName, classId);
  audit(req.auth.user.id, 'create', 'student', result.lastInsertRowid);
  res.status(201).json({ id: Number(result.lastInsertRowid), message: 'Estudante cadastrado.' });
});
app.post('/api/students/:id/guardians', requireAuth, requireCsrf, requireRoles(...RECORD_MANAGERS), (req, res) => {
  const studentId = Number(req.params.id);
  const email = String(req.body.email || '').trim().toLowerCase();
  const relationship = cleanText(req.body.relationship, 40);
  if (!Number.isInteger(studentId) || studentId < 1 || !validEmail(email)) return res.status(400).json({ error: 'Informe um estudante e e-mail de responsável válidos.' });
  const student = db.prepare('SELECT id FROM students WHERE id = ? AND active = 1').get(studentId);
  const guardian = db.prepare("SELECT id FROM users WHERE email = ? AND role = 'guardian' AND active = 1").get(email);
  if (!student || !guardian) return res.status(404).json({ error: 'Estudante ou conta de responsável não encontrada.' });
  db.prepare('INSERT OR IGNORE INTO student_guardians (student_id, guardian_user_id, relationship_label) VALUES (?, ?, ?)').run(studentId, guardian.id, relationship || null);
  audit(req.auth.user.id, 'link_guardian', 'student', studentId);
  res.json({ message: 'Responsável vinculado ao estudante.' });
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
    const result = db.prepare('INSERT INTO users (display_name, email, password_hash, role) VALUES (?, ?, ?, ?)').run(name, email, passwordHash, role);
    audit(req.auth.user.id, 'create', 'user', result.lastInsertRowid);
    res.status(201).json({ user: { id: Number(result.lastInsertRowid), name, email, role, roleLabel: ROLE_LABELS[role] }, message: 'Conta criada.' });
  } catch (error) {
    if (String(error.message).includes('UNIQUE')) return res.status(409).json({ error: 'Já existe uma conta com esse e-mail.' });
    next(error);
  }
});
app.get('/api/registration-requests', requireAuth, requireRoles('admin'), (_req, res) => {
  const requests = db.prepare("SELECT id, display_name AS name, email, role, verification_code, status, created_at FROM registration_requests WHERE status = 'pending' ORDER BY created_at ASC LIMIT 200").all();
  res.json({ requests: requests.map(item => ({ ...item, roleLabel: ROLE_LABELS[item.role] })) });
});
app.post('/api/registration-requests/:id/approve', requireAuth, requireCsrf, requireRoles('admin'), (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: 'Solicitação inválida.' });
  const request = db.prepare("SELECT id, display_name, email, password_hash, role FROM registration_requests WHERE id = ? AND status = 'pending'").get(id);
  if (!request || !request.password_hash) return res.status(404).json({ error: 'Solicitação não encontrada ou já analisada.' });
  if (db.prepare('SELECT id FROM users WHERE email = ?').get(request.email)) return res.status(409).json({ error: 'Já existe uma conta com este e-mail.' });
  db.exec('BEGIN IMMEDIATE');
  try {
    const created = db.prepare('INSERT INTO users (display_name, email, password_hash, role) VALUES (?, ?, ?, ?)').run(request.display_name, request.email, request.password_hash, request.role);
    db.prepare("UPDATE registration_requests SET status = 'approved', password_hash = NULL, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'pending'").run(req.auth.user.id, id);
    audit(req.auth.user.id, 'approve_registration', 'registration_request', id);
    db.exec('COMMIT');
    res.json({ message: 'Cadastro aprovado. A pessoa já pode entrar com o e-mail e a senha cadastrados.', userId: Number(created.lastInsertRowid) });
  } catch (error) {
    db.exec('ROLLBACK');
    if (String(error.message).includes('UNIQUE')) return res.status(409).json({ error: 'Já existe uma conta com este e-mail.' });
    throw error;
  }
});
app.post('/api/registration-requests/:id/reject', requireAuth, requireCsrf, requireRoles('admin'), (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: 'Solicitação inválida.' });
  const result = db.prepare("UPDATE registration_requests SET status = 'rejected', password_hash = NULL, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'pending'").run(req.auth.user.id, id);
  if (!result.changes) return res.status(404).json({ error: 'Solicitação não encontrada ou já analisada.' });
  audit(req.auth.user.id, 'reject_registration', 'registration_request', id);
  res.json({ message: 'Solicitação rejeitada.' });
});
app.get('/api/users', requireAuth, requireRoles('admin', 'direction'), (_req, res) => {
  const rows = db.prepare('SELECT id, display_name, email, role, active FROM users ORDER BY display_name LIMIT 300').all();
  res.json({ users: rows.map(user => ({ id: user.id, name: user.display_name, email: user.email, role: user.role, roleLabel: ROLE_LABELS[user.role], active: Boolean(user.active) })) });
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
function getTripStatusLabel(status) {
  return ({ draft: 'Rascunho', pending_approval: 'Aguardando aprovação', approved: 'Aprovada',
    open: 'Inscrições abertas', completed: 'Concluída', cancelled: 'Cancelada' })[status] || status;
}
app.get('/api/trips', requireAuth, (req, res) => {
  const user = req.auth.user;
  let rows;
  const select = 'SELECT DISTINCT t.id, t.title, t.destination, t.educational_purpose, t.departure_at, t.return_at, t.capacity, t.status, (SELECT COUNT(*) FROM trip_students ts WHERE ts.trip_id = t.id) AS participant_count FROM trips t';
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
});
app.post('/api/trips', requireAuth, requireCsrf, requireRoles(...RECORD_MANAGERS), (req, res) => {
  const data = tripInput(req.body);
  if (!data) return res.status(400).json({ error: 'Confira título, destino, objetivo, horários e capacidade da viagem.' });
  const result = db.prepare('INSERT INTO trips (title, destination, educational_purpose, departure_at, return_at, capacity, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)').
    run(data.title, data.destination, data.purpose, data.departure, data.returning, data.capacity, req.auth.user.id);
  audit(req.auth.user.id, 'create', 'trip', result.lastInsertRowid);
  res.status(201).json({ id: Number(result.lastInsertRowid), message: 'Viagem criada como rascunho.' });
});
app.post('/api/trips/:id/classes', requireAuth, requireCsrf, requireRoles(...RECORD_MANAGERS), (req, res) => {
  const tripId = Number(req.params.id);
  const classId = Number(req.body.class_id);
  if (!Number.isInteger(tripId) || tripId < 1 || !Number.isInteger(classId) || classId < 1) return res.status(400).json({ error: 'Viagem ou turma inválida.' });
  const trip = db.prepare("SELECT id, status FROM trips WHERE id = ?").get(tripId);
  const schoolClass = db.prepare('SELECT id FROM classes WHERE id = ? AND active = 1').get(classId);
  if (!trip || !schoolClass) return res.status(404).json({ error: 'Viagem ou turma não encontrada.' });
  if (trip.status !== 'draft') return res.status(409).json({ error: 'Turmas só podem ser vinculadas enquanto a viagem estiver em rascunho.' });
  db.prepare('INSERT OR IGNORE INTO trip_classes (trip_id, class_id) VALUES (?, ?)').run(tripId, classId);
  audit(req.auth.user.id, 'link_class', 'trip', tripId);
  res.json({ message: 'Turma vinculada à viagem.' });
});
app.post('/api/trips/:id/students', requireAuth, requireCsrf, requireRoles(...RECORD_MANAGERS), (req, res) => {
  const tripId = Number(req.params.id);
  const studentId = Number(req.body.student_id);
  if (!Number.isInteger(tripId) || tripId < 1 || !Number.isInteger(studentId) || studentId < 1) return res.status(400).json({ error: 'Viagem ou estudante inválido.' });
  const trip = db.prepare("SELECT id, status, capacity FROM trips WHERE id = ?").get(tripId);
  const student = db.prepare('SELECT id, class_id FROM students WHERE id = ? AND active = 1').get(studentId);
  if (!trip || !student) return res.status(404).json({ error: 'Viagem ou estudante não encontrado.' });
  if (trip.status !== 'draft') return res.status(409).json({ error: 'Participantes só podem ser vinculados enquanto a viagem estiver em rascunho.' });
  if (!db.prepare('SELECT trip_id FROM trip_classes WHERE trip_id = ? AND class_id = ?').get(tripId, student.class_id)) return res.status(400).json({ error: 'Vincule primeiro a turma do estudante à viagem.' });
  const exists = db.prepare('SELECT 1 AS found FROM trip_students WHERE trip_id = ? AND student_id = ?').get(tripId, studentId);
  const count = db.prepare('SELECT COUNT(*) AS total FROM trip_students WHERE trip_id = ?').get(tripId).total;
  if (!exists && count >= trip.capacity) return res.status(409).json({ error: 'A capacidade da viagem foi atingida.' });
  db.prepare("INSERT OR IGNORE INTO trip_students (trip_id, student_id) VALUES (?, ?)").run(tripId, studentId);
  audit(req.auth.user.id, 'link_student', 'trip', tripId);
  res.json({ message: 'Estudante vinculado à viagem.' });
});
app.post('/api/trips/:id/staff', requireAuth, requireCsrf, requireRoles(...RECORD_MANAGERS), (req, res) => {
  const tripId = Number(req.params.id);
  const userId = Number(req.body.user_id);
  if (!Number.isInteger(tripId) || tripId < 1 || !Number.isInteger(userId) || userId < 1) return res.status(400).json({ error: 'Viagem ou usuário inválido.' });
  const trip = db.prepare('SELECT id, status FROM trips WHERE id = ?').get(tripId);
  const teacher = db.prepare("SELECT id FROM users WHERE id = ? AND role = 'teacher' AND active = 1").get(userId);
  if (!trip || !teacher) return res.status(404).json({ error: 'Viagem ou professor não encontrado.' });
  if (trip.status !== 'draft') return res.status(409).json({ error: 'Equipe só pode ser alterada enquanto a viagem estiver em rascunho.' });
  db.prepare('INSERT OR IGNORE INTO trip_staff (trip_id, user_id) VALUES (?, ?)').run(tripId, userId);
  audit(req.auth.user.id, 'assign_teacher', 'trip', tripId);
  res.json({ message: 'Professor vinculado à viagem.' });
});
app.post('/api/trips/:id/submit', requireAuth, requireCsrf, requireRoles(...RECORD_MANAGERS), (req, res) => {
  const tripId = Number(req.params.id);
  const trip = db.prepare('SELECT id, status FROM trips WHERE id = ?').get(tripId);
  if (!trip) return res.status(404).json({ error: 'Viagem não encontrada.' });
  if (trip.status !== 'draft') return res.status(409).json({ error: 'Somente rascunhos podem ser enviados para aprovação.' });
  const classes = db.prepare('SELECT COUNT(*) AS total FROM trip_classes WHERE trip_id = ?').get(tripId).total;
  if (!classes) return res.status(400).json({ error: 'Vincule pelo menos uma turma antes de enviar para aprovação.' });
  db.prepare("UPDATE trips SET status = 'pending_approval', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(tripId);
  audit(req.auth.user.id, 'submit_for_approval', 'trip', tripId);
  res.json({ message: 'Viagem enviada para aprovação da direção.' });
});
app.post('/api/trips/:id/approve', requireAuth, requireCsrf, requireRoles('admin', 'direction'), (req, res) => {
  const tripId = Number(req.params.id);
  const trip = db.prepare("SELECT id, status FROM trips WHERE id = ?").get(tripId);
  if (!trip) return res.status(404).json({ error: 'Viagem não encontrada.' });
  if (trip.status !== 'pending_approval') return res.status(409).json({ error: 'A viagem não está aguardando aprovação.' });
  db.prepare("UPDATE trips SET status = 'approved', approved_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(req.auth.user.id, tripId);
  audit(req.auth.user.id, 'approve', 'trip', tripId);
  res.json({ message: 'Viagem aprovada.' });
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
