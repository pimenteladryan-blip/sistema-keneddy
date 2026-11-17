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
  const paperStudentResponse = await adminApi('/api/students', {
    method: 'POST', body: JSON.stringify({ full_name: 'Estudante com autorização em papel', class_id: classId })
  });
  assert.equal(paperStudentResponse.status, 201);
  const paperStudentId = (await paperStudentResponse.json()).id;
  const guardianLink = await adminApi('/api/students/' + studentId + '/guardians', {
    method: 'POST',
    body: JSON.stringify({ email: 'responsavel-viagem@sgve.local', relationship: 'Responsável' })
  });
  assert.equal(guardianLink.status, 200);
  assert.equal((await adminApi('/api/students/' + studentId + '/guardians', {
    method: 'POST', body: JSON.stringify({ email: 'responsavel-viagem@sgve.local', relationship: 'Responsável' })
  })).status, 200);
  assert.equal((await adminApi('/api/students/' + paperStudentId + '/guardians', {
    method: 'POST', body: JSON.stringify({ email: 'responsavel-viagem@sgve.local', relationship: 'Responsável' })
  })).status, 200);

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
  for (let attempt = 0; attempt < 2; attempt += 1) {
    assert.equal((await adminApi('/api/trips/' + tripId + '/classes', {
      method: 'POST', body: JSON.stringify({ class_id: classId })
    })).status, 200);
    assert.equal((await adminApi('/api/trips/' + tripId + '/students', {
      method: 'POST', body: JSON.stringify({ student_id: studentId })
    })).status, 200);
  }
  assert.equal((await adminApi('/api/trips/' + tripId + '/students', {
    method: 'POST', body: JSON.stringify({ student_id: paperStudentId })
  })).status, 200);
  const teacherUsersDb = new DatabaseSync(path.join(tempDir, 'sgve.sqlite'), { readOnly: true });
  let teacherId;
  try {
    teacherId = teacherUsersDb.prepare('SELECT id FROM users WHERE email = ?').get('professor-viagem@sgve.local').id;
  } finally { teacherUsersDb.close(); }
  for (let attempt = 0; attempt < 2; attempt += 1) {
    assert.equal((await adminApi('/api/trips/' + tripId + '/staff', {
      method: 'POST', body: JSON.stringify({ user_id: teacherId })
    })).status, 200);
  }
  assert.equal((await adminApi('/api/trips/' + tripId + '/submit', {
    method: 'POST', body: JSON.stringify({})
  })).status, 200);
  assert.equal((await adminApi('/api/trips/' + tripId + '/approve', {
    method: 'POST', body: JSON.stringify({})
  })).status, 200);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    assert.equal((await adminApi('/api/trips/' + tripId + '/participants/' + paperStudentId + '/paper-authorization', {
      method: 'POST', body: JSON.stringify({})
    })).status, 200);
  }


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
  assert.equal((await teacherParticipants.json()).participants.length, 2);
  assert.equal((await teacherApi('/api/trips/' + tripId + '/participants/' + studentId + '/authorization', {
    method: 'POST', body: JSON.stringify({ status: 'authorized' })
  })).status, 403);
  assert.equal((await teacherApi('/api/trips/' + tripId + '/participants/' + paperStudentId + '/paper-authorization', {
    method: 'POST', body: JSON.stringify({})
  })).status, 403, 'professor não pode registrar autorização em papel');
  const guardianApi = await loginRole('responsavel-viagem@sgve.local');
  const guardianParticipants = await guardianApi('/api/trips/' + tripId + '/participants');
  assert.equal(guardianParticipants.status, 200);
  assert.equal((await guardianParticipants.json()).participants.length, 2);
  const authResult = () => guardianApi('/api/trips/' + tripId + '/participants/' + studentId + '/authorization', {
    method: 'POST', body: JSON.stringify({ status: 'authorized' })
  });
  assert.equal((await authResult()).status, 200);
  assert.equal((await authResult()).status, 200);
  assert.equal((await adminApi('/api/trips/' + tripId + '/participants/' + studentId + '/paper-authorization', {
    method: 'POST', body: JSON.stringify({})
  })).status, 409, 'registro em papel não deve substituir decisão digital');
  assert.equal((await guardianApi('/api/trips/' + tripId + '/participants/' + paperStudentId + '/authorization', {
    method: 'POST', body: JSON.stringify({ status: 'authorized' })
  })).status, 409, 'decisão digital não pode substituir autorização em papel');
  assert.equal((await guardianApi('/api/trips/' + tripId + '/participants/' + paperStudentId + '/paper-authorization', {
    method: 'POST', body: JSON.stringify({})
  })).status, 403, 'responsável não pode registrar autorização em papel administrativamente');
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
    assert.equal(verifyDb.prepare("SELECT authorization_status FROM trip_students WHERE trip_id = ? AND student_id = ?").get(tripId, paperStudentId).authorization_status, 'paper_recorded');
    assert.equal(verifyDb.prepare("SELECT COUNT(*) AS total FROM audit_logs WHERE action = 'record_paper_authorization'").get().total, 1);
    assert.equal(verifyDb.prepare("SELECT COUNT(*) AS total FROM audit_logs WHERE action = 'mark_departure_present'").get().total, 1);
    const expectedLinkAudits = {
      link_guardian: 2, link_class: 1, link_student: 2, assign_teacher: 1
    };
    for (const [action, expected] of Object.entries(expectedLinkAudits)) {
      assert.equal(verifyDb.prepare('SELECT COUNT(*) AS total FROM audit_logs WHERE action = ?').get(action).total, expected,
        'vínculos repetidos não devem duplicar auditoria: ' + action);
    }
  } finally { verifyDb.close(); }
  const reportResponse = await adminApi('/api/reports/summary');
  assert.equal(reportResponse.status, 200);
  const report = await reportResponse.json();
  const tripReport = report.trips.find(item => item.id === tripId);
  assert.ok(tripReport);
  assert.equal(tripReport.participants, 2);
  assert.equal(Object.hasOwn(tripReport, 'student_id'), false);
  assert.equal(Object.hasOwn(tripReport, 'full_name'), false);
  assert.equal(tripReport.authorized, 1);
  assert.equal(tripReport.paper_recorded, 1);
  assert.equal(tripReport.departure_present, 1);
  assert.equal(report.totals.authorized, 1);
  assert.equal(report.totals.paper_recorded, 1);
  assert.equal(report.totals.departure_present, 1);
});

