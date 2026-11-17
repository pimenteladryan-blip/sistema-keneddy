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
  assert.match(app, /new firebase\.auth\(\)\.GoogleAuthProvider\(\)/);
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
