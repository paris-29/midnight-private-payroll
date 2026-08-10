import {
  type CoinPublicKey,
  DustSecretKey,
  type EncPublicKey,
  type FinalizedTransaction,
  LedgerParameters,
  ZswapSecretKeys,
} from '@midnight-ntwrk/midnight-js-protocol/ledger';
import type {
  MidnightProvider,
  UnboundTransaction,
  WalletProvider,
} from '@midnight-ntwrk/midnight-js-types';
import { ttlOneHour } from '@midnight-ntwrk/midnight-js-utils';
import type { WalletFacade, FacadeState, UnshieldedKeystore } from '@midnight-ntwrk/wallet-sdk';
import {
  type DustWalletOptions,
  type EnvironmentConfiguration,
  FluentWalletBuilder,
} from '@midnight-ntwrk/testkit-js';
import * as Rx from 'rxjs';
import type { Logger } from 'pino';

export type WalletSecret =
  | { kind: 'seed'; value: string }
  | { kind: 'mnemonic'; value: string };

export class MidnightWalletProvider implements MidnightProvider, WalletProvider {
  readonly wallet: WalletFacade;
  readonly unshieldedKeystore: UnshieldedKeystore;

  private constructor(
    private readonly logger: Logger,
    wallet: WalletFacade,
    private readonly zswapSecretKeys: ZswapSecretKeys,
    private readonly dustSecretKey: DustSecretKey,
    unshieldedKeystore: UnshieldedKeystore,
  ) {
    this.wallet = wallet;
    this.unshieldedKeystore = unshieldedKeystore;
  }

  getCoinPublicKey(): CoinPublicKey {
    return this.zswapSecretKeys.coinPublicKey;
  }

  getEncryptionPublicKey(): EncPublicKey {
    return this.zswapSecretKeys.encryptionPublicKey;
  }

  async balanceTx(
    tx: UnboundTransaction,
    ttl: Date = ttlOneHour(),
  ): Promise<FinalizedTransaction> {
    const recipe = await this.wallet.balanceUnboundTransaction(
      tx,
      {
        shieldedSecretKeys: this.zswapSecretKeys,
        dustSecretKey: this.dustSecretKey,
      },
      { ttl },
    );
    return await this.wallet.finalizeRecipe(recipe);
  }

  submitTx(tx: FinalizedTransaction): Promise<string> {
    return this.wallet.submitTransaction(tx);
  }

  async start(): Promise<void> {
    this.logger.info('Starting wallet...');
    await this.wallet.start(this.zswapSecretKeys, this.dustSecretKey);
  }

  async stop(): Promise<void> {
    return this.wallet.stop();
  }

  static async build(
    logger: Logger,
    env: EnvironmentConfiguration,
    secret: WalletSecret,
  ): Promise<MidnightWalletProvider> {
    const dustOptions: DustWalletOptions = {
      ledgerParams: LedgerParameters.initialParameters(),
      additionalFeeOverhead: 1_000n,
      feeBlocksMargin: 5,
    };

    const base = FluentWalletBuilder.forEnvironment(env)
      .withDustOptions(dustOptions);
    const builder =
      secret.kind === 'mnemonic'
        ? base.withMnemonic(secret.value)
        : base.withSeed(secret.value);

    const buildResult = await builder.buildWithoutStarting();
    const { wallet, seeds, keystore } = buildResult as {
      wallet: WalletFacade;
      seeds: {
        masterSeed: string;
        shielded: Uint8Array;
        dust: Uint8Array;
      };
      keystore: UnshieldedKeystore;
    };

    logger.info(
      `Wallet built from ${secret.kind}; master seed: ${seeds.masterSeed.slice(0, 8)}...`,
    );

    return new MidnightWalletProvider(
      logger,
      wallet,
      ZswapSecretKeys.fromSeed(seeds.shielded),
      DustSecretKey.fromSeed(seeds.dust),
      keystore,
    );
  }
}

function isProgressStrictlyComplete(progress: unknown): boolean {
  if (!progress || typeof progress !== 'object') {
    return false;
  }
  const candidate = progress as { isStrictlyComplete?: unknown };
  if (typeof candidate.isStrictlyComplete !== 'function') {
    return false;
  }
  return (candidate.isStrictlyComplete as () => boolean)();
}

export type SyncWalletOptions = {
  /** When false, finish once shielded+unshielded are complete (Preprod dust progress often lags). Default true. */
  requireDust?: boolean;
};

export async function syncWallet(
  logger: Logger,
  wallet: WalletFacade,
  options: SyncWalletOptions = {},
): Promise<FacadeState> {
  const requireDust = options.requireDust ?? true;
  logger.info(
    `Syncing wallet (requireDust=${requireDust})...`,
  );
  let emissionCount = 0;
  return Rx.firstValueFrom(
    wallet.state().pipe(
      Rx.tap((state: FacadeState) => {
        emissionCount++;
        const shielded = isProgressStrictlyComplete(state.shielded.state.progress);
        const unshielded = isProgressStrictlyComplete(state.unshielded.progress);
        const dust = isProgressStrictlyComplete(state.dust.state.progress);
        if (emissionCount % 50 === 0 || (shielded && unshielded && (!requireDust || dust))) {
          logger.info(
            `Wallet sync [${emissionCount}]: shielded=${shielded}, unshielded=${unshielded}, dust=${dust}`,
          );
        }
      }),
      Rx.filter((state: FacadeState) => {
        const shielded = isProgressStrictlyComplete(state.shielded.state.progress);
        const unshielded = isProgressStrictlyComplete(state.unshielded.progress);
        if (!shielded || !unshielded) return false;
        if (!requireDust) return true;
        return isProgressStrictlyComplete(state.dust.state.progress);
      }),
      Rx.tap(() =>
        logger.info(
          `Wallet sync complete after ${emissionCount} emissions (requireDust=${requireDust})`,
        ),
      ),
      Rx.catchError((err) => {
        logger.error(`Wallet sync error: ${err}`);
        return Rx.throwError(() => err);
      }),
    ),
  );
}