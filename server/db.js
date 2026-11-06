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

function audit(actorUserId, action, entityType, entityId = null) {
  db.prepare(`
    INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id)
    VALUES (?, ?, ?, ?)
  `).run(actorUserId ?? null, action, entityType, entityId == null ? null : String(entityId));
}

module.exports = { db, audit };
