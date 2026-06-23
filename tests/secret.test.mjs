import assert from 'node:assert/strict';
import test from 'node:test';

import {
  decryptSecret,
  encryptSecret,
  ENCRYPTED_PREFIX,
  isEncryptedSecret,
} from '../server/utils/secret.js';

test('encrypts and decrypts a secret value', async () => {
  const encrypted = await encryptSecret('dir-password', 'session-secret');
  assert.equal(isEncryptedSecret(encrypted), true);
  assert.equal(encrypted.startsWith(ENCRYPTED_PREFIX), true);
  assert.notEqual(encrypted, 'dir-password');
  assert.equal(await decryptSecret(encrypted, 'session-secret'), 'dir-password');
});

test('keeps legacy plaintext values readable', async () => {
  assert.equal(await decryptSecret('legacy-password', 'session-secret'), 'legacy-password');
  assert.equal(isEncryptedSecret('legacy-password'), false);
});

test('stores empty secret values as null', async () => {
  assert.equal(await encryptSecret('', 'session-secret'), null);
  assert.equal(await decryptSecret('', 'session-secret'), null);
  assert.equal(await decryptSecret(null, 'session-secret'), null);
});
