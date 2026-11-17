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
const { hashPassword } = require('../server/security');

const passwordHash = 'scrypt:' + 'a'.repeat(32) + ':' + 'b'.repeat(128);
const future = () => new Date(Date.now() + 60 * 60 * 1000).toISOString();

before(async () => {
  assert.equal(firebaseConfigured, true, 'o teste precisa executar dentro do Firestore Emulator');
  const firstLimit = await auth.consumeRateLimit({
    scope: 'emulator-test', keys: ['ip:one', 'email:test@example.invalid'],
    windowMs: 60000, maxAttempts: 2, nowMs: 100000
  });
  assert.deepEqual(firstLimit, { allowed: true });
  assert.deepEqual(await auth.consumeRateLimit({
    scope: 'emulator-test', keys: ['ip:one', 'email:test@example.invalid'],
    windowMs: 60000, maxAttempts: 2, nowMs: 101000
  }), { allowed: true });
  assert.deepEqual(await auth.consumeRateLimit({
    scope: 'emulator-test', keys: ['ip:one', 'email:other@example.invalid'],
    windowMs: 60000, maxAttempts: 2, nowMs: 102000
  }), { allowed: false }, 'bucket bloqueado não deve incrementar parcialmente outros buckets');
  assert.deepEqual(await auth.consumeRateLimit({
    scope: 'emulator-test', keys: ['ip:one', 'email:test@example.invalid'],
    windowMs: 60000, maxAttempts: 2, nowMs: 160000
  }), { allowed: true }, 'janela expirada deve liberar novas tentativas');

  const simultaneousAttempts = await Promise.all(Array.from({ length: 3 }, () =>
    auth.consumeRateLimit({
      scope: 'emulator-concurrency',
      keys: ['shared-ip:concurrent', 'shared-email:concurrent@example.invalid'],
      windowMs: 60000,
      maxAttempts: 2,
      nowMs: 200000
    })
  ));
  assert.equal(simultaneousAttempts.filter(result => result.allowed).length, 2,
    'transações concorrentes devem respeitar o limite compartilhado sem excedê-lo');
  assert.equal(simultaneousAttempts.filter(result => !result.allowed).length, 1);

  const resetLimit = { scope: 'emulator-reset', keys: ['email:reset@example.invalid'], windowMs: 60000, maxAttempts: 1, nowMs: 300000 };
  assert.deepEqual(await auth.consumeRateLimit(resetLimit), { allowed: true });
  assert.deepEqual(await auth.consumeRateLimit(resetLimit), { allowed: false });
  await auth.resetRateLimit({ scope: resetLimit.scope, keys: resetLimit.keys });
  assert.deepEqual(await auth.consumeRateLimit(resetLimit), { allowed: true },
    'limite de conta deve ser limpo após autenticação válida');

  const response = await fetch(
    'http://127.0.0.1:8080/emulator/v1/projects/demo-sgve/databases/(default)/documents',
    { method: 'DELETE' }
  );
  assert.equal(response.ok, true, 'não foi possível limpar o Firestore Emulator');
  const publicRead = await fetch(
    'http://127.0.0.1:8080/v1/projects/demo-sgve/databases/(default)/documents/users'
  );
  assert.equal(publicRead.status, 403, 'regras devem negar leitura anônima direta no Firestore');
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

  const parallelAuditIds = await Promise.all(Array.from({ length: 12 }, (_, index) =>
    store.createWithNumericId('auditLogs', {
      actor_user_id: adminId, action: 'parallel_test_' + index,
      entity_type: 'test', entity_id: String(index)
    })
  ));
  assert.equal(new Set(parallelAuditIds).size, 12);
  assert.equal(parallelAuditIds.every(id => Number.isSafeInteger(id) && id > 0), true);

  const classId = await school.createClass({
    level: 'medio', grade: '1º ano', course: 'regular',
    section: 'A', schoolYear: 2026
  });
  const firstStudentId = await school.createStudent('Estudante Um', classId);
  const secondStudentId = await school.createStudent('Estudante Dois', classId);
  assert.ok(firstStudentId > 0 && secondStudentId > firstStudentId);
  assert.equal((await school.listStudentsForUser({ id: adminId, role: 'admin' })).length, 2);

  const guardianAuditBefore = await store.list('auditLogs', {
    filters: [{ field: 'action', op: '==', value: 'link_guardian' }]
  });
  assert.equal(await school.linkGuardian(firstStudentId, 'responsavel@emulator.sgve', 'Mãe', adminId), true);
  assert.equal(await school.linkGuardian(firstStudentId, 'responsavel@emulator.sgve', 'Mãe', adminId), true);
  const guardianAuditAfter = await store.list('auditLogs', {
    filters: [{ field: 'action', op: '==', value: 'link_guardian' }]
  });
  assert.equal(guardianAuditAfter.length, guardianAuditBefore.length + 1,
    'vínculo de responsável repetido não deve gerar auditoria duplicada');
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
  const classLinkAuditBefore = await store.list('auditLogs', {
    filters: [{ field: 'action', op: '==', value: 'link_class' }]
  });
  assert.deepEqual(await school.linkTripClass(tripId, classId, adminId), { ok: true });
  assert.deepEqual(await school.linkTripClass(tripId, classId, adminId), { ok: true });
  const classLinkAuditAfter = await store.list('auditLogs', {
    filters: [{ field: 'action', op: '==', value: 'link_class' }]
  });
  assert.equal(classLinkAuditAfter.length, classLinkAuditBefore.length + 1,
    'vínculo de turma repetido não deve gerar auditoria duplicada');

  const staffAuditBefore = await store.list('auditLogs', {
    filters: [{ field: 'action', op: '==', value: 'assign_teacher' }]
  });
  assert.deepEqual(await school.assignTripTeacher(tripId, teacherId, adminId), { ok: true });
  assert.deepEqual(await school.assignTripTeacher(tripId, teacherId, adminId), { ok: true });
  const staffAuditAfter = await store.list('auditLogs', {
    filters: [{ field: 'action', op: '==', value: 'assign_teacher' }]
  });
  assert.equal(staffAuditAfter.length, staffAuditBefore.length + 1,
    'vínculo de professor repetido não deve gerar auditoria duplicada');

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
  assert.equal((await store.list('auditLogs', { limit: 1000 })).some(event =>
    event.action === 'approve_registration' && event.entity_id === String(request.id)
  ), true, 'aprovação de cadastro precisa registrar auditoria na mesma transação');

  assert.ok(await store.list('auditLogs').then(rows => rows.length >= 2));
  await auth.setUserActive(guardianId, false);
  assert.equal((await auth.findUserById(guardianId)).active, false);

  const rolePassword = 'SenhaDeTeste2026!SGVE';
  const rolePasswordHash = await hashPassword(rolePassword);
  const roleAccounts = {};
  for (const role of ['direction', 'secretariat', 'teacher', 'guardian', 'student']) {
    roleAccounts[role] = await auth.createUser({
      display_name: 'Conta ' + role,
      email: role + '-api@emulator.sgve',
      password_hash: rolePasswordHash,
      role
    });
  }

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
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let serverOutput = '';
  appProcess.stdout.on('data', chunk => { serverOutput = (serverOutput + chunk.toString()).slice(-12000); });
  appProcess.stderr.on('data', chunk => { serverOutput = (serverOutput + chunk.toString()).slice(-12000); });
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

    const homePage = await fetch(baseUrl + '/');
    assert.equal(homePage.status, 200);
    assert.match(await homePage.text(), /google-login-button/);
    const firebaseConfigResponse = await fetch(baseUrl + '/firebase-config.js');
    assert.equal(firebaseConfigResponse.status, 200);
    assert.match(await firebaseConfigResponse.text(), /svge-14ec7/);
    const frontendScript = await fetch(baseUrl + '/js/app.js');
    assert.equal(frontendScript.status, 200);
    const healthResponse = await fetch(baseUrl + '/api/health');
    assert.equal((await healthResponse.json()).firebaseAdmin, 'initialized');

    const originlessLogin = await fetch(baseUrl + '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'api-admin@emulator.sgve', password: 'AdminTesteSenha2026!' })
    });
    assert.equal(originlessLogin.status, 403, 'requisições de autenticação sem Origin devem ser bloqueadas');

    const loginResponse = await fetch(baseUrl + '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: baseUrl },
      body: JSON.stringify({ email: 'api-admin@emulator.sgve', password: 'AdminTesteSenha2026!' })
    });
    assert.equal(loginResponse.status, 200);
    const cookie = loginResponse.headers.get('set-cookie').split(';')[0];
    const loginData = await loginResponse.json();
    const currentUserResponse = await fetch(baseUrl + '/api/auth/me', {
      headers: { Cookie: cookie }
    });
    assert.equal(currentUserResponse.status, 200);
    const currentUserData = await currentUserResponse.json();
    assert.equal(currentUserData.user.email, 'api-admin@emulator.sgve');

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

    await auth.createRegistrationRequest({
      display_name: 'Solicitação para teste de privacidade',
      email: 'solicitacao-privacidade@emulator.sgve',
      password_hash: rolePasswordHash,
      role: 'teacher',
      verification_code: 'XYZ789'
    });
    const pendingRequestsResponse = await api('/api/registration-requests');
    assert.equal(pendingRequestsResponse.status, 200);
    const pendingRequests = await pendingRequestsResponse.json();
    const pendingRequest = pendingRequests.requests.find(item => item.email === 'solicitacao-privacidade@emulator.sgve');
    assert.ok(pendingRequest);
    assert.equal(Object.hasOwn(pendingRequest, 'password_hash'), false,
      'a lista administrativa de solicitações não pode expor o hash da senha');
    assert.equal((await api('/api/registration-requests/' + pendingRequest.id + '/reject', {
      method: 'POST', body: JSON.stringify({})
    })).status, 200);
    const rejectedRequest = await store.get('registrationRequests', pendingRequest.id);
    assert.equal(rejectedRequest.password_hash, null);
    assert.equal(rejectedRequest.verification_code, null,
      'código de solicitação deve ser apagado após rejeição');

    await auth.createRegistrationRequest({
      display_name: 'Solicitação para aprovação via API',
      email: 'solicitacao-aprovacao-api@emulator.sgve',
      password_hash: rolePasswordHash,
      role: 'teacher',
      verification_code: 'QRS456'
    });
    const approvalListResponse = await api('/api/registration-requests');
    assert.equal(approvalListResponse.status, 200);
    const approvalList = await approvalListResponse.json();
    const approvalRequest = approvalList.requests.find(item => item.email === 'solicitacao-aprovacao-api@emulator.sgve');
    assert.ok(approvalRequest);
    const approvalResponse = await api('/api/registration-requests/' + approvalRequest.id + '/approve', {
      method: 'POST', body: JSON.stringify({})
    });
    assert.equal(approvalResponse.status, 200, 'a rota administrativa deve aceitar IDs numéricos válidos');
    assert.equal((await auth.findUserByEmail('solicitacao-aprovacao-api@emulator.sgve')).active, true);
    const approvedRequest = await store.get('registrationRequests', approvalRequest.id);
    assert.equal(approvedRequest.password_hash, null);
    assert.equal(approvedRequest.verification_code, null,
      'código de solicitação deve ser apagado após aprovação');

    await auth.createRegistrationRequest({
      display_name: 'Solicitação para aprovação concorrente',
      email: 'aprovacao-concorrente@emulator.sgve',
      password_hash: rolePasswordHash,
      role: 'teacher',
      verification_code: 'TUV234'
    });
    const concurrentListResponse = await api('/api/registration-requests');
    const concurrentList = await concurrentListResponse.json();
    const concurrentRequest = concurrentList.requests.find(item => item.email === 'aprovacao-concorrente@emulator.sgve');
    assert.ok(concurrentRequest);
    const concurrentApprovals = await Promise.all([
      api('/api/registration-requests/' + concurrentRequest.id + '/approve', {
        method: 'POST', body: JSON.stringify({})
      }),
      api('/api/registration-requests/' + concurrentRequest.id + '/approve', {
        method: 'POST', body: JSON.stringify({})
      })
    ]);
    const approvalResults = await Promise.all(concurrentApprovals.map(async response => ({
      status: response.status, body: await response.clone().text()
    })));
    const approvalStatuses = approvalResults.map(result => result.status).sort();
    assert.deepEqual(approvalStatuses, [200, 404],
      'duas aprovações simultâneas devem resultar em exatamente uma aprovação; respostas=' +
      JSON.stringify(approvalResults) + '; logs=' + serverOutput);
    assert.equal((await auth.findUserByEmail('aprovacao-concorrente@emulator.sgve')).active, true);

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
    const paperStudentResponse = await api('/api/students', {
      method: 'POST',
      body: JSON.stringify({ full_name: 'Estudante com autorização em papel', class_id: apiClassId })
    });
    assert.equal(paperStudentResponse.status, 201);
    const paperStudentId = (await paperStudentResponse.json()).id;

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

    const vehicleResponse = await api('/api/vehicles', {
      method: 'POST',
      body: JSON.stringify({ name: 'Van Emulator 01', type: 'Van', capacity: 30 })
    });
    assert.equal(vehicleResponse.status, 201);
    const vehicleId = (await vehicleResponse.json()).id;
    assert.equal((await api('/api/vehicles')).status, 200);
    assert.equal((await api('/api/vehicles', {
      method: 'POST',
      body: JSON.stringify({ name: 'van emulator 01', type: 'Van', capacity: 30 })
    })).status, 409);
    assert.equal((await api('/api/vehicles', {
      method: 'POST',
      body: JSON.stringify({ name: 'Veículo Inválido', type: 'Carro', capacity: 0 })
    })).status, 400);
    const driverResponse = await api('/api/drivers', {
      method: 'POST', body: JSON.stringify({ name: 'Condutor Emulator 01' })
    });
    assert.equal(driverResponse.status, 201);
    const driverId = (await driverResponse.json()).id;
    assert.equal((await api('/api/drivers')).status, 200);
    assert.equal((await api('/api/drivers', {
      method: 'POST', body: JSON.stringify({ name: 'condutor emulator 01' })
    })).status, 409);
    assert.equal((await api('/api/drivers', {
      method: 'POST', body: JSON.stringify({ name: 'X' })
    })).status, 400);
    const assignVehicle = (tripId, id = vehicleId) => api('/api/trips/' + tripId + '/vehicle', {
      method: 'POST', body: JSON.stringify({ vehicle_id: id })
    });
    assert.equal((await assignVehicle(apiTripId)).status, 200);
    assert.equal((await assignVehicle(apiTripId)).status, 200,
      'repetir atribuição não deve duplicar a auditoria');
    const overlapTripResponse = await api('/api/trips', {
      method: 'POST',
      body: JSON.stringify({
        title: 'Viagem sobreposta', destination: 'Destino fictício',
        educational_purpose: 'Teste de conflito de frota',
        departure_at: '2026-12-10T16:59:00.000Z',
        return_at: '2026-12-10T18:00:00.000Z', capacity: 2
      })
    });
    assert.equal(overlapTripResponse.status, 201);
    const overlapTripId = (await overlapTripResponse.json()).id;
    assert.equal((await assignVehicle(overlapTripId)).status, 409);
    const adjacentTripResponse = await api('/api/trips', {
      method: 'POST',
      body: JSON.stringify({
        title: 'Viagem adjacente', destination: 'Destino fictício',
        educational_purpose: 'Teste de intervalo sem conflito',
        departure_at: '2026-12-10T17:00:00.000Z',
        return_at: '2026-12-10T18:00:00.000Z', capacity: 2
      })
    });
    assert.equal(adjacentTripResponse.status, 201);
    const adjacentTripId = (await adjacentTripResponse.json()).id;
    assert.equal((await assignVehicle(adjacentTripId)).status, 200);
    const oversizedTripResponse = await api('/api/trips', {
      method: 'POST',
      body: JSON.stringify({
        title: 'Viagem maior que veículo', destination: 'Destino fictício',
        educational_purpose: 'Teste de capacidade de transporte',
        departure_at: '2026-12-11T08:00:00.000Z',
        return_at: '2026-12-11T10:00:00.000Z', capacity: 31
      })
    });
    assert.equal(oversizedTripResponse.status, 201);
    const oversizedTripId = (await oversizedTripResponse.json()).id;
    assert.equal((await assignVehicle(oversizedTripId)).status, 409);
    const assignDriver = (tripId, id = driverId) => api('/api/trips/' + tripId + '/driver', {
      method: 'POST', body: JSON.stringify({ driver_id: id })
    });
    assert.equal((await assignDriver(apiTripId)).status, 200);
    assert.equal((await assignDriver(apiTripId)).status, 200,
      'atribuição repetida de condutor deve ser idempotente');
    assert.equal((await assignDriver(overlapTripId)).status, 409,
      'condutor não pode ser reservado em horários sobrepostos');
    assert.equal((await assignDriver(adjacentTripId)).status, 200,
      'viagens consecutivas sem sobreposição podem usar o mesmo condutor');

    await school.linkGuardian(apiStudentId, 'guardian-api@emulator.sgve', 'Responsável');
    await school.linkGuardian(paperStudentId, 'guardian-api@emulator.sgve', 'Responsável');
    await store.update('students', apiStudentId, { user_id: roleAccounts.student });

    const linkedClass = await api('/api/trips/' + apiTripId + '/classes', {
      method: 'POST', body: JSON.stringify({ class_id: apiClassId })
    });
    assert.equal(linkedClass.status, 200);
    const linkedStudent = await api('/api/trips/' + apiTripId + '/students', {
      method: 'POST', body: JSON.stringify({ student_id: apiStudentId })
    });
    assert.equal(linkedStudent.status, 200);
    const linkedPaperStudent = await api('/api/trips/' + apiTripId + '/students', {
      method: 'POST', body: JSON.stringify({ student_id: paperStudentId })
    });
    assert.equal(linkedPaperStudent.status, 200);
    const assignedTeacher = await api('/api/trips/' + apiTripId + '/staff', {
      method: 'POST', body: JSON.stringify({ user_id: roleAccounts.teacher })
    });
    assert.equal(assignedTeacher.status, 200);
    const submittedTrip = await api('/api/trips/' + apiTripId + '/submit', {
      method: 'POST', body: JSON.stringify({})
    });
    assert.equal(submittedTrip.status, 200);
    const approvedTrip = await api('/api/trips/' + apiTripId + '/approve', {
      method: 'POST', body: JSON.stringify({})
    });
    assert.equal(approvedTrip.status, 200);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      assert.equal((await api('/api/trips/' + apiTripId + '/participants/' + paperStudentId + '/paper-authorization', {
        method: 'POST', body: JSON.stringify({})
      })).status, 200);
    }
    assert.equal((await assignVehicle(apiTripId)).status, 409,
      'transporte não pode ser alterado após aprovação');

    const tripsResponse = await api('/api/trips');
    assert.equal(tripsResponse.status, 200);
    const tripsData = await tripsResponse.json();
    assert.equal(tripsData.trips.find(item => item.id === apiTripId).status, 'approved');
    assert.equal(tripsData.trips.find(item => item.id === apiTripId).vehicle_name, 'Van Emulator 01');
    assert.equal(tripsData.trips.find(item => item.id === apiTripId).driver_name, 'Condutor Emulator 01');

    const createdUser = await api('/api/users', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Professor criado pela API',
        email: 'professor-criado@emulator.sgve',
        role: 'teacher',
        password: rolePassword
      })
    });
    assert.equal(createdUser.status, 201);
    const createdUserData = await createdUser.json();

    const apiAudit = await store.list('auditLogs', { limit: 1000 });
    const adminActorId = Number(loginData.user.id);
    const adminActions = new Set(apiAudit
      .filter(event => Number(event.actor_user_id) === adminActorId)
      .map(event => event.action));
    for (const action of [
      'login_password', 'create', 'link_class', 'link_student',
      'assign_teacher', 'submit_for_approval', 'approve', 'record_paper_authorization'
    ]) assert.equal(adminActions.has(action), true, 'evento de auditoria ausente: ' + action);
    assert.equal(apiAudit.some(event =>
      Number(event.actor_user_id) === adminActorId &&
      event.action === 'create' && event.entity_type === 'user'
    ), true, 'criação de usuário não foi auditada na transação');
    const vehicleAudit = apiAudit.filter(event =>
      Number(event.actor_user_id) === adminActorId && event.action === 'assign_vehicle'
    );
    assert.equal(vehicleAudit.length, 2,
      'somente as duas atribuições efetivas devem gerar auditoria');
    const driverAudit = apiAudit.filter(event =>
      Number(event.actor_user_id) === adminActorId && event.action === 'assign_driver'
    );
    assert.equal(driverAudit.length, 2,
      'somente as duas atribuições efetivas de condutor devem gerar auditoria');
    const paperAuthorizationAudit = apiAudit.filter(event =>
      Number(event.actor_user_id) === adminActorId && event.action === 'record_paper_authorization'
    );
    assert.equal(paperAuthorizationAudit.length, 1,
      'repetir o registro em papel não deve duplicar auditoria');
    for (const [action, entityType, entityId] of [
      ['create', 'class', apiClassId],
      ['create', 'student', apiStudentId],
      ['create', 'trip', apiTripId],
      ['create', 'user', createdUserData.user.id]
    ]) {
      assert.equal(apiAudit.some(event =>
        Number(event.actor_user_id) === adminActorId &&
        event.action === action && event.entity_type === entityType &&
        String(event.entity_id) === String(entityId)
      ), true, 'auditoria sem identificador correto: ' + entityType);
    }

    const loginAs = async (email) => {
      const response = await fetch(baseUrl + '/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: baseUrl },
        body: JSON.stringify({ email, password: rolePassword })
      });
      assert.equal(response.status, 200, 'login de perfil ' + email);
      const data = await response.json();
      const roleCookie = response.headers.get('set-cookie').split(';')[0];
      return (route, options = {}) => fetch(baseUrl + route, {
        ...options,
        headers: {
          'Content-Type': 'application/json', Origin: baseUrl,
          Cookie: roleCookie, 'X-CSRF-Token': data.csrfToken,
          ...(options.headers || {})
        }
      });
    };

    await auth.createUser({
      display_name: 'Professor sem vínculo',
      email: 'professor-sem-vinculo@emulator.sgve',
      password_hash: rolePasswordHash,
      role: 'teacher'
    });
    await auth.createUser({
      display_name: 'Responsável sem vínculo',
      email: 'responsavel-sem-vinculo@emulator.sgve',
      password_hash: rolePasswordHash,
      role: 'guardian'
    });
    const teacherApi = await loginAs('teacher-api@emulator.sgve');
    const teacherTripsResponse = await teacherApi('/api/trips');
    assert.equal(teacherTripsResponse.status, 200);
    const teacherTripRows = (await teacherTripsResponse.json()).trips;
    assert.equal(teacherTripRows.some(item => Object.hasOwn(item, 'driver_name')), false,
      'nome do condutor só pode ser retornado à equipe gestora');
    assert.equal((await teacherApi('/api/trips')).status, 200);
    assert.equal((await teacherApi('/api/students')).status, 403);
    assert.equal((await teacherApi('/api/users')).status, 403);
    assert.equal((await teacherApi('/api/vehicles')).status, 403);
    assert.equal((await teacherApi('/api/drivers')).status, 403,
      'professor não pode consultar cadastro de condutores');
    assert.equal((await teacherApi('/api/classes', {
      method: 'POST', body: JSON.stringify({ level: 'medio', grade: '4º ano', course: 'regular', section: 'A', school_year: 2026 })
    })).status, 403);
    const teacherParticipantsResponse = await teacherApi('/api/trips/' + apiTripId + '/participants');
    assert.equal(teacherParticipantsResponse.status, 200);
    assert.equal((await teacherParticipantsResponse.json()).participants.length, 2);
    const teacherAuthorizationAttempt = await teacherApi('/api/trips/' + apiTripId + '/participants/' + apiStudentId + '/authorization', {
      method: 'POST', body: JSON.stringify({ status: 'authorized' })
    });
    assert.equal(teacherAuthorizationAttempt.status, 403,
      'professor não pode responder pela autorização familiar: ' +
      await teacherAuthorizationAttempt.text() + '; logs=' + serverOutput);
    assert.equal((await teacherApi('/api/trips/' + apiTripId + '/participants/' + paperStudentId + '/paper-authorization', {
      method: 'POST', body: JSON.stringify({})
    })).status, 403, 'professor não pode registrar autorização em papel');
    const attendanceAuditBefore = await store.list('auditLogs', {
      filters: [{ field: 'action', op: '==', value: 'mark_departure_present' }]
    });
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const attendanceResponse = await teacherApi('/api/trips/' + apiTripId + '/participants/' + apiStudentId + '/attendance', {
        method: 'POST', body: JSON.stringify({ checkpoint: 'departure', present: true })
      });
      const attendanceBody = await attendanceResponse.text();
      assert.equal(attendanceResponse.status, 200,
        'registro de presença falhou: ' + attendanceBody + '; logs=' + serverOutput);
    }
    const attendanceAuditAfter = await store.list('auditLogs', {
      filters: [{ field: 'action', op: '==', value: 'mark_departure_present' }]
    });
    assert.equal(attendanceAuditAfter.length, attendanceAuditBefore.length + 1,
      'repetir a mesma presença não deve duplicar auditoria');
    const unassignedTeacherApi = await loginAs('professor-sem-vinculo@emulator.sgve');
    assert.equal((await unassignedTeacherApi('/api/trips/' + apiTripId + '/participants')).status, 403);
    assert.equal((await unassignedTeacherApi('/api/trips/' + apiTripId + '/participants/' + apiStudentId + '/attendance', {
      method: 'POST', body: JSON.stringify({ checkpoint: 'departure', present: true })
    })).status, 403, 'professor sem vínculo não pode registrar presença');

    const guardianApi = await loginAs('guardian-api@emulator.sgve');
    const guardianStudentList = await guardianApi('/api/students');
    assert.equal(guardianStudentList.status, 200);
    assert.equal((await guardianStudentList.json()).students.length, 2);
    assert.equal((await guardianApi('/api/trips')).status, 200);
    assert.equal((await guardianApi('/api/users')).status, 403);
    const guardianParticipantsResponse = await guardianApi('/api/trips/' + apiTripId + '/participants');
    assert.equal(guardianParticipantsResponse.status, 200);
    const guardianParticipants = (await guardianParticipantsResponse.json()).participants;
    assert.equal(guardianParticipants.length, 2);
    const guardianParticipant = guardianParticipants.find(item => item.student_id === apiStudentId);
    const paperGuardianParticipant = guardianParticipants.find(item => item.student_id === paperStudentId);
    assert.ok(guardianParticipant);
    assert.equal(guardianParticipant.authorization_status, 'pending');
    assert.ok(paperGuardianParticipant);
    assert.equal(paperGuardianParticipant.authorization_status, 'paper_recorded');
    const authorizationAuditBefore = await store.list('auditLogs', {
      filters: [{ field: 'action', op: '==', value: 'authorize_trip_student' }]
    });
    for (let attempt = 0; attempt < 2; attempt += 1) {
      assert.equal((await guardianApi('/api/trips/' + apiTripId + '/participants/' + apiStudentId + '/authorization', {
        method: 'POST', body: JSON.stringify({ status: 'authorized' })
      })).status, 200);
    }
    const authorizationAuditAfter = await store.list('auditLogs', {
      filters: [{ field: 'action', op: '==', value: 'authorize_trip_student' }]
    });
    assert.equal(authorizationAuditAfter.length, authorizationAuditBefore.length + 1,
      'repetir a mesma autorização não deve duplicar auditoria');
    assert.equal((await guardianApi('/api/trips/' + apiTripId + '/participants/' + paperStudentId + '/authorization', {
      method: 'POST', body: JSON.stringify({ status: 'authorized' })
    })).status, 409, 'decisão digital não pode substituir autorização em papel');
    assert.equal((await guardianApi('/api/trips/' + apiTripId + '/participants/' + paperStudentId + '/paper-authorization', {
      method: 'POST', body: JSON.stringify({})
    })).status, 403, 'responsável não pode registrar autorização em papel administrativamente');
    const unrelatedGuardianApi = await loginAs('responsavel-sem-vinculo@emulator.sgve');
    assert.equal((await unrelatedGuardianApi('/api/trips/' + apiTripId + '/participants/' + apiStudentId + '/authorization', {
      method: 'POST', body: JSON.stringify({ status: 'authorized' })
    })).status, 404, 'responsável sem vínculo não pode autorizar estudante alheio');
    assert.equal((await guardianApi('/api/trips/' + apiTripId + '/participants/' + apiStudentId + '/attendance', {
      method: 'POST', body: JSON.stringify({ checkpoint: 'departure', present: true })
    })).status, 403, 'responsável não pode registrar presença');
    assert.equal((await guardianApi('/api/trips/' + apiTripId + '/participants/' + paperStudentId + '/paper-authorization', {
      method: 'POST', body: JSON.stringify({})
    })).status, 403, 'responsável não pode registrar autorização em papel administrativamente');

    assert.equal((await api('/api/trips/' + apiTripId + '/participants/' + apiStudentId + '/paper-authorization', {
      method: 'POST', body: JSON.stringify({})
    })).status, 409, 'registro em papel não deve substituir autorização digital');
    const reportResponse = await api('/api/reports/summary');
    assert.equal(reportResponse.status, 200);
    const report = await reportResponse.json();
    const tripReport = report.trips.find(item => item.id === apiTripId);
    assert.ok(tripReport, 'relatório deve incluir a viagem fictícia');
    assert.equal(tripReport.participants, 2);
    assert.equal(Object.hasOwn(tripReport, 'student_id'), false);
    assert.equal(Object.hasOwn(tripReport, 'full_name'), false);
    assert.equal(tripReport.authorized, 1);
    assert.equal(tripReport.paper_recorded, 1);
    assert.equal(tripReport.departure_present, 1);
    assert.equal(tripReport.vehicle_name, 'Van Emulator 01');
    assert.equal(report.totals.authorized, 1);
    assert.equal(report.totals.paper_recorded, 1);
    assert.equal(report.totals.departure_present, 1);
    assert.equal((await teacherApi('/api/reports/summary')).status, 403,
      'relatórios agregados são restritos à equipe gestora');

    const studentApi = await loginAs('student-api@emulator.sgve');
    const ownStudents = await studentApi('/api/students');
    assert.equal(ownStudents.status, 200);
    assert.equal((await ownStudents.json()).students.length, 1);
    assert.equal((await studentApi('/api/trips')).status, 200);
    const studentParticipantsResponse = await studentApi('/api/trips/' + apiTripId + '/participants');
    assert.equal(studentParticipantsResponse.status, 200);
    assert.equal((await studentParticipantsResponse.json()).participants.length, 1);
    assert.equal((await studentApi('/api/trips/' + apiTripId + '/participants/' + apiStudentId + '/authorization', {
      method: 'POST', body: JSON.stringify({ status: 'authorized' })
    })).status, 403);
    assert.equal((await studentApi('/api/users')).status, 403);

    const directionApi = await loginAs('direction-api@emulator.sgve');
    const directionUsersResponse = await directionApi('/api/users');
    assert.equal(directionUsersResponse.status, 200);
    const directionUsers = await directionUsersResponse.json();
    assert.equal(directionUsers.users.every(user => !Object.hasOwn(user, 'password_hash')), true,
      'a listagem de usuários não pode expor hashes de senha');
    assert.equal((await directionApi('/api/registration-requests')).status, 403);
    assert.equal((await directionApi('/api/trips/' + apiTripId + '/approve', {
      method: 'POST', body: JSON.stringify({})
    })).status, 409);

    const secretariatApi = await loginAs('secretariat-api@emulator.sgve');
    assert.equal((await secretariatApi('/api/users')).status, 403);
    assert.equal((await secretariatApi('/api/registration-requests')).status, 403);
    assert.equal((await secretariatApi('/api/students')).status, 200);

    await auth.createUser({
      display_name: 'Conta Limite de Login',
      email: 'rate-limit-api@emulator.sgve',
      password_hash: rolePasswordHash,
      role: 'teacher'
    });
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const failedLogin = await fetch(baseUrl + '/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: baseUrl },
        body: JSON.stringify({ email: 'rate-limit-api@emulator.sgve', password: 'SenhaIncorreta2026!' })
      });
      assert.equal(failedLogin.status, 401);
    }
    const blockedLogin = await fetch(baseUrl + '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: baseUrl },
      body: JSON.stringify({ email: 'rate-limit-api@emulator.sgve', password: rolePassword })
    });
    assert.equal(blockedLogin.status, 429, 'API deve bloquear novas tentativas após o limite por conta');

    await auth.createUser({
      display_name: 'Conta Limite Reset',
      email: 'rate-limit-reset-api@emulator.sgve',
      password_hash: rolePasswordHash,
      role: 'teacher'
    });
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const failedLogin = await fetch(baseUrl + '/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: baseUrl },
        body: JSON.stringify({ email: 'rate-limit-reset-api@emulator.sgve', password: 'SenhaIncorreta2026!' })
      });
      assert.equal(failedLogin.status, 401);
    }
    const validResetLogin = await fetch(baseUrl + '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: baseUrl },
      body: JSON.stringify({ email: 'rate-limit-reset-api@emulator.sgve', password: rolePassword })
    });
    assert.equal(validResetLogin.status, 200, 'login correto ainda deve ser permitido no limite');
    const failedAfterSuccess = await fetch(baseUrl + '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: baseUrl },
      body: JSON.stringify({ email: 'rate-limit-reset-api@emulator.sgve', password: 'SenhaIncorreta2026!' })
    });
    assert.equal(failedAfterSuccess.status, 401,
      'login válido deve limpar o contador por conta para evitar bloqueio de usuário legítimo');

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