test('frota e atribuição de veículos validam capacidade, conflito de horários e permissões no SQLite', async () => {
  const admin = await adminSession();
  const adminApi = (route, options = {}) => fetch(baseUrl + route, {
    ...options,
    headers: {
      'Content-Type': 'application/json', Origin: baseUrl,
      Cookie: admin.cookie, 'X-CSRF-Token': admin.csrfToken,
      ...(options.headers || {})
    }
  });
  const vehicleResponse = await adminApi('/api/vehicles', {
    method: 'POST',
    body: JSON.stringify({ name: 'Van Teste 01', type: 'Van', capacity: 30 })
  });
  assert.equal(vehicleResponse.status, 201);
  const vehicleId = (await vehicleResponse.json()).id;
  assert.equal((await adminApi('/api/vehicles')).status, 200);
  assert.equal((await adminApi('/api/vehicles', {
    method: 'POST',
    body: JSON.stringify({ name: 'van teste 01', type: 'Van', capacity: 30 })
  })).status, 409);
  assert.equal((await adminApi('/api/vehicles', {
    method: 'POST',
    body: JSON.stringify({ name: 'Veículo Inválido', type: 'Carro', capacity: 0 })
  })).status, 400);
  const driverResponse = await adminApi('/api/drivers', {
    method: 'POST', body: JSON.stringify({ name: 'Condutor Teste 01' })
  });
  assert.equal(driverResponse.status, 201);
  const driverId = (await driverResponse.json()).id;
  assert.equal((await adminApi('/api/drivers')).status, 200);
  assert.equal((await adminApi('/api/drivers', {
    method: 'POST', body: JSON.stringify({ name: 'condutor teste 01' })
  })).status, 409, 'nomes duplicados sem diferenciar maiúsculas devem ser bloqueados');
  assert.equal((await adminApi('/api/drivers', {
    method: 'POST', body: JSON.stringify({ name: 'X' })
  })).status, 400);

  const createTrip = async (title, departure, returning, capacity = 30) => {
    const response = await adminApi('/api/trips', {
      method: 'POST',
      body: JSON.stringify({
        title, destination: 'Destino fictício',
        educational_purpose: 'Atividade pedagógica de teste',
        departure_at: departure, return_at: returning, capacity
      })
    });
    assert.equal(response.status, 201);
    return (await response.json()).id;
  };
  const baseTrip = await createTrip('Viagem base', '2099-12-10T08:00:00.000Z', '2099-12-10T10:00:00.000Z');
  const overlappingTrip = await createTrip('Viagem sobreposta', '2099-12-10T09:59:00.000Z', '2099-12-10T11:00:00.000Z');
  const adjacentTrip = await createTrip('Viagem adjacente', '2099-12-10T10:00:00.000Z', '2099-12-10T11:00:00.000Z');
  const oversizedTrip = await createTrip('Viagem maior', '2099-12-11T08:00:00.000Z', '2099-12-11T10:00:00.000Z', 31);

  const assign = (tripId, id = vehicleId) => adminApi('/api/trips/' + tripId + '/vehicle', {
    method: 'POST', body: JSON.stringify({ vehicle_id: id })
  });
  assert.equal((await assign(baseTrip)).status, 200);
  assert.equal((await assign(baseTrip)).status, 200, 'repetir a mesma atribuição deve ser idempotente');
  assert.equal((await assign(overlappingTrip)).status, 409, 'horários sobrepostos devem ser bloqueados');
  assert.equal((await assign(adjacentTrip)).status, 200, 'viagens consecutivas sem sobreposição podem usar o mesmo veículo');
  assert.equal((await assign(oversizedTrip)).status, 409, 'veículo menor que a capacidade da viagem deve ser bloqueado');
  const assignDriver = (tripId, id = driverId) => adminApi('/api/trips/' + tripId + '/driver', {
    method: 'POST', body: JSON.stringify({ driver_id: id })
  });
  assert.equal((await assignDriver(baseTrip)).status, 200);
  assert.equal((await assignDriver(baseTrip)).status, 200, 'repetir a mesma atribuição de condutor deve ser idempotente');
  assert.equal((await assignDriver(overlappingTrip)).status, 409, 'condutor não pode estar em viagens com horários sobrepostos');
  assert.equal((await assignDriver(adjacentTrip)).status, 200, 'condutor pode atender viagens consecutivas sem sobreposição');
  assert.equal((await assignDriver(oversizedTrip)).status, 200);

  const classResponse = await adminApi('/api/classes', {
    method: 'POST',
    body: JSON.stringify({ level: 'medio', grade: '2º ano', course: 'regular', section: 'V', school_year: 2026 })
  });
  assert.equal(classResponse.status, 201);
  const classId = (await classResponse.json()).id;
  assert.equal((await adminApi('/api/trips/' + baseTrip + '/classes', {
    method: 'POST', body: JSON.stringify({ class_id: classId })
  })).status, 200);
  assert.equal((await adminApi('/api/trips/' + baseTrip + '/submit', {
    method: 'POST', body: JSON.stringify({})
  })).status, 200);
  assert.equal((await adminApi('/api/trips/' + baseTrip + '/approve', {
    method: 'POST', body: JSON.stringify({})
  })).status, 200);
  assert.equal((await assign(baseTrip)).status, 409, 'viagem aprovada não pode ter transporte alterado');

  const trips = await adminApi('/api/trips');
  const tripList = (await trips.json()).trips;
  assert.equal(tripList.find(item => item.id === baseTrip).vehicle_name, 'Van Teste 01');
  assert.equal(tripList.find(item => item.id === baseTrip).driver_name, 'Condutor Teste 01');
  const verifyDb = new DatabaseSync(path.join(tempDir, 'sgve.sqlite'), { readOnly: true });
  try {
    assert.equal(verifyDb.prepare("SELECT COUNT(*) AS total FROM audit_logs WHERE action = 'assign_vehicle'").get().total, 2,
      'somente as duas atribuições efetivas devem gerar auditoria');
    assert.equal(verifyDb.prepare("SELECT COUNT(*) AS total FROM audit_logs WHERE action = 'assign_driver'").get().total, 3,
      'somente as três atribuições efetivas de condutor devem gerar auditoria');
    assert.equal(verifyDb.prepare('SELECT vehicle_id FROM trips WHERE id = ?').get(baseTrip).vehicle_id, vehicleId);
    assert.equal(verifyDb.prepare('SELECT vehicle_id FROM trips WHERE id = ?').get(overlappingTrip).vehicle_id, null);
  } finally { verifyDb.close(); }

  const concurrentDriverResponse = await adminApi('/api/drivers', {
    method: 'POST', body: JSON.stringify({ name: 'Condutor Concorrente' })
  });
  assert.equal(concurrentDriverResponse.status, 201);
  const concurrentDriverId = (await concurrentDriverResponse.json()).id;
  const concurrentTripA = await createTrip('Viagem concorrente A', '2099-12-13T08:00:00.000Z', '2099-12-13T10:00:00.000Z', 20);
  const concurrentTripB = await createTrip('Viagem concorrente B', '2099-12-13T09:00:00.000Z', '2099-12-13T11:00:00.000Z', 20);
  const concurrentAssignments = await Promise.all([
    assignDriver(concurrentTripA, concurrentDriverId),
    assignDriver(concurrentTripB, concurrentDriverId)
  ]);
  assert.deepEqual(concurrentAssignments.map(response => response.status).sort(), [200, 409],
    'duas atribuições simultâneas não podem reservar o mesmo condutor em horários sobrepostos');

  const teacherCreated = await adminApi('/api/users', {
    method: 'POST',
    body: JSON.stringify({ name: 'Professor sem gestão', email: 'professor-frota@sgve.local', role: 'teacher', password: 'SenhaSegura123!ABC' })
  });
  assert.equal(teacherCreated.status, 201);
  const teacherLogin = await fetch(baseUrl + '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: baseUrl },
    body: JSON.stringify({ email: 'professor-frota@sgve.local', password: 'SenhaSegura123!ABC' })
  });
  assert.equal(teacherLogin.status, 200);
  const teacherData = await teacherLogin.json();
  const teacherCookie = teacherLogin.headers.get('set-cookie').split(';')[0];
  const teacherPrivacyTrip = await createTrip('Viagem para teste de privacidade', '2099-12-12T08:00:00.000Z', '2099-12-12T10:00:00.000Z', 20);
  assert.equal((await assignDriver(teacherPrivacyTrip)).status, 200);
  assert.equal((await adminApi('/api/trips/' + teacherPrivacyTrip + '/staff', {
    method: 'POST', body: JSON.stringify({ user_id: teacherData.user.id })
  })).status, 200);
  const teacherVehicles = await fetch(baseUrl + '/api/vehicles', {
    headers: { Origin: baseUrl, Cookie: teacherCookie }
  });
  assert.equal(teacherVehicles.status, 403);
  const teacherTripsResponse = await fetch(baseUrl + '/api/trips', {
    headers: { Origin: baseUrl, Cookie: teacherCookie }
  });
  assert.equal(teacherTripsResponse.status, 200);
  const teacherTripRows = (await teacherTripsResponse.json()).trips;
  assert.equal(Object.hasOwn(teacherTripRows[0] || {}, 'driver_name'), false,
    'nome do condutor não deve ser exposto a professores sem função de gestão');
  assert.equal((await fetch(baseUrl + '/api/drivers', {
    headers: { Origin: baseUrl, Cookie: teacherCookie }
  })).status, 403, 'professores não podem consultar cadastro de condutores');
  const teacherReports = await fetch(baseUrl + '/api/reports/summary', {
    headers: { Origin: baseUrl, Cookie: teacherCookie }
  });
  assert.equal(teacherReports.status, 403);
});

