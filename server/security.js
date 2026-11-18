'use strict';

const crypto = require('node:crypto');
const { promisify } = require('node:util');

const scrypt = promisify(crypto.scrypt);
const KEY_LENGTH = 64;

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const derived = await scrypt(password, salt, KEY_LENGTH);
  return `scrypt:${salt.toString('hex')}:${Buffer.from(derived).toString('hex')}`;
}

async function verifyPassword(password, stored) {
  // Reject malformed or oversized hashes before invoking the expensive scrypt operation.
  if (typeof password !== 'string' ||
      typeof stored !== 'string' ||
      !/^scrypt:[a-f0-9]{32}:[a-f0-9]{128}$/.test(stored)) return false;
  const [, saltHex, hashHex] = stored.split(':');
  try {
    const expected = Buffer.from(hashHex, 'hex');
    const actual = Buffer.from(await scrypt(password, Buffer.from(saltHex, 'hex'), KEY_LENGTH));
    return expected.length === KEY_LENGTH &&
      actual.length === expected.length &&
      crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

module.exports = { hashPassword, verifyPassword, randomToken, sha256 };
