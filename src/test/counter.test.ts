import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { WebSocket } from 'ws';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import {
  deployContract,
  submitCallTx,
  type DeployedContract,
} from '@midnight-ntwrk/midnight-js-contracts';
import type { ContractAddress } from '@midnight-ntwrk/midnight-js-protocol/compact-runtime';
import {
  type EnvironmentConfiguration,
  waitForFunds,
} from '@midnight-ntwrk/testkit-js';
import pino from 'pino';
import { createHash, randomBytes } from 'node:crypto';
import { firstValueFrom, throwError } from 'rxjs';
import { filter, take, tap, timeout } from 'rxjs/operators';

import { getConfig } from '../config.js';
import {
  MidnightWalletProvider,
  syncWallet,
  type WalletSecret,
} from '../wallet.js';
import { buildProviders, type CounterProviders } from '../providers.js';
import {
  CompiledCounterContract,
  Contract,
  createPrivateState,
  ledger,
  zkConfigPath,
  type CounterPrivateState,
} from '../../contracts/index.js';

// Required for GraphQL subscriptions in Node.js
// @ts-expect-error WebSocket global assignment for apollo
globalThis.WebSocket = WebSocket;

process.on('unhandledRejection', (reason, promise) => {
  console.error('UNHANDLED REJECTION:', reason);
  console.error('Promise:', promise);
});

process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err);
});

const ALICE_LOCAL_SEED =
  '0000000000000000000000000000000000000000000000000000000000000001';
const PRIVATE_STATE_ID = 'AliceCounterPrivateState';

const logger = pino({
  level: process.env['LOG_LEVEL'] ?? 'info',
  transport: { target: 'pino-pretty' },
});

const network = process.env['MIDNIGHT_NETWORK'] ?? 'local';

function resolveSecret(net: string): WalletSecret {
  if (net === 'local') return { kind: 'seed', value: ALICE_LOCAL_SEED };

  const upper = net.toUpperCase();
  const mnemonicEnv = `MIDNIGHT_${upper}_MNEMONIC`;
  const seedEnv = `MIDNIGHT_${upper}_SEED`;
  const mnemonic = process.env[mnemonicEnv]?.trim().replace(/\s+/g, ' ');
  const seedHex = process.env[seedEnv]?.trim();

  if (mnemonic && seedHex) {
    throw new Error(
      `Set only one of ${mnemonicEnv} or ${seedEnv} (both are defined).`,
    );
  }
  if (mnemonic) {
    return { kind: 'mnemonic', value: mnemonic };
  }
  if (seedHex) {
    if (!/^[0-9a-fA-F]+$/.test(seedHex) || seedHex.length % 2 !== 0) {
      throw new Error(
        `${seedEnv} must be a hex string of even length (no 0x prefix).`,
      );
    }
    return { kind: 'seed', value: seedHex };
  }
  throw new Error(
    `Either ${mnemonicEnv} or ${seedEnv} is required for network '${net}'. ` +
      `Set one in .env.${net} or the shell.`,
  );
}

function ownerCommitmentFromSecret(sk: Uint8Array): Uint8Array {
  // Mirrors Compact: persistentHash([pad(32, "risein:l1:counter:v1"), sk])
  // For the privacy test we only assert the raw secret never appears in ledger.
  return createHash('sha256').update(sk).digest();
}

