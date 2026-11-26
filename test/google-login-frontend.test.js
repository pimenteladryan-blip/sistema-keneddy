'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'public', 'js', 'app.js'), 'utf8');
const server = fs.readFileSync(path.join(root, 'server', 'index.js'), 'utf8');

test('a tela de login não oferece autenticação Google', () => {
  assert.doesNotMatch(html, /google-login-button|Entrar com Google|firebase-auth-compat|firebase-config\.js/);
  assert.doesNotMatch(app, /GoogleAuthProvider|googleLoginButton|api\('\/api\/auth\/google'/);
  assert.match(html, /id="login-form"/);
  assert.match(html, /id="login-button"/);
});

test('a instalação PWA usa arquivos estáticos e nunca armazena respostas da API', () => {
  const worker = fs.readFileSync(path.join(root, 'public', 'sw.js'), 'utf8');
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'public', 'manifest.webmanifest'), 'utf8'));
  assert.equal(manifest.start_url, '/');
  assert.ok(manifest.icons.some(icon => icon.sizes === '192x192'));
  assert.ok(manifest.icons.some(icon => icon.sizes === '512x512'));
  assert.match(html, /rel="manifest"/);
  assert.match(html, /id="pwa-install"/);
  assert.match(app, /beforeinstallprompt/);
  assert.match(worker, /if \(url\.pathname\.startsWith\('\/api\/'\)\) return/);
});

test('a interface limpa os dados privados quando a sessão expira', () => {
  assert.match(app, /response\.status === 401 && currentUser/);
  assert.match(app, /Sua sessão expirou/);
  assert.match(app, /showLogin\(\)/);
});

test('o vínculo de conta estudantil é restrito à gestão e a tela do professor não carrega a lista geral', () => {
  assert.match(html, /id="student-account-form"/);
  assert.match(html, /id="student-account-select"/);
  assert.match(app, /api\('\/api\/students\/' \+ Number\(payload\.student_id\) \+ '\/account'/);
  assert.match(app, /students-tab.*user\.role === 'teacher'/);
  assert.match(app, /clearDashboardData\(\)/);
  assert.match(app, /sessionController\.abort\(\)/);
  assert.match(server, /\/api\/students\/\:id\/account', requireAuth, requireCsrf, requireRoles\(\.\.\.RECORD_MANAGERS\)/);
});





test('o frontend real é servido pela mesma origem da API', () => {
  assert.match(server, /express\.static\(path\.join\(__dirname, '\.\.', 'public'\)/);
  assert.match(server, /function sameOrigin\(req\)/);
});

test('a interface de viagens permite consultar participantes e exibe ações conforme o perfil', () => {
  assert.match(app, /data-trip-action="participants"/);
  assert.match(app, /data-participant-action="authorization"/);
  assert.match(app, /data-participant-action="paper-authorization"/);
  assert.match(app, /data-participant-action="attendance"/);
  assert.match(app, /loadTripParticipants/);
  assert.match(html, /responsáveis vinculados podem autorizar/);
});

test('as rotas de autorização e presença exigem perfis e proteção CSRF', () => {
  assert.match(server, /\/api\/trips\/:id\/participants/);
  assert.match(server, /\/authorization', requireAuth, requireCsrf, requireRoles\('guardian'\)/);
  assert.match(server, /\/attendance', requireAuth, requireCsrf/);
  assert.match(server, /\/paper-authorization',\s*requireAuth, requireCsrf, requireRoles\(\.\.\.RECORD_MANAGERS\)/);
  assert.match(server, /requireRoles\(\.\.\.RECORD_MANAGERS, 'teacher'\)/);
});

test('o módulo de transporte possui frota, atribuição e validações no servidor', () => {
  assert.match(html, /id="vehicles-panel"/);
  assert.match(html, /id="vehicle-form"/);
  assert.match(html, /id="driver-form"/);
  assert.match(html, /id="trip-driver-form"/);
  assert.match(app, /api\('\/api\/vehicles'/);
  assert.match(app, /api\('\/api\/drivers'/);
  assert.match(app, /clearDashboardData\(\)/);
  assert.match(app, /dashboardView\.querySelectorAll\('\.data-list, tbody'\)/);
  assert.match(server, /app\.post\('\/api\/drivers', requireAuth, requireCsrf, requireRoles\(\.\.\.RECORD_MANAGERS\)/);
  assert.match(server, /app\.post\('\/api\/trips\/:id\/driver', requireAuth, requireCsrf, requireRoles\(\.\.\.RECORD_MANAGERS\)/);
  assert.match(server, /assign_driver/);
  assert.match(app, /api\('\/api\/trips\/' \+ Number\(payload\.trip_id\) \+ '\/vehicle'/);
  assert.match(server, /app\.post\('\/api\/trips\/:id\/vehicle', requireAuth, requireCsrf, requireRoles\(\.\.\.RECORD_MANAGERS\)/);
  assert.match(server, /schedule-conflict/);
  assert.match(server, /insufficient-capacity/);
});

test('relatórios exibem apenas agregados e exigem perfil de gestão', () => {
  assert.match(html, /id="reports-panel"/);
  assert.match(html, /id="report-trips-body"/);
  assert.match(html, /id="export-report-csv"/);
  assert.match(app, /api\('\/api\/reports\/summary'/);
  assert.match(app, /function exportReportCsv\(\)/);
  assert.match(app, /function csvCell\(value\)/);
  assert.match(server, /app\.get\('\/api\/reports\/summary', requireAuth, requireRoles\(\.\.\.RECORD_MANAGERS\)/);
});

