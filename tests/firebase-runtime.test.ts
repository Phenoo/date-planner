import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

test("Firebase Admin loads and resolves signing keys without native require(ESM)", () => {
  const result = spawnSync(process.execPath, [
    "--no-experimental-require-module",
    "--input-type=commonjs",
    "-e",
    `
      const assert = require('node:assert/strict');
      const { generateKeyPairSync } = require('node:crypto');
      const { getAuth } = require('firebase-admin/auth');
      const jwksClient = require('jwks-rsa');
      assert.equal(typeof getAuth, 'function');
      const { publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
      const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'runtime-test', alg: 'RS256', use: 'sig' };
      const client = jwksClient({ fetcher: async () => ({ keys: [jwk] }) });
      client.getSigningKey('runtime-test').then(key => {
        assert.equal(key.getPublicKey(), publicKey.export({ format: 'pem', type: 'spki' }));
      }).catch(error => { console.error(error); process.exitCode = 1; });
    `,
  ], { encoding: "utf8", timeout: 15000 });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
});
