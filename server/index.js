'use strict';
require('dotenv').config();
const path = require('node:path');
const express = require('express');
const helmet = require('helmet');
const { db, audit } = require('./db');
const { hashPassword, verifyPassword, randomToken, sha256 } = require('./security');
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
app.get('/api/users', requireAuth, requireRoles('admin', 'direction'), (_req, res) => {
  const rows = db.prepare('SELECT id, display_name, email, role, active FROM users ORDER BY display_name LIMIT 300').all();
  res.json({ users: rows.map(user => ({ id: user.id, name: user.display_name, email: user.email, role: user.role, roleLabel: ROLE_LABELS[user.role], active: Boolean(user.active) })) });
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
