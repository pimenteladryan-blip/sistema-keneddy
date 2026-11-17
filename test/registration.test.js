'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { createServer } = require('node:net');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

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
      FIREBASE_SERVICE_ACCOUNT_JSON: '',
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


function readRegistrationRecord(email) {
  const db = new DatabaseSync(path.join(tempDir, 'sgve.sqlite'), { readOnly: true });
  try {
    return db.prepare('SELECT password_hash, verification_code FROM registration_requests WHERE email = ?').get(email);
  } finally {
    db.close();
  }
}

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
  const headers = { Cookie: admin.cookie, 'X-CSRF-Token': admin.csrfToken, Origin: baseUrl };
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
  const approvedRecord = readRegistrationRecord(pendingEmail);
  assert.equal(approvedRecord.password_hash, null);
  assert.equal(approvedRecord.verification_code, '');

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
  const headers = { Cookie: admin.cookie, 'X-CSRF-Token': admin.csrfToken, Origin: baseUrl };
  const queueResponse = await fetch(baseUrl + '/api/registration-requests', { headers });
  const queue = await queueResponse.json();
  const request = queue.requests.find(item => item.email === rejectedEmail);
  assert.ok(request);

  const rejection = await fetch(baseUrl + '/api/registration-requests/' + request.id + '/reject', {
    method: 'POST', headers
  });
  assert.equal(rejection.status, 200);
  const rejectedRecord = readRegistrationRecord(rejectedEmail);
  assert.equal(rejectedRecord.password_hash, null);
  assert.equal(rejectedRecord.verification_code, '');

  const resubmitted = await submitRequest(rejectedEmail);
  assert.equal(resubmitted.status, 201);

  const login = await fetch(baseUrl + '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: baseUrl },
    body: JSON.stringify({ email: rejectedEmail, password: applicantPassword })
  });
  assert.equal(login.status, 401);
});

