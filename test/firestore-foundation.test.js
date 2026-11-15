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
