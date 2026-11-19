const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const configuredPath = process.env.DATABASE_PATH || './data/sgve.sqlite';
const dbPath = path.resolve(configuredPath);
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new DatabaseSync(dbPath);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
const schema = fs.readFileSync(path.join(__dirname, '..', 'database', 'schema.sql'), 'utf8');
db.exec(schema);
const reminderColumns = db.prepare('PRAGMA table_info(trips)').all();
if (!reminderColumns.some(column => column.name === 'departure_notified_at')) {
  db.exec('ALTER TABLE trips ADD COLUMN departure_notified_at TEXT');
}
if (!reminderColumns.some(column => column.name === 'return_notified_at')) {
  db.exec('ALTER TABLE trips ADD COLUMN return_notified_at TEXT');
}
const tripColumns = db.prepare('PRAGMA table_info(trips)').all();
if (!tripColumns.some(column => column.name === 'vehicle_id')) {
  db.exec('ALTER TABLE trips ADD COLUMN vehicle_id INTEGER REFERENCES vehicles(id) ON DELETE SET NULL');
}
const tripColumnsAfterVehicle = db.prepare('PRAGMA table_info(trips)').all();
if (!tripColumnsAfterVehicle.some(column => column.name === 'driver_id')) {
  db.exec('ALTER TABLE trips ADD COLUMN driver_id INTEGER REFERENCES drivers(id) ON DELETE SET NULL');
}
db.exec('CREATE INDEX IF NOT EXISTS idx_trips_driver ON trips(driver_id)');
const tripImageColumns = db.prepare('PRAGMA table_info(trips)').all();
if (!tripImageColumns.some(column => column.name === 'image_data')) {
  db.exec('ALTER TABLE trips ADD COLUMN image_data TEXT');
}
const userColumns = db.prepare('PRAGMA table_info(users)').all();
if (!userColumns.some(column => column.name === 'subjects')) {
  db.exec("ALTER TABLE users ADD COLUMN subjects TEXT NOT NULL DEFAULT '[]'");
}
const registrationColumns = db.prepare('PRAGMA table_info(registration_requests)').all();
if (!registrationColumns.some(column => column.name === 'verification_code')) {
  db.exec("ALTER TABLE registration_requests ADD COLUMN verification_code TEXT NOT NULL DEFAULT 'PENDENTE'");
}

function audit(actorUserId, action, entityType, entityId = null) {
  db.prepare(`
    INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id)
    VALUES (?, ?, ?, ?)
  `).run(actorUserId ?? null, action, entityType, entityId == null ? null : String(entityId));
}

module.exports = { db, audit };
