'use strict';

const crypto = require('node:crypto');

function keyDigest(scope, key) {
  return crypto.createHash('sha256').update(String(scope) + '\0' + String(key)).digest('hex');
}

function createMemoryRateLimiter({ maxBuckets = 10000, clock = Date.now } = {}) {
  if (!Number.isSafeInteger(maxBuckets) || maxBuckets < 1) {
    throw new TypeError('maxBuckets precisa ser um inteiro positivo.');
  }
  const buckets = new Map();

  function consume({ scope, keys, windowMs, maxAttempts }) {
    if (typeof scope !== 'string' || !scope || !Array.isArray(keys) || !keys.length ||
        keys.some(key => typeof key !== 'string' || !key) ||
        !Number.isSafeInteger(windowMs) || windowMs < 1 ||
        !Number.isSafeInteger(maxAttempts) || maxAttempts < 1) {
      throw new TypeError('Parâmetros de limitação inválidos.');
    }

    const now = clock();
    for (const [id, bucket] of buckets) {
      if (now < bucket.startedAt || now - bucket.startedAt >= bucket.windowMs) buckets.delete(id);
    }

    const ids = [...new Set(keys.map(key => keyDigest(scope, key)))];
    const current = ids.map(id => buckets.get(id));
    if (current.some(bucket => bucket && bucket.count >= maxAttempts)) return false;

    const missing = ids.filter(id => !buckets.has(id)).length;
    if (buckets.size + missing > maxBuckets) return false;

    ids.forEach((id, index) => {
      const bucket = current[index];
      if (bucket) bucket.count += 1;
      else buckets.set(id, { startedAt: now, windowMs, count: 1 });
    });
    return true;
  }

  function reset({ scope, keys }) {
    if (typeof scope !== 'string' || !scope || !Array.isArray(keys) || !keys.length ||
        keys.some(key => typeof key !== 'string' || !key)) {
      throw new TypeError('Parâmetros de limpeza do limitador inválidos.');
    }
    for (const key of keys) buckets.delete(keyDigest(scope, key));
  }

  return { consume, reset, get size() { return buckets.size; } };
}

module.exports = { createMemoryRateLimiter };
