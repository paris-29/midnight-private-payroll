// Diagnose a remote-network wallet before deploying: does it hold tNIGHT,
// are its NIGHT UTXOs registered for DUST generation, and is any DUST spendable?
//
// Usage: MIDNIGHT_NETWORK=preprod yarn vite-node scripts/check-wallet.ts
// Does NOT require the proof server (no proofs are generated) and does not
// register or submit anything — it only reads wallet state.

import pino from 'pino';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { unshieldedToken } from '@midnight-ntwrk/midnight-js-protocol/ledger';
import type { EnvironmentConfiguration } from '@midnight-ntwrk/testkit-js';
import { firstValueFrom } from 'rxjs';
import { getConfig } from '../src/config.js';
import { MidnightWalletProvider, syncWallet, type WalletSecret } from '../src/wallet.js';

const logger = pino({
  level: process.env['LOG_LEVEL'] ?? 'info',
  transport: { target: 'pino-pretty' },
});

const network = process.env['MIDNIGHT_NETWORK'] ?? 'preprod';

function resolveSecret(net: string): WalletSecret {
  const upper = net.toUpperCase();
  const mnemonicEnv = `MIDNIGHT_${upper}_MNEMONIC`;
  const seedEnv = `MIDNIGHT_${upper}_SEED`;
  const mnemonic = process.env[mnemonicEnv]?.trim().replace(/\s+/g, ' ');
  const seedHex = process.env[seedEnv]?.trim();

  if (mnemonic && seedHex) {
    throw new Error(`Set only one of ${mnemonicEnv} or ${seedEnv} (both are defined).`);
  }
  if (mnemonic) {
    return { kind: 'mnemonic', value: mnemonic };
  }
  if (seedHex) {
    if (!/^[0-9a-fA-F]+$/.test(seedHex) || seedHex.length % 2 !== 0) {
      throw new Error(`${seedEnv} must be a hex string of even length (no 0x prefix).`);
    }
    return { kind: 'seed', value: seedHex };
  }
  throw new Error(`Either ${mnemonicEnv} or ${seedEnv} is required for network '${net}'.`);
}

const config = getConfig();
setNetworkId(config.networkId);

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

logger.info(`Checking wallet on '${network}' (indexer: ${config.indexer})...`);

const wallet = await MidnightWalletProvider.build(logger, envConfig, resolveSecret(network));
await wallet.start();

await syncWallet(logger, wallet.wallet, { requireDust: false });

const state = await firstValueFrom(wallet.wallet.state());
const nightRaw = unshieldedToken().raw;
const nightBalance = state.unshielded.balances[nightRaw] ?? 0n;
const coins = state.unshielded.availableCoins.filter((coin: any) => coin.utxo.type === nightRaw);
const registered = coins.filter((coin: any) => coin.meta?.registeredForDustGeneration === true);
const dustCoins = state.dust.availableCoins.length;
const dustBalance = state.dust.balance(new Date());

const dustProgress = (state.dust as { state?: { progress?: unknown } })?.state?.progress;

logger.info('-----------------------------------------');
logger.info(`Unshielded address:      ${wallet.unshieldedKeystore.getBech32Address().asString()}`);
logger.info(`DUST address:            ${(state.dust as { address?: string }).address ?? 'n/a'}`);
logger.info(`NIGHT balance:           ${nightBalance}`);
logger.info(`NIGHT UTXOs total:       ${coins.length}`);
logger.info(`NIGHT UTXOs registered:  ${registered.length} (of ${coins.length})`);
logger.info(`DUST coins:              ${dustCoins}`);
logger.info(`DUST balance:            ${dustBalance}`);
logger.info(`DUST progress:           ${JSON.stringify(dustProgress ?? null)}`);
logger.info(`DUST pending coins:      ${JSON.stringify((state.dust as { pendingCoins?: unknown }).pendingCoins ?? [])}`);
logger.info('-----------------------------------------');

if (nightBalance === 0n) {
  logger.warn(`Wallet has NO tNIGHT. Fund it at ${config.faucet} (unshielded address), then re-run.`);
  process.exitCode = 1;
} else if (dustBalance === 0n) {
  logger.warn('Wallet has tNIGHT but no spendable DUST yet. The test run will register NIGHT for DUST generation and wait for coins.');
} else {
  logger.info('Wallet is ready to deploy: tNIGHT present and DUST spendable.');
}

await wallet.stop().catch((err: unknown) => logger.warn(`stop() failed: ${String(err)}`));