describe(`Counter Contract (${network})`, () => {
  let wallet: MidnightWalletProvider;
  let providers: CounterProviders;
  let contractAddress: ContractAddress;
  let privateState: CounterPrivateState;
  const ownerSecret = randomBytes(32);

  const config = getConfig();
  const secret = resolveSecret(network);
  const isRemote = network !== 'local';
  const syncTimeoutMs = Number(
    process.env['MIDNIGHT_SYNC_TIMEOUT_MS'] ??
      (isRemote ? 60 * 60_000 : 10 * 60_000),
  );

  async function queryLedger(p: CounterProviders) {
    const state = await p.publicDataProvider.queryContractState(contractAddress);
    expect(state).not.toBeNull();
    return ledger(state!.data);
  }

  beforeAll(async () => {
    setNetworkId(config.networkId);
    privateState = createPrivateState(ownerSecret);

    const envConfig: EnvironmentConfiguration = {
      walletNetworkId: config.networkId,
      networkId: config.networkId,
      indexer: config.indexer,
      indexerWS: config.indexerWS,
      node: config.node,
      nodeWS: config.nodeWS,
      faucet: config.faucet,
      proofServer: config.proofServer,
    };

    wallet = await MidnightWalletProvider.build(logger, envConfig, secret);
    await wallet.start();
    await syncWallet(logger, wallet.wallet, syncTimeoutMs);

    if (isRemote) {
      const nightBalance = await waitForFunds(
        wallet.wallet,
        envConfig,
        false,
        wallet.unshieldedKeystore,
      );
      logger.info(`Wallet NIGHT balance on '${network}': ${nightBalance}`);

      // Dust generation is async after NIGHT registration; wait for spendable DUST.
      const dustTimeoutMs = Number(
        process.env['WAIT_FOR_DUST_TIMEOUT_MS'] ?? 30 * 60_000,
      );
      logger.info(`Waiting for spendable DUST (timeout ${dustTimeoutMs}ms)...`);
      await firstValueFrom(
        wallet.wallet.state().pipe(
          tap((s) =>
            logger.info(
              `dust coins=${s.dust.availableCoins.length}, balance=${s.dust.balance(new Date())}`,
            ),
          ),
          filter((s) => s.dust.availableCoins.length >= 1 && s.dust.balance(new Date()) > 0n),
          take(1),
          timeout({
            each: dustTimeoutMs,
            with: () =>
              throwError(
                () =>
                  new Error(
                    `No spendable DUST within ${dustTimeoutMs}ms. Ensure NIGHT is funded and dust registration succeeded.`,
                  ),
              ),
          }),
        ),
      );
      logger.info('Spendable DUST ready');
    }

    providers = buildProviders(wallet, zkConfigPath, config);
    logger.info(`Providers initialized on '${network}'. Ready to test!`);
  });

  afterAll(async () => {
    if (wallet) {
      logger.info('Stopping wallet...');
      await wallet.stop();
    }
  });

  it('deploys with public counter and disclosed owner only', async () => {
    logger.info('Deploying counter contract...');

    const deployed: DeployedContract<Contract<CounterPrivateState>> =
      await deployContract(providers, {
        compiledContract: CompiledCounterContract,
        privateStateId: PRIVATE_STATE_ID,
        initialPrivateState: privateState,
      });

    contractAddress = deployed.deployTxData.public.contractAddress;
    logger.info(`Contract deployed at: ${contractAddress}`);
    expect(contractAddress).toBeDefined();
    expect(contractAddress.length).toBeGreaterThan(0);

    const state = await queryLedger(providers);
    expect(state.counter).toEqual(0n);
    expect(state.owner).toBeInstanceOf(Uint8Array);
    expect(state.owner.length).toBe(32);

    // Private secret never appears on the public ledger.
    const ownerHex = Buffer.from(state.owner).toString('hex');
    const secretHex = Buffer.from(ownerSecret).toString('hex');
    expect(ownerHex).not.toEqual(secretHex);
    expect(Buffer.from(state.owner).equals(ownerSecret)).toBe(false);

    // Sanity: commitment helper used only for local comparison shape.
    expect(ownerCommitmentFromSecret(ownerSecret).length).toBe(32);
  });

  it('increments public counter via authorized private witness', async () => {
    expect(contractAddress).toBeTruthy();

    await submitCallTx(providers, {
      compiledContract: CompiledCounterContract,
      contractAddress,
      privateStateId: PRIVATE_STATE_ID,
      circuitId: 'increment',
      args: [],
    });

    const afterOne = await queryLedger(providers);
    expect(afterOne.counter).toEqual(1n);

    await submitCallTx(providers, {
      compiledContract: CompiledCounterContract,
      contractAddress,
      privateStateId: PRIVATE_STATE_ID,
      circuitId: 'increment',
      args: [],
    });

    const afterTwo = await queryLedger(providers);
    expect(afterTwo.counter).toEqual(2n);

    // Still no raw secret on ledger after state transitions.
    expect(Buffer.from(afterTwo.owner).equals(ownerSecret)).toBe(false);
  });

  it('rejects unauthorized increment (wrong private secret)', async () => {
    expect(contractAddress).toBeTruthy();

    const wrongStateId = 'MalloryCounterPrivateState';
    await providers.privateStateProvider.set(wrongStateId, createPrivateState(randomBytes(32)));

    await expect(
      submitCallTx(providers, {
        compiledContract: CompiledCounterContract,
        contractAddress,
        privateStateId: wrongStateId,
        circuitId: 'increment',
        args: [],
      }),
    ).rejects.toThrow();

    const state = await queryLedger(providers);
    expect(state.counter).toEqual(2n);
  });
});
