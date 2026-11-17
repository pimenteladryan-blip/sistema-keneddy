'use strict';

const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');

const TABLES = Object.freeze([
  'users', 'registration_requests', 'classes', 'students',
  'student_guardians', 'vehicles', 'drivers', 'trips',
  'trip_classes', 'trip_students', 'trip_staff', 'audit_logs'
]);

const EXCLUDED_TABLES = Object.freeze(['sessions']);

const REQUIRED_COLUMNS = Object.freeze({
  users: ['id', 'display_name', 'email', 'password_hash', 'role', 'active'],
  registration_requests: ['id', 'display_name', 'email', 'password_hash', 'role', 'verification_code', 'status'],
  classes: ['id', 'level', 'grade', 'course', 'section', 'school_year', 'active'],
  students: ['id', 'full_name', 'class_id', 'user_id', 'active'],
  student_guardians: ['student_id', 'guardian_user_id', 'relationship_label'],
  vehicles: ['id', 'name', 'type', 'capacity', 'active', 'created_by'],
  drivers: ['id', 'name', 'active', 'created_by'],
  trips: ['id', 'title', 'destination', 'educational_purpose', 'departure_at', 'return_at', 'capacity', 'vehicle_id', 'driver_id', 'status', 'created_by', 'approved_by'],
  trip_classes: ['trip_id', 'class_id'],
  trip_students: ['trip_id', 'student_id', 'authorization_status', 'departure_present', 'return_present'],
  trip_staff: ['trip_id', 'user_id', 'assignment_label'],
  audit_logs: ['id', 'actor_user_id', 'action', 'entity_type', 'entity_id', 'created_at']
});

const NUMERIC_ID_TABLES = Object.freeze([
  'users', 'registration_requests', 'classes', 'students',
  'vehicles', 'drivers', 'trips', 'audit_logs'
]);

function parseArgs(argv) {
  const result = { dbPath: null, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--help' || argument === '-h') {
      result.help = true;
    } else if (argument === '--db' && argv[index + 1]) {
      result.dbPath = argv[++index];
    } else {
      throw new Error('invalid_arguments');
    }
  }
  return result;
}

function printUsage() {
  process.stdout.write(
    'Uso: node scripts/validate-firestore-migration.js --db <caminho-do-sqlite>\\n' +
    'Valida uma cópia do SQLite em modo somente leitura. Não conecta ao Firebase.\\n'
  );
}

