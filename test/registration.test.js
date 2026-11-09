'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { createServer } = require('node:net');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const adminEmail = 'admin-test@sgve.local';
const adminPassword = 'AdminSenhaSegura2026!';
const applicantPassword = 'SenhaSegura123!';
let child;
let baseUrl;
let tempDir;

async function freePort() {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

async function waitForServer() {
  const deadline = Date.now() + 12000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error('Servidor encerrou antes de iniciar.');
    try {
      const response = await fetch(baseUrl + '/api/health');
      if (response.ok) return;
    } catch (_) {}
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  throw new Error('Tempo esgotado aguardando o servidor de teste.');
}

before(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sgve-registration-'));
  const port = await freePort();
  baseUrl = 'http://127.0.0.1:' + port;
  child = spawn(process.execPath, ['server/index.js'], {
    cwd: root,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PORT: String(port),
      DATABASE_PATH: path.join(tempDir, 'sgve.sqlite'),
      ADMIN_EMAIL: adminEmail,
      ADMIN_PASSWORD: adminPassword,
      ADMIN_NAME: 'Administrador de Teste'
    },
    stdio: 'ignore'
  });
  await waitForServer();
});

after(async () => {
  if (child && child.exitCode === null) child.kill('SIGTERM');
  if (tempDir) await fs.rm(tempDir, { recursive: true, force: true });
});

async function submitRequest(email) {
  return fetch(baseUrl + '/api/registration-requests', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: baseUrl },
    body: JSON.stringify({
      name: 'Pessoa de Teste',
      email,
      role: 'teacher',
      password: applicantPassword
    })
  });
}

async function adminSession() {
  const response = await fetch(baseUrl + '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: baseUrl },
    body: JSON.stringify({ email: adminEmail, password: adminPassword })
  });
  assert.equal(response.status, 200);
  const cookie = response.headers.get('set-cookie').split(';')[0];
  const data = await response.json();
  return { cookie, csrfToken: data.csrfToken };
}

test('cadastro público só libera acesso após aprovação do administrador', async () => {
  const pendingEmail = 'professor-pendente@sgve.local';
  const submitted = await submitRequest(pendingEmail);
  assert.equal(submitted.status, 201);
  const submittedData = await submitted.json();
  assert.match(submittedData.verificationCode, /^[A-HJ-NP-Z2-9]{6}$/);

  const duplicate = await submitRequest(pendingEmail);
  assert.equal(duplicate.status, 409);

  const blockedLogin = await fetch(baseUrl + '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: baseUrl },
    body: JSON.stringify({ email: pendingEmail, password: applicantPassword })
  });
  assert.equal(blockedLogin.status, 401);

  const admin = await adminSession();
  const headers = { Cookie: admin.cookie, 'X-CSRF-Token': admin.csrfToken };
  const queueResponse = await fetch(baseUrl + '/api/registration-requests', { headers });
  assert.equal(queueResponse.status, 200);
  const queue = await queueResponse.json();
  const request = queue.requests.find(item => item.email === pendingEmail);
  assert.ok(request);
  assert.equal(request.verification_code, submittedData.verificationCode);
  assert.equal(Object.hasOwn(request, 'password_hash'), false);

  const approval = await fetch(baseUrl + '/api/registration-requests/' + request.id + '/approve', {
    method: 'POST', headers
  });
  assert.equal(approval.status, 200);

  const allowedLogin = await fetch(baseUrl + '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: baseUrl },
    body: JSON.stringify({ email: pendingEmail, password: applicantPassword })
  });
  assert.equal(allowedLogin.status, 200);
});

test('solicitação rejeitada não cria uma conta', async () => {
  const rejectedEmail = 'professor-rejeitado@sgve.local';
  const submitted = await submitRequest(rejectedEmail);
  assert.equal(submitted.status, 201);
  const admin = await adminSession();
  const headers = { Cookie: admin.cookie, 'X-CSRF-Token': admin.csrfToken };
  const queueResponse = await fetch(baseUrl + '/api/registration-requests', { headers });
  const queue = await queueResponse.json();
  const request = queue.requests.find(item => item.email === rejectedEmail);
  assert.ok(request);

  const rejection = await fetch(baseUrl + '/api/registration-requests/' + request.id + '/reject', {
    method: 'POST', headers
  });
  assert.equal(rejection.status, 200);

  const resubmitted = await submitRequest(rejectedEmail);
  assert.equal(resubmitted.status, 201);

  const login = await fetch(baseUrl + '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: baseUrl },
    body: JSON.stringify({ email: rejectedEmail, password: applicantPassword })
  });
  assert.equal(login.status, 401);
});
