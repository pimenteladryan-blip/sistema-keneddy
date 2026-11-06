'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

test('schema creates school records and trip workflow tables', () => {
  const db = new DatabaseSync(':memory:');
  const schema = fs.readFileSync(path.join(__dirname, '..', 'database', 'schema.sql'), 'utf8');
  db.exec(schema);
  const names = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map(row => row.name);
  for (const table of ['users', 'classes', 'students', 'student_guardians', 'trips', 'trip_classes', 'trip_students', 'trip_staff', 'audit_logs']) {
    assert.ok(names.includes(table), 'missing table: ' + table);
  }
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
