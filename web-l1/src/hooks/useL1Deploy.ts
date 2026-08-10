import { useCallback, useEffect, useRef, useState } from 'react';
import type { ConnectedAPI } from '@midnight-ntwrk/dapp-connector-api';
import { setNetworkId, type NetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { FetchZkConfigProvider } from '@midnight-ntwrk/midnight-js-fetch-zk-config-provider';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { deployContract } from '@midnight-ntwrk/midnight-js-contracts';
import {
  Binding,
  Proof,
  SignatureEnabled,
  Transaction,
  type FinalizedTransaction,
  type TransactionId,
} from '@midnight-ntwrk/midnight-js-protocol/ledger';
import {
  fromHex,
  toHex,
  type ContractAddress,
} from '@midnight-ntwrk/midnight-js-protocol/compact-runtime';
import type { MidnightProviders, UnboundTransaction } from '@midnight-ntwrk/midnight-js-types';
import { inMemoryPrivateStateProvider } from '../lib/inMemoryPrivateState';
import {
  createPrivateState,
  getOrCreateOwnerSecret,
  makeCompiledCounterContract,
  PRIVATE_STATE_ID,
  type CounterCircuits,
  type CounterPrivateState,
} from '../lib/contract';
import {
  friendlyWalletError,
  listMidnightWallets,
  type DetectedWallet,
} from '../lib/wallets';

const NETWORK_ID = (import.meta.env.VITE_NETWORK_ID ?? 'preprod') as NetworkId;

export type L1Phase = 'detecting' | 'none' | 'ready' | 'connecting' | 'connected';
export type DeployPhase = 'idle' | 'proving' | 'done' | 'error';
export type DeployStep =
  | 'zk'
  | 'prove'
  | 'balance'
  | 'submit'
  | 'finalize';

export type CounterProviders = MidnightProviders<any>;

async function buildProviders(
  connected: ConnectedAPI,
  onStage: (step: DeployStep) => void,
): Promise<CounterProviders> {
  setNetworkId(NETWORK_ID);
  const config = await connected.getConfiguration();
  if (config.networkId && config.networkId !== NETWORK_ID) {
    throw new Error(
      `Network mismatch: wallet is on '${config.networkId}', DApp expects '${NETWORK_ID}'.`,
    );
  }

  const proofServerUri = config.proverServerUri;
  if (!proofServerUri) {
    throw new Error('Wallet did not provide a proof server URI. Check wallet settings.');
  }

  const shielded = await connected.getShieldedAddresses();
  const zkConfigProvider = new FetchZkConfigProvider<CounterCircuits>(
    window.location.origin,
    fetch.bind(window),
  );
  const proofProvider = httpClientProofProvider(proofServerUri, zkConfigProvider);
  const publicDataProvider = indexerPublicDataProvider(
    config.indexerUri,
    config.indexerWsUri,
  );

  return {
    privateStateProvider: inMemoryPrivateStateProvider<string, CounterPrivateState>(),
    zkConfigProvider,
    proofProvider: {
      ...proofProvider,
      proveTx: async (tx: any) => {
        onStage('prove');
        return proofProvider.proveTx(tx);
      },
    },
    publicDataProvider: {
      ...publicDataProvider,
      watchForTxData: async (txId: any) => {
        onStage('finalize');
        return publicDataProvider.watchForTxData(txId);
      },
    },
    walletProvider: {
      getCoinPublicKey: () => shielded.shieldedCoinPublicKey,
      getEncryptionPublicKey: () => shielded.shieldedEncryptionPublicKey,
      balanceTx: async (tx: UnboundTransaction): Promise<FinalizedTransaction> => {
        onStage('balance');
        const received = await connected.balanceUnsealedTransaction(toHex(tx.serialize()));
        return Transaction.deserialize<SignatureEnabled, Proof, Binding>(
          'signature',
          'proof',
          'binding',
          fromHex(received.tx),
        );
      },
    },
    midnightProvider: {
      submitTx: async (tx: FinalizedTransaction): Promise<TransactionId> => {
        onStage('submit');
        await connected.submitTransaction(toHex(tx.serialize()));
        return tx.identifiers()[0];
      },
    },
  };
}

export function useL1Deploy() {
  const [phase, setPhase] = useState<L1Phase>('detecting');
  const [wallets, setWallets] = useState<DetectedWallet[]>([]);
  const [selectedWalletId, setSelectedWalletId] = useState<string | null>(null);
  const [walletLabel, setWalletLabel] = useState<string | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [deployPhase, setDeployPhase] = useState<DeployPhase>('idle');
  const [deployMessage, setDeployMessage] = useState<string | null>(null);
  const [deployStep, setDeployStep] = useState<DeployStep | null>(null);
  const [contractAddress, setContractAddress] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const connectedRef = useRef<ConnectedAPI | null>(null);
  const providersRef = useRef<CounterProviders | null>(null);
  const compiledRef = useRef(makeCompiledCounterContract());

  useEffect(() => {
    const scan = () => {
      const found = listMidnightWallets();
      setWallets(found);
      if (found.length > 0) {
        setPhase((p) => (p === 'detecting' || p === 'none' ? 'ready' : p));
        setSelectedWalletId((prev) => prev ?? found[0].id);
      }
    };
    scan();
    let elapsed = 0;
    const t = setInterval(() => {
      elapsed += 200;
      scan();
      if (elapsed >= 5000 && listMidnightWallets().length === 0) {
        setPhase((p) => (p === 'detecting' ? 'none' : p));
        clearInterval(t);
      }
    }, 200);
    return () => clearInterval(t);
  }, []);

  const connect = useCallback(
    async (walletId?: string) => {
      setError(null);
      setPhase('connecting');
      try {
        const list = listMidnightWallets();
        const id = walletId ?? selectedWalletId ?? list[0]?.id;
        const entry = list.find((w) => w.id === id);
        if (!entry) {
          throw new Error(
            'Could not find 1AM or Lace. Install a Midnight wallet extension and refresh.',
          );
        }

        const connected = await entry.api.connect(NETWORK_ID);
        const status = await connected.getConnectionStatus();
        if (status.status === 'disconnected') {
          throw new Error('Wallet reported disconnected status.');
        }
        if ('networkId' in status && status.networkId && status.networkId !== NETWORK_ID) {
          throw new Error(
            `Network mismatch: connected to '${status.networkId}', expected '${NETWORK_ID}'.`,
          );
        }

        const { unshieldedAddress } = await connected.getUnshieldedAddress();
        const providers = await buildProviders(connected, setDeployStep);

        connectedRef.current = connected;
        providersRef.current = providers;

        setWalletLabel(entry.label);
        setSelectedWalletId(entry.id);
        setAddress(unshieldedAddress);
        setPhase('connected');
      } catch (e) {
        setPhase('ready');
        setError(friendlyWalletError(e));
      }
    },
    [selectedWalletId],
  );

  const disconnect = useCallback(() => {
    connectedRef.current = null;
    providersRef.current = null;
    setAddress(null);
    setWalletLabel(null);
    setPhase(listMidnightWallets().length ? 'ready' : 'none');
  }, []);

  const deployNewContract = useCallback(async () => {
    setError(null);
    setCopied(false);
    setDeployMessage(null);
    setDeployPhase('proving');
    setDeployStep('zk');
    setContractAddress(null);
    try {
      const providers = providersRef.current;
      if (!providers) throw new Error('Connect a wallet first.');

      // Fresh owner secret: this browser provably owns the new contract from birth.
      const secret = getOrCreateOwnerSecret();

      const placeholder = '0'.repeat(64) as ContractAddress;
      providers.privateStateProvider.setContractAddress(placeholder);
      await providers.privateStateProvider.set(
        PRIVATE_STATE_ID,
        createPrivateState(secret),
      );

      setDeployMessage(
        'Deploying to Preprod… loading ZK keys and circuits.',
      );

      const deployed = await deployContract(providers as any, {
        compiledContract: compiledRef.current,
        privateStateId: PRIVATE_STATE_ID,
        initialPrivateState: createPrivateState(secret),
      } as any);

      const addr = String((deployed as any).deployTxData.public.contractAddress);
      setContractAddress(addr);
      setDeployStep(null);
      setDeployMessage(
        'Contract deployed. Copy the address — it is your L1 deliverable and your L2 contract address.',
      );
      setDeployPhase('done');
    } catch (e) {
      setDeployPhase('error');
      setDeployStep(null);
      setError(friendlyWalletError(e));
    }
  }, []);

  const copyAddress = useCallback(async () => {
    if (!contractAddress) return;
    try {
      await navigator.clipboard.writeText(contractAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Clipboard unavailable — select and copy manually.');
    }
  }, [contractAddress]);

  return {
    phase,
    wallets,
    selectedWalletId,
    setSelectedWalletId,
    walletLabel,
    address,
    error,
    setError,
    deployPhase,
    deployMessage,
    deployStep,
    contractAddress,
    copied,
    networkId: NETWORK_ID,
    connect,
    disconnect,
    deployNewContract,
    copyAddress,
  };
}
