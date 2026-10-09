import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { jwtExpiresInSeconds, validateRuntimeEnvironment } from '../src/config/env';

const keys = ['JWT_EXPIRES_IN', 'JWT_SECRET', 'NODE_ENV', 'CORS_ORIGINS'];
const original = new Map(keys.map(key => [key, process.env[key]]));
afterEach((): void => {
  for (const [key, value] of original) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

test('JWT expiration defaults to seven days only when unset', () => {
  delete process.env.JWT_EXPIRES_IN;
  assert.equal(jwtExpiresInSeconds(), 604800);
  process.env.JWT_EXPIRES_IN = '';
  assert.throws(jwtExpiresInSeconds, /JWT_EXPIRES_IN/);
});

test('JWT expiration accepts seconds and explicit duration units', () => {
  for (const [value, seconds] of [
    ['900', 900], ['15m', 900], ['30s', 30], ['2h', 7200], ['1d', 86400], ['2w', 1209600], [' 15m ', 900]
  ] as const) {
    process.env.JWT_EXPIRES_IN = value;
    assert.equal(jwtExpiresInSeconds(), seconds, value);
  }
});

test('JWT expiration rejects zero, ambiguous formats and unsafe integer overflow', () => {
  for (const value of [' ', '0', '0d', '-1', '+1', '1.5h', '01d', '1e3', '15 m', '15M', '7days',
    'Infinity', '9007199254740992', '9007199254740991w']) {
    process.env.JWT_EXPIRES_IN = value;
    assert.throws(jwtExpiresInSeconds, /JWT_EXPIRES_IN/, value);
  }
});

test('startup rejects an invalid JWT expiration before the server can issue tokens', () => {
  process.env.JWT_SECRET = 'test-secret';
  process.env.NODE_ENV = 'test';
  process.env.CORS_ORIGINS = 'http://localhost:4200';
  process.env.JWT_EXPIRES_IN = '0h';
  assert.throws(validateRuntimeEnvironment, /JWT_EXPIRES_IN/);
});
