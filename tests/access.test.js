'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { ROLE_LABELS, RECORD_MANAGERS, USER_MANAGERS, hasRole } = require('../server/access');
test('all six system profiles have labels', () => {
  assert.deepEqual(Object.keys(ROLE_LABELS), ['admin', 'direction', 'secretariat', 'teacher', 'guardian', 'student']);
});
test('only school management profiles can manage records', () => {
  assert.equal(hasRole({ role: 'admin' }, RECORD_MANAGERS), true);
  assert.equal(hasRole({ role: 'secretariat' }, RECORD_MANAGERS), true);
  assert.equal(hasRole({ role: 'teacher' }, RECORD_MANAGERS), false);
  assert.equal(hasRole({ role: 'guardian' }, RECORD_MANAGERS), false);
});
test('missing users and unknown roles are denied', () => {
  assert.equal(hasRole(null, USER_MANAGERS), false);
  assert.equal(hasRole({ role: 'unknown' }, USER_MANAGERS), false);
});
