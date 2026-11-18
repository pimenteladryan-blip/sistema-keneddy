'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { hashPassword, verifyPassword } = require('../server/security');

test('hash scrypt válido autentica somente a senha correspondente', async () => {
  const hash = await hashPassword('SenhaSeguraDeTeste2026!');
  assert.equal(await verifyPassword('SenhaSeguraDeTeste2026!', hash), true);
  assert.equal(await verifyPassword('OutraSenha2026!', hash), false);
});

test('hashes malformados são recusados antes de executar scrypt', async () => {
  assert.equal(await verifyPassword('senha', null), false);
  assert.equal(await verifyPassword('senha', 'scrypt:abc:def'), false);
  assert.equal(await verifyPassword('senha', 'scrypt:' + 'a'.repeat(2000000)), false);
  assert.equal(await verifyPassword(null, 'scrypt:' + 'a'.repeat(32) + ':' + 'b'.repeat(128)), false);
});
