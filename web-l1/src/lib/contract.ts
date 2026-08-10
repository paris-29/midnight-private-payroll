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
