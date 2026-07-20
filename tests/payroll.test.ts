/**
 * Level 1 unit tests — offline circuit simulation via compact-runtime.
 * Covers: circuit logic, state transitions, private inputs never exposed.
 */
import { describe, it, expect } from 'vitest';
import {
  createConstructorContext,
  createCircuitContext,
  sampleContractAddress,
  CompactError,
  type ContractState,
  type ChargedState,
} from '@midnight-ntwrk/compact-runtime';
import { sampleCoinPublicKey } from '@midnight-ntwrk/ledger-v8';
import {
  Contract,
  ledger,
  witnesses,
  createInitialPrivateState,
  type PayrollPrivateState,
} from '../contracts/index.js';

const COIN_PK = sampleCoinPublicKey();
const CONTRACT_ADDR = sampleContractAddress();

type OnChainState = ContractState | ChargedState;

function deploy(payAmount: bigint = 7n) {
  const privateState = createInitialPrivateState(payAmount);
  const contract = new Contract(witnesses);
  const ctorCtx = createConstructorContext(privateState, COIN_PK);
  const { currentPrivateState, currentContractState } = contract.initialState(ctorCtx);
  return {
    contract,
    privateState: currentPrivateState as PayrollPrivateState,
    contractState: currentContractState as OnChainState,
  };
}

function runCircuit(
  contract: Contract<PayrollPrivateState>,
  contractState: OnChainState,
  privateState: PayrollPrivateState,
  name: 'processPay' | 'clearLastAmount',
) {
  const ctx = createCircuitContext(
    CONTRACT_ADDR,
    COIN_PK,
    contractState,
    privateState,
  );
  const result = contract.circuits[name](ctx);
  const nextState = result.context.currentQueryContext.state as ChargedState;
  return {
    privateState: result.context.currentPrivateState as PayrollPrivateState,
    contractState: nextState as OnChainState,
    proofData: result.proofData,
    result: result.result,
  };
}

function readLedger(contractState: OnChainState) {
  if (contractState && typeof contractState === 'object' && 'data' in contractState) {
    return ledger((contractState as ContractState).data);
  }
  return ledger(contractState as ChargedState);
}

describe('Private Payroll — circuit logic', () => {
  it('initializes public ledger to zeros and private pay stays local', () => {
    const { privateState, contractState } = deploy(5000n);
    const pub = readLedger(contractState);

    expect(pub.payRuns).toBe(0n);
    expect(pub.lastDisclosedAmount).toBe(0n);
    expect(pub.totalPaid).toBe(0n);
    expect(privateState.payAmount).toBe(5000n);
  });

  it('processPay discloses private amount into public ledger totals', () => {
    const deployed = deploy(7500n);
    const after = runCircuit(
      deployed.contract,
      deployed.contractState,
      deployed.privateState,
      'processPay',
    );
    const pub = readLedger(after.contractState);

    expect(pub.payRuns).toBe(1n);
    expect(pub.lastDisclosedAmount).toBe(7500n);
    expect(pub.totalPaid).toBe(7500n);
  });
});

describe('Private Payroll — state transitions', () => {
  it('accumulates totalPaid and payRuns across multiple runs', () => {
    let { contract, privateState, contractState } = deploy(3000n);

    let r = runCircuit(contract, contractState, privateState, 'processPay');
    contractState = r.contractState;
    privateState = r.privateState;

    privateState = { payAmount: 10000n };
    r = runCircuit(contract, contractState, privateState, 'processPay');
    contractState = r.contractState;

    const pub = readLedger(contractState);
    expect(pub.payRuns).toBe(2n);
    expect(pub.lastDisclosedAmount).toBe(10000n);
    expect(pub.totalPaid).toBe(13000n);
  });

  it('clearLastAmount zeros last amount without changing runs or total', () => {
    let { contract, privateState, contractState } = deploy(4000n);
    let r = runCircuit(contract, contractState, privateState, 'processPay');
    contractState = r.contractState;
    privateState = r.privateState;

    r = runCircuit(contract, contractState, privateState, 'clearLastAmount');
    const pub = readLedger(r.contractState);

    expect(pub.lastDisclosedAmount).toBe(0n);
    expect(pub.payRuns).toBe(1n);
    expect(pub.totalPaid).toBe(4000n);
  });
});

describe('Private Payroll — private inputs never exposed', () => {
  it('proofData public transcript does not embed raw private payAmount key', () => {
    const deployed = deploy(42000n);
    const after = runCircuit(
      deployed.contract,
      deployed.contractState,
      deployed.privateState,
      'processPay',
    );

    expect(after.privateState.payAmount).toBe(42000n);

    const publicFacing = JSON.stringify({
      input: after.proofData.input,
      output: after.proofData.output,
      publicTranscript: after.proofData.publicTranscript,
    });

    expect(publicFacing).not.toContain('"payAmount"');
    expect(publicFacing).not.toMatch(/"privateState"/);
    expect(deployed.privateState).toEqual({ payAmount: 42000n });
  });

  it('rejects invalid private pay amount (0) via assert', () => {
    const deployed = deploy(0n);
    expect(() =>
      runCircuit(
        deployed.contract,
        deployed.contractState,
        deployed.privateState,
        'processPay',
      ),
    ).toThrow(CompactError);
  });

  it('rejects invalid private pay amount (>1_000_000) via assert', () => {
    const deployed = deploy(1_000_001n);
    expect(() =>
      runCircuit(
        deployed.contract,
        deployed.contractState,
        deployed.privateState,
        'processPay',
      ),
    ).toThrow(CompactError);
  });
});
