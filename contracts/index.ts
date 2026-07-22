import { CompiledContract } from '@midnight-ntwrk/midnight-js-protocol/compact-js';
import path from 'node:path';

export {
  Contract,
  ledger,
  pureCircuits,
  type Ledger,
  type ImpureCircuits,
  type PureCircuits,
  type Witnesses,
} from './managed/counter/contract/index.js';
import { Contract } from './managed/counter/contract/index.js';
import { witnesses, type CounterPrivateState } from './witnesses.js';

export { witnesses, createPrivateState, type CounterPrivateState } from './witnesses.js';

const currentDir = path.resolve(new URL(import.meta.url).pathname, '..');
export const zkConfigPath = path.resolve(currentDir, 'managed', 'counter');

export const CompiledCounterContract = CompiledContract.make<
  Contract<CounterPrivateState>,
  CounterPrivateState
>('CounterContract', Contract).pipe(
  CompiledContract.withWitnesses(witnesses),
  CompiledContract.withCompiledFileAssets(zkConfigPath),
);