function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch {
    printUsage();
    process.exitCode = 2;
    return;
  }

  if (args.help) {
    printUsage();
    return;
  }

  if (!args.dbPath) {
    printUsage();
    process.exitCode = 2;
    return;
  }

  let database;
  try {
    const resolvedPath = fs.realpathSync(args.dbPath);
    if (!fs.statSync(resolvedPath).isFile()) throw new Error('not_a_file');

    database = new DatabaseSync(resolvedPath, { readOnly: true });
    database.exec('PRAGMA query_only = ON; PRAGMA foreign_keys = ON;');

    const issues = new Map();
    const addIssue = (code, count) => {
      if (count > 0) issues.set(code, (issues.get(code) || 0) + count);
    };
    const scalar = sql => Number(database.prepare(sql).get().count || 0);
    const tableNames = new Set(database.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table'"
    ).all().map(row => row.name));

    for (const table of TABLES) {
      if (!tableNames.has(table)) addIssue('missing_table', 1);
    }

    const presentTables = TABLES.filter(table => tableNames.has(table));
    const counts = {};
    for (const table of presentTables) {
      counts[table] = scalar('SELECT COUNT(*) AS count FROM "' + table + '"');
    }

    const excludedCounts = {};
    for (const table of EXCLUDED_TABLES) {
      if (tableNames.has(table)) {
        excludedCounts[table] = scalar('SELECT COUNT(*) AS count FROM "' + table + '"');
      }
    }

    const columnsByTable = {};
    for (const table of presentTables) {
      columnsByTable[table] = new Set(
        database.prepare('PRAGMA table_info("' + table + '")').all().map(row => row.name)
      );
      for (const column of REQUIRED_COLUMNS[table]) {
        if (!columnsByTable[table].has(column)) addIssue('missing_column', 1);
      }
    }

    const has = (table, columns) =>
      tableNames.has(table) && columns.every(column => columnsByTable[table]?.has(column));

    const integrity = database.prepare('PRAGMA integrity_check').all();
    if (integrity.length !== 1 || integrity[0].integrity_check !== 'ok') {
      addIssue('sqlite_integrity_check_failed', Math.max(1, integrity.length));
    }

    const foreignKeyIssues = database.prepare('PRAGMA foreign_key_check').all().length;
    addIssue('foreign_key_violation', foreignKeyIssues);

    for (const table of NUMERIC_ID_TABLES) {
      if (has(table, ['id'])) {
        addIssue('invalid_numeric_id', scalar(
          'SELECT COUNT(*) AS count FROM "' + table + '" WHERE id IS NULL OR typeof(id) <> \\'integer\\' OR id < 1'
        ));
      }
    }

    if (has('users', ['email', 'password_hash', 'role', 'active'])) {
      addIssue('duplicate_user_email', scalar(
        'SELECT COUNT(*) AS count FROM (SELECT lower(trim(email)) FROM users GROUP BY lower(trim(email)) HAVING COUNT(*) > 1)'
      ));
      addIssue('invalid_user_email', scalar(
        "SELECT COUNT(*) AS count FROM users WHERE trim(email) = '' OR instr(email, '@') < 2"
      ));
      addIssue('invalid_password_hash', scalar(
        "SELECT COUNT(*) AS count FROM users WHERE password_hash IS NULL OR length(password_hash) <> 168 OR substr(password_hash, 1, 7) <> 'scrypt:' OR substr(password_hash, 40, 1) <> ':' OR substr(password_hash, 8, 32) GLOB '*[^0-9a-f]*' OR substr(password_hash, 41, 128) GLOB '*[^0-9a-f]*'"
      ));
      addIssue('invalid_user_role_or_state', scalar(
        "SELECT COUNT(*) AS count FROM users WHERE role NOT IN ('admin','direction','secretariat','teacher','guardian','student') OR active NOT IN (0,1)"
      ));
    }

    if (has('registration_requests', ['email', 'password_hash', 'role', 'status'])) {
      addIssue('duplicate_registration_email', scalar(
        'SELECT COUNT(*) AS count FROM (SELECT lower(trim(email)) FROM registration_requests GROUP BY lower(trim(email)) HAVING COUNT(*) > 1)'
      ));
      addIssue('invalid_registration_request', scalar(
        "SELECT COUNT(*) AS count FROM registration_requests WHERE trim(email) = '' OR instr(email, '@') < 2 OR role NOT IN ('teacher','guardian','student') OR status NOT IN ('pending','approved','rejected') OR (password_hash IS NOT NULL AND (length(password_hash) <> 168 OR substr(password_hash, 1, 7) <> 'scrypt:' OR substr(password_hash, 40, 1) <> ':' OR substr(password_hash, 8, 32) GLOB '*[^0-9a-f]*' OR substr(password_hash, 41, 128) GLOB '*[^0-9a-f]*'))"
      ));
    }

    if (has('classes', ['level', 'grade', 'course', 'section', 'school_year'])) {
      addIssue('duplicate_class_key', scalar(
        'SELECT COUNT(*) AS count FROM (SELECT lower(trim(level)), lower(trim(grade)), lower(trim(course)), lower(trim(section)), school_year FROM classes GROUP BY lower(trim(level)), lower(trim(grade)), lower(trim(course)), lower(trim(section)), school_year HAVING COUNT(*) > 1)'
      ));
      addIssue('invalid_class', scalar(
        "SELECT COUNT(*) AS count FROM classes WHERE level NOT IN ('fundamental','medio') OR trim(grade) = '' OR trim(course) = '' OR trim(section) = '' OR typeof(school_year) <> 'integer'"
      ));
    }

    if (has('students', ['active'])) {
      addIssue('invalid_student_state', scalar(
        'SELECT COUNT(*) AS count FROM students WHERE active NOT IN (0,1)'
      ));
    }

    for (const table of ['vehicles', 'drivers']) {
      if (!has(table, ['name', 'active'])) continue;
      addIssue('duplicate_' + (table === 'vehicles' ? 'vehicle' : 'driver') + '_name', scalar(
        'SELECT COUNT(*) AS count FROM (SELECT lower(trim(name)) FROM "' + table + '" GROUP BY lower(trim(name)) HAVING COUNT(*) > 1)'
      ));
      addIssue('invalid_' + (table === 'vehicles' ? 'vehicle' : 'driver') + '_record', scalar(
        "SELECT COUNT(*) AS count FROM '" + table + "' WHERE trim(name) = '' OR active NOT IN (0,1)"
      ));
    }

    if (has('vehicles', ['type', 'capacity'])) {
      addIssue('invalid_vehicle_capacity_or_type', scalar(
        "SELECT COUNT(*) AS count FROM vehicles WHERE type NOT IN ('Ônibus','Micro-ônibus','Van') OR typeof(capacity) <> 'integer' OR capacity < 1 OR capacity > 100"
      ));
    }

    if (has('trips', ['status', 'capacity', 'departure_at', 'return_at'])) {
      addIssue('invalid_trip_state_or_capacity', scalar(
        "SELECT COUNT(*) AS count FROM trips WHERE status NOT IN ('draft','pending_approval','approved','open','completed','cancelled') OR typeof(capacity) <> 'integer' OR capacity < 1"
      ));
      addIssue('invalid_trip_dates', scalar(
        'SELECT COUNT(*) AS count FROM trips WHERE julianday(departure_at) IS NULL OR julianday(return_at) IS NULL OR julianday(return_at) <= julianday(departure_at)'
      ));
    }

    if (has('trip_students', ['authorization_status', 'departure_present', 'return_present'])) {
      addIssue('invalid_trip_student_state', scalar(
        "SELECT COUNT(*) AS count FROM trip_students WHERE authorization_status NOT IN ('pending','authorized','declined','paper_recorded') OR (departure_present IS NOT NULL AND departure_present NOT IN (0,1)) OR (return_present IS NOT NULL AND return_present NOT IN (0,1))"
      ));
    }

    if (has('trip_students', ['trip_id', 'student_id']) && has('trips', ['id', 'capacity'])) {
      addIssue('trip_over_capacity', scalar(
        'SELECT COUNT(*) AS count FROM (SELECT trips.id FROM trips JOIN trip_students ON trip_students.trip_id = trips.id GROUP BY trips.id, trips.capacity HAVING COUNT(*) > trips.capacity)'
      ));
    }

    if (has('audit_logs', ['action', 'entity_type'])) {
      addIssue('invalid_audit_record', scalar(
        "SELECT COUNT(*) AS count FROM audit_logs WHERE trim(action) = '' OR trim(entity_type) = ''"
      ));
    }

    const maxIds = {};
    for (const table of NUMERIC_ID_TABLES) {
      if (has(table, ['id'])) {
        maxIds[table] = Number(database.prepare(
          'SELECT COALESCE(MAX(id), 0) AS value FROM "' + table + '"'
        ).get().value);
      }
    }

    const issueList = [...issues.entries()]
      .map(([code, count]) => ({ code, count }))
      .sort((left, right) => left.code.localeCompare(right.code));

    const report = {
      mode: 'read-only-dry-run',
      firebase_connection: false,
      writes_performed: false,
      valid: issueList.length === 0,
      counts,
      excluded_from_migration: excludedCounts,
      max_ids: maxIds,
      issues: issueList
    };

    process.stdout.write(JSON.stringify(report, null, 2) + '\\n');
    if (!report.valid) process.exitCode = 1;
  } catch {
    process.stdout.write(JSON.stringify({
      mode: 'read-only-dry-run',
      valid: false,
      issues: [{ code: 'database_unavailable_or_invalid', count: 1 }]
    }, null, 2) + '\\n');
    process.exitCode = 2;
  } finally {
    if (database) database.close();
  }
}

main();