test('autorização familiar e presença respeitam vínculos e perfis no SQLite', async () => {
  const admin = await adminSession();
  const adminApi = (route, options = {}) => fetch(baseUrl + route, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Origin: baseUrl,
      Cookie: admin.cookie,
      'X-CSRF-Token': admin.csrfToken,
      ...(options.headers || {})
    }
  });
  const rolePassword = 'SenhaSegura123!ABC';
  for (const [name, email, role] of [
    ['Professor da viagem', 'professor-viagem@sgve.local', 'teacher'],
    ['Responsável da viagem', 'responsavel-viagem@sgve.local', 'guardian'],
    ['Responsável externo', 'responsavel-externo@sgve.local', 'guardian'],
    ['Professor externo', 'professor-externo@sgve.local', 'teacher']
  ]) {
    const created = await adminApi('/api/users', {
      method: 'POST', body: JSON.stringify({ name, email, role, password: rolePassword })
    });
    assert.equal(created.status, 201);
  }

  const classResponse = await adminApi('/api/classes', {
    method: 'POST',
    body: JSON.stringify({ level: 'medio', grade: '1º ano', course: 'regular', section: 'A', school_year: 2026 })
  });
  assert.equal(classResponse.status, 201);
  const classId = (await classResponse.json()).id;
  const studentResponse = await adminApi('/api/students', {
    method: 'POST', body: JSON.stringify({ full_name: 'Estudante Fictício', class_id: classId })
  });
  assert.equal(studentResponse.status, 201);
  const studentId = (await studentResponse.json()).id;
  const guardianLink = await adminApi('/api/students/' + studentId + '/guardians', {
    method: 'POST',
    body: JSON.stringify({ email: 'responsavel-viagem@sgve.local', relationship: 'Responsável' })
  });
  assert.equal(guardianLink.status, 200);

  const tripResponse = await adminApi('/api/trips', {
    method: 'POST',
    body: JSON.stringify({
      title: 'Visita de validação', destination: 'Museu fictício',
      educational_purpose: 'Atividade pedagógica de teste',
      departure_at: '2099-12-10T08:00:00.000Z',
      return_at: '2099-12-10T17:00:00.000Z', capacity: 2
    })
  });
  assert.equal(tripResponse.status, 201);
  const tripId = (await tripResponse.json()).id;
  assert.equal((await adminApi('/api/trips/' + tripId + '/classes', {
    method: 'POST', body: JSON.stringify({ class_id: classId })
  })).status, 200);
  assert.equal((await adminApi('/api/trips/' + tripId + '/students', {
    method: 'POST', body: JSON.stringify({ student_id: studentId })
  })).status, 200);
  const teacherLink = await adminApi('/api/trips/' + tripId + '/staff', {
    method: 'POST',
    body: JSON.stringify({ user_id: Number((await adminApi('/api/users')).status === 200 ? 0 : 0) })
  });
  assert.equal(teacherLink.status, 404);
  const teacherUsersDb = new DatabaseSync(path.join(tempDir, 'sgve.sqlite'), { readOnly: true });
  let teacherId;
  try {
    teacherId = teacherUsersDb.prepare('SELECT id FROM users WHERE email = ?').get('professor-viagem@sgve.local').id;
  } finally { teacherUsersDb.close(); }
  assert.equal((await adminApi('/api/trips/' + tripId + '/staff', {
    method: 'POST', body: JSON.stringify({ user_id: teacherId })
  })).status, 200);
  assert.equal((await adminApi('/api/trips/' + tripId + '/submit', {
    method: 'POST', body: JSON.stringify({})
  })).status, 200);
  assert.equal((await adminApi('/api/trips/' + tripId + '/approve', {
    method: 'POST', body: JSON.stringify({})
  })).status, 200);

  const loginRole = async email => {
    const response = await fetch(baseUrl + '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: baseUrl },
      body: JSON.stringify({ email, password: rolePassword })
    });
    assert.equal(response.status, 200);
    const data = await response.json();
    const cookie = response.headers.get('set-cookie').split(';')[0];
    return (route, options = {}) => fetch(baseUrl + route, {
      ...options,
      headers: {
        'Content-Type': 'application/json', Origin: baseUrl,
        Cookie: cookie, 'X-CSRF-Token': data.csrfToken,
        ...(options.headers || {})
      }
    });
  };
  const teacherApi = await loginRole('professor-viagem@sgve.local');
  const teacherParticipants = await teacherApi('/api/trips/' + tripId + '/participants');
  assert.equal(teacherParticipants.status, 200);
  assert.equal((await teacherParticipants.json()).participants.length, 1);
  assert.equal((await teacherApi('/api/trips/' + tripId + '/participants/' + studentId + '/authorization', {
    method: 'POST', body: JSON.stringify({ status: 'authorized' })
  })).status, 403);
  const guardianApi = await loginRole('responsavel-viagem@sgve.local');
  const guardianParticipants = await guardianApi('/api/trips/' + tripId + '/participants');
  assert.equal(guardianParticipants.status, 200);
  assert.equal((await guardianParticipants.json()).participants.length, 1);
  const authResult = () => guardianApi('/api/trips/' + tripId + '/participants/' + studentId + '/authorization', {
    method: 'POST', body: JSON.stringify({ status: 'authorized' })
  });
  assert.equal((await authResult()).status, 200);
  assert.equal((await authResult()).status, 200);
  const unrelatedGuardian = await loginRole('responsavel-externo@sgve.local');
  assert.equal((await unrelatedGuardian('/api/trips/' + tripId + '/participants/' + studentId + '/authorization', {
    method: 'POST', body: JSON.stringify({ status: 'authorized' })
  })).status, 404);
  assert.equal((await guardianApi('/api/trips/' + tripId + '/participants/' + studentId + '/attendance', {
    method: 'POST', body: JSON.stringify({ checkpoint: 'departure', present: true })
  })).status, 403);

  const attendanceResult = () => teacherApi('/api/trips/' + tripId + '/participants/' + studentId + '/attendance', {
    method: 'POST', body: JSON.stringify({ checkpoint: 'departure', present: true })
  });
  assert.equal((await attendanceResult()).status, 200);
  assert.equal((await attendanceResult()).status, 200);
  assert.equal((await teacherApi('/api/trips/' + tripId + '/participants/' + studentId + '/attendance', {
    method: 'POST', body: JSON.stringify({ checkpoint: 'invalid', present: true })
  })).status, 400);
  const unassignedTeacher = await loginRole('professor-externo@sgve.local');
  assert.equal((await unassignedTeacher('/api/trips/' + tripId + '/participants/' + studentId + '/attendance', {
    method: 'POST', body: JSON.stringify({ checkpoint: 'departure', present: true })
  })).status, 403);

  const verifyDb = new DatabaseSync(path.join(tempDir, 'sgve.sqlite'), { readOnly: true });
  try {
    const participant = verifyDb.prepare('SELECT authorization_status, departure_present FROM trip_students WHERE trip_id = ? AND student_id = ?').get(tripId, studentId);
    assert.equal(participant.authorization_status, 'authorized');
    assert.equal(participant.departure_present, 1);
    assert.equal(verifyDb.prepare("SELECT COUNT(*) AS total FROM audit_logs WHERE action = 'authorize_trip_student'").get().total, 1);
    assert.equal(verifyDb.prepare("SELECT COUNT(*) AS total FROM audit_logs WHERE action = 'mark_departure_present'").get().total, 1);
  } finally { verifyDb.close(); }
});

