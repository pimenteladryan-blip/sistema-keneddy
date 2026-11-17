'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
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
  assert.equal(store.COLLECTIONS.vehicles, 'vehicles');
  assert.equal(Object.isFrozen(store.COLLECTIONS), true);
});

test('as regras do Firestore bloqueiam acesso direto de clientes e estão ligadas à configuração', () => {
  const root = path.resolve(__dirname, '..');
  const firebaseConfig = JSON.parse(fs.readFileSync(path.join(root, 'firebase.json'), 'utf8'));
  const rules = fs.readFileSync(path.join(root, firebaseConfig.firestore.rules), 'utf8');
  assert.match(rules, /allow read, write:\s*if false;/);
  assert.doesNotMatch(rules, /allow read, write:\s*if true;/);
  assert.equal(firebaseConfig.firestore.indexes, 'firestore.indexes.json');
});

test('o Firestore configura expiração TTL para os documentos de limite', () => {
  const root = path.resolve(__dirname, '..');
  const config = JSON.parse(fs.readFileSync(path.join(root, 'firestore.indexes.json'), 'utf8'));
  assert.equal(config.fieldOverrides.some(item =>
    item.collectionGroup === '_sgve_rate_limits' &&
    item.fieldPath === 'expires_at' && item.ttl === true &&
    Array.isArray(item.indexes) && item.indexes.length === 0
  ), true);
});

test('produção exige Firebase antes de inicializar o banco SQLite local', () => {
  const root = path.resolve(__dirname, '..');
  const source = fs.readFileSync(path.join(root, 'server/index.js'), 'utf8');
  const guard = source.indexOf("if (isProduction && !firebaseConfigured)");
  const sqlite = source.indexOf("require('./db')");
  assert.ok(guard >= 0 && guard < sqlite);
});

test('login Google também possui limitação de tentativas por IP', () => {
  const root = path.resolve(__dirname, '..');
  const source = fs.readFileSync(path.join(root, 'server/index.js'), 'utf8');
  assert.match(source, /consumeAttempts\('google-login-ip'/);
});

test('todas as rotas POST privadas exigem autenticação e proteção CSRF', () => {
  const root = path.resolve(__dirname, '..');
  const source = fs.readFileSync(path.join(root, 'server/index.js'), 'utf8');
  const publicRoutes = [
    "app.post('/api/registration-requests',",
    "app.post('/api/auth/login',",
    "app.post('/api/auth/google',"
  ];
  const sourceLines = source.split(/\r?\n/);
  const postRoutes = sourceLines
    .map((line, index) => line.includes("app.post('/api/")
      ? sourceLines.slice(index, index + 4).join(' ')
      : null)
    .filter(Boolean);
  assert.ok(postRoutes.length >= 10, 'o teste deve encontrar as rotas de mutação do SGVE');
  for (const route of postRoutes) {
    if (publicRoutes.some(prefix => route.includes(prefix))) continue;
    assert.match(route, /requireAuth/, 'rota privada sem autenticação: ' + route.slice(0, 100));
    assert.match(route, /requireCsrf/, 'rota privada sem CSRF: ' + route.slice(0, 100));
  }
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
    auth.createUser({ ...valid, role: 'owner' }),
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


test('auditoria Firestore rejeita eventos incompletos antes de acessar o banco', async () => {
  await assert.rejects(
    auth.createAuditLog({ action: '', entity_type: 'user' }),
    /Evento de auditoria inválido/
  );
  await assert.rejects(
    auth.createAuditLog({ action: 'login', entity_type: '' }),
    /Evento de auditoria inválido/
  );
  await assert.rejects(
    auth.createAuditLog({ actor_user_id: 0, action: 'login', entity_type: 'user' }),
    /Evento de auditoria inválido/
  );
  await assert.rejects(
    auth.createAuditLog({ actor_user_id: 'abc', action: 'login', entity_type: 'user' }),
    /Evento de auditoria inválido/
  );
});


test('operações atômicas de sessão validam entradas antes de acessar o Firestore', async () => {
  await assert.rejects(
    auth.createSessionWithAudit({
      token_hash: 'curto', csrf_token: 'x'.repeat(32),
      user_id: 3, expires_at: new Date(Date.now() + 60000).toISOString()
    }),
    /Dados de sessão inválidos/
  );
  await assert.rejects(
    auth.createSessionWithAudit({
      token_hash: 'a'.repeat(64), csrf_token: 'x'.repeat(32),
      user_id: 0, expires_at: new Date(Date.now() + 60000).toISOString()
    }),
    /Dados de sessão inválidos/
  );
  await assert.rejects(
    auth.deleteSessionWithAudit('token-inválido', 3),
    /Dados de encerramento de sessão inválidos/
  );
  await assert.rejects(
    auth.deleteSessionWithAudit('a'.repeat(64), 'usuário'),
    /Dados de encerramento de sessão inválidos/
  );
});


test('sessões Firestore aceitam login por senha e por Google', async () => {
  const session = {
    token_hash: 'a'.repeat(64),
    csrf_token: 'x'.repeat(32),
    user_id: 3,
    expires_at: new Date(Date.now() + 60000).toISOString()
  };
  await assert.rejects(
    auth.createSessionWithAudit({ ...session, action: 'login_password' }),
    /Firestore não configurado/
  );
  await assert.rejects(
    auth.createSessionWithAudit({ ...session, action: 'login_google' }),
    /Firestore não configurado/
  );
  await assert.rejects(
    auth.createSessionWithAudit({ ...session, action: 'login_unknown' }),
    /Dados de sessão inválidos/
  );
});

test('importação com ID fixo valida identificador e campo único antes do Firestore', async () => {
  const data = {
    display_name: 'Pessoa de Teste',
    email: 'pessoa@exemplo.com',
    password_hash: 'scrypt:' + 'a'.repeat(32) + ':' + 'b'.repeat(128),
    role: 'teacher',
    active: true
  };

  await assert.rejects(
    store.createUniqueWithId('users', 'email', data.email, 0, data),
    /Identificador ou dados de importação inválidos/
  );
});

test('o mapa do Firestore mantém a coleção de auditoria no nome canônico', () => {
  assert.equal(store.COLLECTIONS.auditLogs, 'audit_logs');
});
