import type { Witnesses } from './managed/counter/contract/index.js';

export type CounterPrivateState = {
  localSecretKey: Uint8Array;
};

export const createPrivateState = (localSecretKey: Uint8Array): CounterPrivateState => ({
  localSecretKey,
});

export const witnesses: Witnesses<CounterPrivateState> = {
  localSecretKey: ({ privateState }) => [privateState, privateState.localSecretKey],
};
