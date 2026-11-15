'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const auth = require('../server/firestore-auth');
const store = require('../server/firestore-store');

test('publicUser expõe somente campos públicos e converte o identificador', () => {
  const result = auth.publicUser({
    id: '42',
    display_name: 'Pessoa de Teste',
    email: 'pessoa@sgve.local',
    role: 'teacher',
    active: true,
    password_hash: 'segredo',
    verification_code: 'ABC234'
  });

  assert.deepEqual(result, {
    id: 42,
    display_name: 'Pessoa de Teste',
    email: 'pessoa@sgve.local',
    role: 'teacher',
    active: true
  });
  assert.equal(Object.hasOwn(result, 'password_hash'), false);
  assert.equal(Object.hasOwn(result, 'verification_code'), false);
});

test('publicUser não considera valores truthy como conta ativa', () => {
  const result = auth.publicUser({
    id: 7,
    display_name: 'Conta Inativa',
    email: 'inativa@sgve.local',
    role: 'guardian',
    active: 1
  });

  assert.equal(result.active, false);
});

test('publicUser preserva a ausência de usuário', () => {
  assert.equal(auth.publicUser(null), null);
});

test('o mapa de coleções Firestore é fixo e contém as relações do SGVE', () => {
  assert.equal(store.COLLECTIONS.users, 'users');
  assert.equal(store.COLLECTIONS.registrationRequests, 'registration_requests');
  assert.equal(store.COLLECTIONS.tripStudents, 'trip_students');
  assert.equal(Object.isFrozen(store.COLLECTIONS), true);
});

test('o armazenamento rejeita nomes de coleção desconhecidos', async () => {
  await assert.rejects(
    store.create('colecao_inexistente', { value: 1 }),
    /Coleção SGVE desconhecida/
  );
});

test('o armazenamento rejeita dados que não sejam objetos simples', async () => {
  await assert.rejects(
    store.create('users', null),
    /Os dados do documento devem ser um objeto/
  );
  await assert.rejects(
    store.set('users', '1', []),
    /Os dados do documento devem ser um objeto/
  );
  await assert.rejects(
    store.update('users', '1', 'texto'),
    /Os dados do documento devem ser um objeto/
  );
});

test('as chaves compostas só são permitidas para turmas com cinco campos', async () => {
  await assert.rejects(
    store.createUniqueComposite('users', ['email'], { email: 'x@sgve.local' }),
    /Chave composta não permitida/
  );
  await assert.rejects(
    store.createUniqueComposite('classes', ['level', 'grade'], { level: 'medio', grade: '1' }),
    /Chave composta não permitida/
  );
});

test('relações transacionais aceitam somente os tipos previstos', async () => {
  await assert.rejects(
    store.createTripRelationIfDraft('users', 1, 2, {}),
    /Relação de viagem não permitida/
  );
});

test('dados da conta aprovada usam o e-mail normalizado e não expõem campos extras', () => {
  const result = auth.approvedUserData({
    display_name: 'Pessoa de Teste',
    email: 'pessoa@exemplo.com',
    password_hash: 'scrypt:' + 'a'.repeat(32) + ':' + 'b'.repeat(128),
    role: 'teacher'
  }, '2026-11-15T12:00:00.000Z');

  assert.deepEqual(result, {
    display_name: 'Pessoa de Teste',
    email: 'pessoa@exemplo.com',
    password_hash: 'scrypt:' + 'a'.repeat(32) + ':' + 'b'.repeat(128),
    role: 'teacher',
    active: true,
    created_at: '2026-11-15T12:00:00.000Z',
    updated_at: '2026-11-15T12:00:00.000Z'
  });
});

test('validação de cadastro normaliza nome e e-mail', () => {
  const result = auth.validateRegistrationRequest({
    display_name: '  Pessoa de Teste  ',
    email: '  PESSOA@EXEMPLO.COM  ',
    password_hash: 'scrypt:' + 'a'.repeat(32) + ':' + 'b'.repeat(128),
    role: 'teacher',
    verification_code: 'ABC234'
  });

  assert.equal(result.display_name, 'Pessoa de Teste');
  assert.equal(result.email, 'pessoa@exemplo.com');
  assert.equal(result.role, 'teacher');
});

test('validação de cadastro rejeita perfil não permitido', () => {
  assert.throws(() => auth.validateRegistrationRequest({
    display_name: 'Pessoa de Teste',
    email: 'pessoa@exemplo.com',
    password_hash: 'scrypt:' + 'a'.repeat(32) + ':' + 'b'.repeat(128),
    role: 'admin',
    verification_code: 'ABC234'
  }), error => error.code === 'invalid-request');
});

test('validação de cadastro rejeita e-mail, hash e código malformados', () => {
  const base = {
    display_name: 'Pessoa de Teste',
    email: 'pessoa@exemplo.com',
    password_hash: 'scrypt:' + 'a'.repeat(32) + ':' + 'b'.repeat(128),
    role: 'guardian',
    verification_code: 'ABC234'
  };
  for (const patch of [
    { email: 'email-invalido' },
    { password_hash: 'senha-em-texto' },
    { verification_code: '000000' },
    { display_name: '  ' }
  ]) {
    assert.throws(() => auth.validateRegistrationRequest({ ...base, ...patch }),
      error => error.code === 'invalid-request');
  }
});


test('criação de usuário Firestore rejeita dados inválidos antes de acessar o banco', async () => {
  const valid = {
    display_name: 'Pessoa de Teste',
    email: 'PESSOA@EXEMPLO.COM',
    password_hash: 'scrypt:' + 'a'.repeat(32) + ':' + 'b'.repeat(128),
    role: 'teacher'
  };

  await assert.rejects(
    auth.createUser({ ...valid, email: 'email-invalido' }),
    error => error.code === 'invalid-user'
  );
  await assert.rejects(
    auth.createUser({ ...valid, role: 'admin' }),
    error => error.code === 'invalid-user'
  );
  await assert.rejects(
    auth.createUser({ ...valid, password_hash: 'senha-em-texto' }),
    error => error.code === 'invalid-user'
  );
  await assert.rejects(
    auth.createUser({ ...valid, display_name: ' x ' }),
    error => error.code === 'invalid-user'
  );
});

test('importação de usuário exige ID numérico positivo e preserva papéis válidos', async () => {
  const valid = {
    id: 15,
    display_name: 'Pessoa de Teste',
    email: 'pessoa@exemplo.com',
    password_hash: 'scrypt:' + 'a'.repeat(32) + ':' + 'b'.repeat(128),
    role: 'guardian',
    active: true
  };

  for (const patch of [
    { id: 0 },
    { id: '1.5' },
    { id: 'abc' },
    { role: 'owner' },
    { active: 'true' },
    { email: 'invalido' },
    { password_hash: 'texto' }
  ]) {
    await assert.rejects(
      auth.importUserWithId({ ...valid, ...patch }),
      error => error.code === 'invalid-user'
    );
  }
});
