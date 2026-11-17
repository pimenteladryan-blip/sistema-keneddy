'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');

test('schema creates school records and trip workflow tables', () => {
  const db = new DatabaseSync(':memory:');
  const schema = fs.readFileSync(path.join(__dirname, '..', 'database', 'schema.sql'), 'utf8');
  db.exec(schema);
  const names = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map(row => row.name);
  for (const table of ['users', 'classes', 'students', 'student_guardians', 'vehicles', 'trips', 'trip_classes', 'trip_students', 'trip_staff', 'audit_logs']) {
    assert.ok(names.includes(table), 'missing table: ' + table);
  }
  const tripColumns = db.prepare('PRAGMA table_info(trips)').all().map(column => column.name);
  assert.ok(tripColumns.includes('vehicle_id'), 'trips must include the optional vehicle relation');
  db.close();
});
test('trip participants start with pending authorization', () => {
  const db = new DatabaseSync(':memory:');
  db.exec(fs.readFileSync(path.join(__dirname, '..', 'database', 'schema.sql'), 'utf8'));
  db.prepare("INSERT INTO users (display_name, email, password_hash, role) VALUES (?, ?, ?, ?)").run('Teste', 'teste@example.invalid', 'hash', 'admin');
  db.prepare("INSERT INTO classes (level, grade, course, section, school_year) VALUES (?, ?, ?, ?, ?)").run('medio', '1ª série', 'regular', 'A', 2026);
  db.prepare("INSERT INTO students (full_name, class_id) VALUES (?, 1)").run('Estudante Fictício');
  db.prepare("INSERT INTO trips (title, destination, educational_purpose, departure_at, return_at, capacity, created_by) VALUES (?, ?, ?, ?, ?, ?, 1)").run('Visita de teste', 'Museu fictício', 'Atividade pedagógica fictícia', '2026-12-01T10:00:00.000Z', '2026-12-01T12:00:00.000Z', 20);
  db.prepare("INSERT INTO trip_classes (trip_id, class_id) VALUES (1, 1)").run();
  db.prepare("INSERT INTO trip_students (trip_id, student_id) VALUES (1, 1)").run();
  const row = db.prepare('SELECT authorization_status FROM trip_students WHERE trip_id = 1 AND student_id = 1').get();
  assert.equal(row.authorization_status, 'pending');
  db.close();
});

test('bancos SQLite existentes recebem a coluna opcional de veículo sem perder viagens', () => {
  const root = path.resolve(__dirname, '..');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sgve-vehicle-migration-'));
  const databasePath = path.join(directory, 'legacy.sqlite');
  const legacy = new DatabaseSync(databasePath);
  legacy.exec(`
    CREATE TABLE trips (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      destination TEXT NOT NULL,
      educational_purpose TEXT NOT NULL,
      departure_at TEXT NOT NULL,
      return_at TEXT NOT NULL,
      capacity INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      created_by INTEGER NOT NULL,
      approved_by INTEGER,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    INSERT INTO trips (title, destination, educational_purpose, departure_at, return_at, capacity, created_by)
    VALUES ('Viagem antiga', 'Destino fictício', 'Registro de migração', '2099-12-10T08:00:00.000Z', '2099-12-10T10:00:00.000Z', 20, 1);
  `);
  legacy.close();
  try {
    const result = spawnSync(process.execPath, ['-e', "require('./server/db').db.close()"], {
      cwd: root,
      env: { ...process.env, DATABASE_PATH: databasePath, NODE_ENV: 'test' },
      encoding: 'utf8'
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const migrated = new DatabaseSync(databasePath, { readOnly: true });
    try {
      const columns = migrated.prepare('PRAGMA table_info(trips)').all().map(column => column.name);
      assert.ok(columns.includes('vehicle_id'));
      assert.equal(migrated.prepare('SELECT title FROM trips WHERE id = 1').get().title, 'Viagem antiga');
      assert.ok(migrated.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'vehicles'").get());
    } finally { migrated.close(); }
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

