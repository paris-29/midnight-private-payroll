import { CompiledContract } from '@midnight-ntwrk/midnight-js-protocol/compact-js';
// Compiled Compact output (run `yarn compile` at repo root)
import { Contract } from '../../../contracts/managed/counter/contract/index.js';

export type CounterPrivateState = {
  localSecretKey: Uint8Array;
};

export type CounterCircuits = 'increment' | 'resetOwner';

export const PRIVATE_STATE_ID = 'counterPrivateState';
export const SECRET_STORAGE_KEY = 'midnight-counter-owner-secret-v1';

export const witnesses = {
  localSecretKey: ({ privateState }: { privateState: CounterPrivateState }) =>
    [privateState, privateState.localSecretKey] as [CounterPrivateState, Uint8Array],
};

export function getOrCreateOwnerSecret(): Uint8Array {
  const stored = localStorage.getItem(SECRET_STORAGE_KEY);
  if (stored) {
    const bytes = base64ToBytes(stored);
    if (bytes.length === 32) return bytes;
  }
  const secret = crypto.getRandomValues(new Uint8Array(32));
  localStorage.setItem(SECRET_STORAGE_KEY, bytesToBase64(secret));
  return secret;
}

export function decodeImportedOwnerSecret(input: string): Uint8Array {
  const trimmed = input.trim();
  // Accept base64 (44 chars incl padding) or 64-char hex; atob handles both padding/no-padding
  // Base64 is the canonical on-disk format used by localStorage.
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return hexToBytes(trimmed);
  }
  const bytes = base64ToBytes(trimmed);
  if (bytes.length !== 32) {
    throw new Error('Imported secret must decode to exactly 32 bytes.');
  }
  return bytes;
}

export function saveOwnerSecret(secret: Uint8Array): void {
  localStorage.setItem(SECRET_STORAGE_KEY, bytesToBase64(secret));
}

function base64ToBytes(b64: string): Uint8Array {
  try {
    return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  } catch {
    return new Uint8Array(0);
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < clean.length; i += 2) {
    bytes[i / 2] = parseInt(clean.slice(i, i + 2), 16);
  }
  return bytes;
}

export function createPrivateState(localSecretKey: Uint8Array): CounterPrivateState {
  return { localSecretKey };
}

/**
 * ZK keys/zkir are served from the site root (public/keys, public/zkir).
 * FetchZkConfigProvider loads them via window.location.origin.
 */
export function makeCompiledCounterContract() {
  return CompiledContract.make<Contract<CounterPrivateState>, CounterPrivateState>(
    'CounterContract',
    Contract,
  ).pipe(
    CompiledContract.withWitnesses(witnesses),
    CompiledContract.withCompiledFileAssets('/'),
  );
}

export { Contract, ledger } from '../../../contracts/managed/counter/contract/index.js';
