'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'public', 'js', 'app.js'), 'utf8');
const config = fs.readFileSync(path.join(root, 'public', 'firebase-config.js'), 'utf8');
const server = fs.readFileSync(path.join(root, 'server', 'index.js'), 'utf8');

test('a página carrega os SDKs Firebase antes do aplicativo e oferece login Google', () => {
  const appSdk = html.indexOf('firebase-app-compat.js');
  const authSdk = html.indexOf('firebase-auth-compat.js');
  const appScript = html.indexOf('/js/app.js');
  assert.ok(appSdk >= 0 && authSdk > appSdk && appScript > authSdk);
  assert.match(html, /id="google-login-button"/);
});

test('o login Google obtém ID token e cria sessão no backend', () => {
  assert.match(app, /new firebase\.auth\.GoogleAuthProvider\(\)/);
  assert.match(app, /getIdToken\(true\)/);
  assert.match(app, /api\('\/api\/auth\/google'/);
  assert.match(app, /X-CSRF-Token/);
});

test('a configuração web contém apenas campos públicos e o projeto esperado', () => {
  assert.match(config, /projectId: 'svge-14ec7'/);
  assert.match(config, /authDomain: 'svge-14ec7\.firebaseapp\.com'/);
  assert.doesNotMatch(config, /private_key|client_email|BEGIN PRIVATE KEY|FIREBASE_SERVICE_ACCOUNT_JSON/i);
});

test('o servidor verifica o ID token Google e exige usuário ativo previamente autorizado', () => {
  assert.match(server, /getAuth\(firebaseApp\)\.verifyIdToken\(idToken, true\)/);
  assert.match(server, /decoded\.firebase\?\.sign_in_provider !== 'google\.com'/);
  assert.match(server, /user\.active !== true/);
  assert.match(server, /setSessionCookie\(res, token\)/);
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

