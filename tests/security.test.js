'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { hashPassword, verifyPassword, randomToken, sha256 } = require('../server/security');

test('password hash verifies only the original password', async () => {
  const hash = await hashPassword('Senha-forte-de-teste-2026!');
  assert.equal(await verifyPassword('Senha-forte-de-teste-2026!', hash), true);
  assert.equal(await verifyPassword('senha-incorreta', hash), false);
});
test('random session tokens are unique and digests are deterministic', () => {
  const first = randomToken();
  const second = randomToken();
  assert.notEqual(first, second);
  assert.equal(sha256(first), sha256(first));
});
