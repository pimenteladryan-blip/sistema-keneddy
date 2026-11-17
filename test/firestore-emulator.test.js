'use strict';

process.env.NODE_ENV = 'test';
process.env.FIREBASE_PROJECT_ID = 'demo-sgve';
process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';

const { test, before } = require('node:test');
const assert = require('node:assert/strict');
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
});
