'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');

const root = path.resolve(__dirname, '..');
const script = path.join(root, 'scripts', 'validate-firestore-migration.js');
const schema = fs.readFileSync(path.join(root, 'database', 'schema.sql'), 'utf8');
const passwordHash = 'scrypt:' + 'a'.repeat(32) + ':' + 'b'.repeat(128);

function createFixture(databasePath) {
  const db = new DatabaseSync(databasePath);
  db.exec(schema);
  db.prepare('INSERT INTO users (display_name, email, password_hash, role, active) VALUES (?, ?, ?, ?, 1)')
    .run('Pessoa Fictícia', 'admin@example.invalid', passwordHash, 'admin');
  db.prepare("INSERT INTO classes (level, grade, course, section, school_year) VALUES ('medio', '1ª série', 'regular', 'A', 2026)")
    .run();
  db.prepare("INSERT INTO students (full_name, class_id, active) VALUES ('Estudante Fictício', 1, 1)")
    .run();
  db.prepare("INSERT INTO trips (title, destination, educational_purpose, departure_at, return_at, capacity, created_by) VALUES ('Viagem de Teste', 'Museu Fictício', 'Atividade sintética', '2026-12-01T10:00:00.000Z', '2026-12-01T12:00:00.000Z', 10, 1)")
    .run();
  db.prepare('INSERT INTO trip_classes (trip_id, class_id) VALUES (1, 1)').run();
  db.prepare('INSERT INTO trip_students (trip_id, student_id) VALUES (1, 1)').run();
  db.prepare('INSERT INTO sessions (token_hash, csrf_token, user_id, expires_at) VALUES (?, ?, 1, ?)')
    .run('t'.repeat(64), 'c'.repeat(32), '2099-01-01T00:00:00.000Z');
  db.close();
}

function runValidator(databasePath) {
  return spawnSync(process.execPath, [script, '--db', databasePath], {
    cwd: root,
    encoding: 'utf8'
  });
}

test('validador aprova base sintética em modo somente leitura e não expõe dados pessoais', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sgve-validator-valid-'));
  const databasePath = path.join(directory, 'synthetic.sqlite');
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  createFixture(databasePath);

  const before = fs.readFileSync(databasePath);
  const result = runValidator(databasePath);
  const after = fs.readFileSync(databasePath);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const report = JSON.parse(result.stdout);
  assert.equal(report.valid, true);
  assert.equal(report.mode, 'read-only-dry-run');
  assert.equal(report.firebase_connection, false);
  assert.equal(report.writes_performed, false);
  assert.equal(report.counts.users, 1);
  assert.equal(report.counts.classes, 1);
  assert.equal(report.counts.students, 1);
  assert.equal(report.counts.trips, 1);
  assert.equal(report.excluded_from_migration.sessions, 1);
  assert.equal(report.max_ids.users, 1);
  assert.deepEqual(report.issues, []);
  assert.deepEqual(after, before, 'o arquivo SQLite não pode ser alterado pelo validador');

  for (const privateValue of [
    'Pessoa Fictícia',
    'admin@example.invalid',
    'Estudante Fictício',
    passwordHash,
    't'.repeat(64),
    'c'.repeat(32)
  ]) {
    assert.equal(result.stdout.includes(privateValue), false);
  }
});

test('validador identifica e contabiliza conflitos sem revelar valores', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sgve-validator-invalid-'));
  const databasePath = path.join(directory, 'synthetic-invalid.sqlite');
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  createFixture(databasePath);

  const db = new DatabaseSync(databasePath);
  db.prepare('INSERT INTO users (display_name, email, password_hash, role, active) VALUES (?, ?, ?, ?, 1)')
    .run('Outra Pessoa Fictícia', ' ADMIN@example.invalid ', passwordHash, 'teacher');
  db.exec('PRAGMA foreign_keys = OFF');
  db.prepare("INSERT INTO trip_students (trip_id, student_id, authorization_status) VALUES (999, 1, 'pending')")
    .run();
  db.close();

  const result = runValidator(databasePath);
  assert.equal(result.status, 1, result.stderr || result.stdout);
  const report = JSON.parse(result.stdout);
  assert.equal(report.valid, false);
  assert.ok(report.issues.some(issue => issue.code === 'duplicate_user_email' && issue.count === 1));
  assert.ok(report.issues.some(issue => issue.code === 'foreign_key_violation' && issue.count === 1));
  assert.equal(result.stdout.includes('admin@example.invalid'), false);
  assert.equal(result.stdout.includes(passwordHash), false);
});

test('validador exige caminho explícito para o SQLite', () => {
  const result = spawnSync(process.execPath, [script], {
    cwd: root,
    encoding: 'utf8'
  });
  assert.equal(result.status, 2);
  assert.match(result.stdout, /--db/);
});
