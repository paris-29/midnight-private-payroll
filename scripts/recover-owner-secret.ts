// Recover the owner secret stored by the Level 1 CLI deploy.
// The test uses levelPrivateStateProvider with a store name `counter-${Date.now()}`
// under ./midnight-level-db. This script scans LevelDB keys for the
// AliceCounterPrivateState entry and prints the secret in base64 and hex.
//
// Usage: npx tsx scripts/recover-owner-secret.ts

import { Level } from 'level';
import path from 'node:path';

const DB_PATH = path.resolve(import.meta.dirname || '.', '..', 'midnight-level-db');

function bytesMatchesSecretShape(value: unknown): value is Uint8Array {
  return value instanceof Uint8Array && value.length >= 32;
}

function maybeLocalSecretKey(value: Uint8Array): Uint8Array | null {
  // CounterPrivateState JSON is { localSecretKey: <32 bytes> }.
  // The encoded private-state value is typically the JSON object itself;
  // midnight-js may store it as a CBOR-ish buffer. Try three heuristics:
  // 1) raw 32-byte value
  // 2) prefixed object containing the 32-byte key at a known offset
  if (value.length === 32) return value;
  // Look for a 32-byte contiguous slice (simple heuristic for JSON/CBOR blobs)
  for (let i = 0; i <= value.length - 32; i++) {
    // If surrounding bytes look object-ish, take this slice
    if (value.length - i === 32) return value.slice(i);
  }
  return value.slice(-32);
}

const db = new Level<string, Uint8Array>(DB_PATH, {
  valueEncoding: 'buffer',
});

let found = false;

for await (const [key, value] of db.iterator()) {
  if (!key.toLowerCase().includes('private')) continue;
  if (!bytesMatchesSecretShape(value)) continue;

  const secret = maybeLocalSecretKey(value);
  if (!secret || secret.length !== 32) continue;

  const b64 = Buffer.from(secret).toString('base64');
  const hex = Buffer.from(secret).toString('hex');

  console.log('Found private-state key:', key);
  console.log('Owner secret (base64):', b64);
  console.log('Owner secret (hex):   ', hex);
  console.log(
    'Paste either value into the frontend "Owner secret" field and click Save.'
  );
  found = true;
}

if (!found) {
  console.error(
    'No private-state entry found in', DB_PATH,
    '\nThe secret may be in a different LevelDB path or the deploy was on another machine.'
  );
  process.exit(1);
}
