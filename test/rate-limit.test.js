'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createMemoryRateLimiter } = require('../server/rate-limit');

test('limita em conjunto todas as chaves sem incrementar parcialmente quando uma está bloqueada', () => {
  let now = 1000;
  const limiter = createMemoryRateLimiter({ clock: () => now });
  assert.equal(limiter.consume({ scope: 'login', keys: ['ip:1', 'email:a'], windowMs: 1000, maxAttempts: 2 }), true);
  assert.equal(limiter.consume({ scope: 'login', keys: ['ip:1', 'email:a'], windowMs: 1000, maxAttempts: 2 }), true);
  assert.equal(limiter.consume({ scope: 'login', keys: ['ip:1', 'email:b'], windowMs: 1000, maxAttempts: 2 }), false);
  assert.equal(limiter.consume({ scope: 'login', keys: ['ip:2', 'email:b'], windowMs: 1000, maxAttempts: 2 }), true);
});

test('expira janelas e libera novas tentativas', () => {
  let now = 5000;
  const limiter = createMemoryRateLimiter({ clock: () => now });
  assert.equal(limiter.consume({ scope: 'registration', keys: ['email:a'], windowMs: 60000, maxAttempts: 1 }), true);
  assert.equal(limiter.consume({ scope: 'registration', keys: ['email:a'], windowMs: 60000, maxAttempts: 1 }), false);
  now += 60000;
  assert.equal(limiter.consume({ scope: 'registration', keys: ['email:a'], windowMs: 60000, maxAttempts: 1 }), true);
});

test('falha fechada quando o limite de memória é atingido', () => {
  const limiter = createMemoryRateLimiter({ maxBuckets: 1, clock: () => 1000 });
  assert.equal(limiter.consume({ scope: 'login', keys: ['ip:1'], windowMs: 60000, maxAttempts: 5 }), true);
  assert.equal(limiter.consume({ scope: 'login', keys: ['ip:2'], windowMs: 60000, maxAttempts: 5 }), false);
  assert.equal(limiter.size, 1);
});
