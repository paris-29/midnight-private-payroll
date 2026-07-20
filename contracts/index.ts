import { CompiledContract } from '@midnight-ntwrk/midnight-js-protocol/compact-js';
import path from 'node:path';
import type { Witnesses } from './managed/payroll/contract/index.js';

export {
  Contract,
  ledger,
  pureCircuits,
  type Ledger,
  type ImpureCircuits,
  type PureCircuits,
  type Witnesses,
} from './managed/payroll/contract/index.js';
import { Contract } from './managed/payroll/contract/index.js';

const currentDir = path.resolve(new URL(import.meta.url).pathname, '..');
export const zkConfigPath = path.resolve(currentDir, 'managed', 'payroll');

/** Private state held only by the user (never on-chain). */
export type PayrollPrivateState = {
  /** Private pay amount for this run (secretPayAmount witness) */
  payAmount: bigint;
};

export const witnesses: Witnesses<PayrollPrivateState> = {
  secretPayAmount: ({ privateState }) => {
    return [privateState, privateState.payAmount];
  },
};

export function createInitialPrivateState(payAmount: bigint): PayrollPrivateState {
  return { payAmount };
}

export const CompiledPayrollContract = CompiledContract.make(
  'PayrollContract',
  Contract,
).pipe(
  CompiledContract.withWitnesses(witnesses),
  CompiledContract.withCompiledFileAssets(zkConfigPath),
);

// Back-compat aliases used during rename (remove once all imports updated)
export type CounterPrivateState = PayrollPrivateState;
export const CompiledCounterContract = CompiledPayrollContract;
