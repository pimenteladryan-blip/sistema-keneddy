'use strict';

process.env.NODE_ENV = 'test';
process.env.FIREBASE_PROJECT_ID = 'demo-sgve';
process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';
delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { createServer } = require('node:net');
const path = require('node:path');
const { firestore, firebaseConfigured } = require('../server/firebase');
const auth = require('../server/firestore-auth');
const school = require('../server/firestore-school');
const store = require('../server/firestore-store');

const passwordHash = 'scrypt:' + 'a'.repeat(32) + ':' + 'b'.repeat(128);
const future = () => new Date(Date.now() + 60 * 60 * 1000).toISOString();

before(async () => {
  assert.equal(firebaseConfigured, true, 'o teste precisa executar dentro do Firestore Emulator');
  const response = await fetch(
    'http://127.0.0.1:8080/emulator/v1/projects/demo-sgve/databases/(default)/documents',
    { method: 'DELETE' }
  );
  assert.equal(response.ok, true, 'não foi possível limpar o Firestore Emulator');
});

test('fluxos críticos de autenticação, cadastro e viagens funcionam no Firestore Emulator', async () => {
  const adminId = await auth.createUser({
    display_name: 'Administrador de Teste',
    email: 'admin@emulator.sgve',
    password_hash: passwordHash,
    role: 'admin'
  });
  const teacherId = await auth.createUser({
    display_name: 'Professor de Teste',
    email: 'professor@emulator.sgve',
    password_hash: passwordHash,
    role: 'teacher'
  });
  const guardianId = await auth.createUser({
    display_name: 'Responsável de Teste',
    email: 'responsavel@emulator.sgve',
    password_hash: passwordHash,
    role: 'guardian'
  });

  assert.equal((await auth.findUserByEmail(' ADMIN@EMULATOR.SGVE ')).id, String(adminId));
  assert.equal((await auth.listUsers()).length, 3);

  const tokenHash = 'c'.repeat(64);
  const csrfToken = 'csrf-token-' + 'x'.repeat(32);
  await auth.createSessionWithAudit({
    token_hash: tokenHash, csrf_token: csrfToken,
    user_id: adminId, expires_at: future(), action: 'login_password'
  });
  const session = await auth.findSession(tokenHash);
  assert.equal(session.id, adminId);
  assert.equal(session.csrf_token, csrfToken);
  await auth.deleteSessionWithAudit(tokenHash, adminId);
  assert.equal(await auth.findSession(tokenHash), null);

  const classId = await school.createClass({
    level: 'medio', grade: '1º ano', course: 'regular',
    section: 'A', schoolYear: 2026
  });
  const firstStudentId = await school.createStudent('Estudante Um', classId);
  const secondStudentId = await school.createStudent('Estudante Dois', classId);
  assert.ok(firstStudentId > 0 && secondStudentId > firstStudentId);
  assert.equal((await school.listStudentsForUser({ id: adminId, role: 'admin' })).length, 2);

  assert.equal(await school.linkGuardian(firstStudentId, 'responsavel@emulator.sgve', 'Mãe'), true);
  const guardianStudents = await school.listStudentsForUser({ id: guardianId, role: 'guardian' });
  assert.equal(guardianStudents.length, 1);
  assert.equal(guardianStudents[0].id, firstStudentId);

  const tripId = await school.createTrip({
    title: 'Visita de Teste',
    destination: 'Museu de Teste',
    purpose: 'Atividade pedagógica',
    departure: '2026-12-01T08:00:00.000Z',
    returning: '2026-12-01T17:00:00.000Z',
    capacity: 1
  }, adminId);
  assert.deepEqual(await school.linkTripClass(tripId, classId), { ok: true });
  assert.deepEqual(await school.assignTripTeacher(tripId, teacherId), { ok: true });
  assert.deepEqual(await school.linkTripStudent(tripId, firstStudentId), { ok: true });
  assert.deepEqual(await school.linkTripStudent(tripId, secondStudentId), { error: 'capacity' });

  const teacherTrips = await school.listTripsForUser({ id: teacherId, role: 'teacher' });
  assert.equal(teacherTrips.length, 1);
  assert.equal(teacherTrips[0].participant_count, 1);
  assert.deepEqual(await school.submitTrip(tripId), { ok: true });
  assert.deepEqual(await school.approveTrip(tripId, adminId), { ok: true });
  assert.equal((await school.getTrip(tripId)).status, 'approved');

  await auth.createRegistrationRequest({
    display_name: 'Novo Professor',
    email: 'novo-professor@emulator.sgve',
    password_hash: passwordHash,
    role: 'teacher',
    verification_code: 'ABC234'
  });
  const pending = await auth.listPendingRegistrationRequests();
  const request = pending.find(item => item.email === 'novo-professor@emulator.sgve');
  assert.ok(request);
  const approvedId = await auth.reviewRegistrationRequest(request.id, adminId, 'approved');
  assert.ok(approvedId > 0);
  assert.equal((await auth.findUserByEmail('novo-professor@emulator.sgve')).active, true);
  assert.equal((await auth.listPendingRegistrationRequests()).length, 0);

  assert.ok(await store.list('auditLogs').then(rows => rows.length >= 2));
  await auth.setUserActive(guardianId, false);
  assert.equal((await auth.findUserById(guardianId)).active, false);

  const portServer = createServer();
  await new Promise(resolve => portServer.listen(0, '127.0.0.1', resolve));
  const port = portServer.address().port;
  await new Promise(resolve => portServer.close(resolve));
  const baseUrl = 'http://127.0.0.1:' + port;
  const appProcess = spawn(process.execPath, ['server/index.js'], {
    cwd: path.join(__dirname, '..'),
    env: {
      ...process.env,
      NODE_ENV: 'test',
      FIREBASE_PROJECT_ID: 'demo-sgve',
      FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
      FIREBASE_SERVICE_ACCOUNT_JSON: '',
      PORT: String(port),
      ADMIN_EMAIL: 'api-admin@emulator.sgve',
      ADMIN_PASSWORD: 'AdminTesteSenha2026!',
      ADMIN_NAME: 'Administrador API'
    },
    stdio: 'ignore'
  });
  try {
    let ready = false;
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      if (appProcess.exitCode !== null) throw new Error('Servidor Express encerrou antes de iniciar no modo Firestore.');
      try {
        const health = await fetch(baseUrl + '/api/health');
        if (health.ok) { ready = true; break; }
      } catch {}
      await new Promise(resolve => setTimeout(resolve, 150));
    }
    assert.equal(ready, true, 'servidor Express não iniciou no Firestore Emulator');

    const loginResponse = await fetch(baseUrl + '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: baseUrl },
      body: JSON.stringify({ email: 'api-admin@emulator.sgve', password: 'AdminTesteSenha2026!' })
    });
    assert.equal(loginResponse.status, 200);
    const cookie = loginResponse.headers.get('set-cookie').split(';')[0];
    const loginData = await loginResponse.json();
    const api = (route, options = {}) => fetch(baseUrl + route, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Origin: baseUrl,
        Cookie: cookie,
        'X-CSRF-Token': loginData.csrfToken,
        ...(options.headers || {})
      }
    });

    const classResponse = await api('/api/classes', {
      method: 'POST',
      body: JSON.stringify({ level: 'medio', grade: '3º ano', course: 'regular', section: 'B', school_year: 2026 })
    });
    assert.equal(classResponse.status, 201);
    const apiClassId = (await classResponse.json()).id;

    const studentResponse = await api('/api/students', {
      method: 'POST',
      body: JSON.stringify({ full_name: 'Estudante via API', class_id: apiClassId })
    });
    assert.equal(studentResponse.status, 201);
    const apiStudentId = (await studentResponse.json()).id;

    const tripResponse = await api('/api/trips', {
      method: 'POST',
      body: JSON.stringify({
        title: 'Viagem via API', destination: 'Museu da API',
        educational_purpose: 'Atividade pedagógica automatizada',
        departure_at: '2026-12-10T08:00:00.000Z',
        return_at: '2026-12-10T17:00:00.000Z', capacity: 2
      })
    });
    assert.equal(tripResponse.status, 201);
    const apiTripId = (await tripResponse.json()).id;

    const linkedClass = await api('/api/trips/' + apiTripId + '/classes', {
      method: 'POST', body: JSON.stringify({ class_id: apiClassId })
    });
    assert.equal(linkedClass.status, 200);
    const linkedStudent = await api('/api/trips/' + apiTripId + '/students', {
      method: 'POST', body: JSON.stringify({ student_id: apiStudentId })
    });
    assert.equal(linkedStudent.status, 200);
    const submittedTrip = await api('/api/trips/' + apiTripId + '/submit', {
      method: 'POST', body: JSON.stringify({})
    });
    assert.equal(submittedTrip.status, 200);
    const approvedTrip = await api('/api/trips/' + apiTripId + '/approve', {
      method: 'POST', body: JSON.stringify({})
    });
    assert.equal(approvedTrip.status, 200);

    const tripsResponse = await api('/api/trips');
    assert.equal(tripsResponse.status, 200);
    const tripsData = await tripsResponse.json();
    assert.equal(tripsData.trips.find(item => item.id === apiTripId).status, 'approved');

    const logoutResponse = await api('/api/auth/logout', {
      method: 'POST', body: JSON.stringify({})
    });
    assert.equal(logoutResponse.status, 200);
  } finally {
    appProcess.kill('SIGTERM');
    await new Promise(resolve => {
      if (appProcess.exitCode !== null) return resolve();
      appProcess.once('exit', resolve);
      setTimeout(resolve, 3000);
    });
  }
});
