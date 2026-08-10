import { useCallback, useEffect, useRef, useState } from 'react';
import type { ConnectedAPI } from '@midnight-ntwrk/dapp-connector-api';
import { setNetworkId, type NetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { FetchZkConfigProvider } from '@midnight-ntwrk/midnight-js-fetch-zk-config-provider';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import {
  deployContract,
  findDeployedContract,
  submitCallTx,
} from '@midnight-ntwrk/midnight-js-contracts';
import {
  Binding,
  Proof,
  SignatureEnabled,
  Transaction,
  type FinalizedTransaction,
  type TransactionId,
} from '@midnight-ntwrk/midnight-js-protocol/ledger';
import {
  ContractState,
  fromHex,
  toHex,
  type ContractAddress,
} from '@midnight-ntwrk/midnight-js-protocol/compact-runtime';
import type { MidnightProviders, UnboundTransaction } from '@midnight-ntwrk/midnight-js-types';
import { inMemoryPrivateStateProvider } from '../lib/inMemoryPrivateState';
import {
  createPrivateState,
  decodeImportedOwnerSecret,
  getOrCreateOwnerSecret,
  ledger,
  makeCompiledCounterContract,
  saveOwnerSecret,
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
const DEFAULT_CONTRACT = (import.meta.env.VITE_DEFAULT_CONTRACT ?? '').trim();
const CONTRACT_STORAGE_KEY = 'midnight-counter-contract-address-v1';
const INDEXER_URL =
  import.meta.env.VITE_INDEXER_URL ??
  'https://indexer.preprod.midnight.network/api/v4/graphql';

export type ConnectionPhase =
  | 'detecting'
  | 'none'
  | 'ready'
  | 'connecting'
  | 'connected';

export type CallPhase = 'idle' | 'proving' | 'submitting' | 'done' | 'error';

export type CounterProviders = MidnightProviders<any>;

const CONTRACT_STATE_QUERY = `
  query ContractState($address: HexEncoded!) {
    contractAction(address: $address) {
      state
    }
  }
`;

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < clean.length; i += 2) {
    bytes[i / 2] = parseInt(clean.substr(i, 2), 16);
  }
  return bytes;
}

async function buildProviders(connected: ConnectedAPI): Promise<CounterProviders> {
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

  return {
    privateStateProvider: inMemoryPrivateStateProvider<string, CounterPrivateState>(),
    zkConfigProvider,
    proofProvider: httpClientProofProvider(proofServerUri, zkConfigProvider),
    publicDataProvider: indexerPublicDataProvider(config.indexerUri, config.indexerWsUri),
    walletProvider: {
      getCoinPublicKey: () => shielded.shieldedCoinPublicKey,
      getEncryptionPublicKey: () => shielded.shieldedEncryptionPublicKey,
      balanceTx: async (tx: UnboundTransaction): Promise<FinalizedTransaction> => {
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
        await connected.submitTransaction(toHex(tx.serialize()));
        return tx.identifiers()[0];
      },
    },
  };
}

export function useMidnight() {
  const [phase, setPhase] = useState<ConnectionPhase>('detecting');
  const [wallets, setWallets] = useState<DetectedWallet[]>([]);
  const [selectedWalletId, setSelectedWalletId] = useState<string | null>(null);
  const [walletLabel, setWalletLabel] = useState<string | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [contractAddress, setContractAddress] = useState(
    () => localStorage.getItem(CONTRACT_STORAGE_KEY)?.trim() || DEFAULT_CONTRACT,
  );
  const [counter, setCounter] = useState<bigint | null>(null);
  const [ownerHex, setOwnerHex] = useState<string | null>(null);
  const [ledgerLoading, setLedgerLoading] = useState(false);

  const [callPhase, setCallPhase] = useState<CallPhase>('idle');
  const [txId, setTxId] = useState<string | null>(null);
  const [callMessage, setCallMessage] = useState<string | null>(null);
  const [deployPhase, setDeployPhase] = useState<CallPhase>('idle');
  const [deployMessage, setDeployMessage] = useState<string | null>(null);
  const [ownerSecretInput, setOwnerSecretInput] = useState('');
  const [ownerSecretStatus, setOwnerSecretStatus] = useState<'idle' | 'saved'>('idle');

  const connectedRef = useRef<ConnectedAPI | null>(null);
  const providersRef = useRef<CounterProviders | null>(null);
  const compiledRef = useRef(makeCompiledCounterContract());
  const joinedRef = useRef(false);

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

  const refreshLedger = useCallback(
    async (addr?: string) => {
      const target = (addr ?? contractAddress).trim();
      if (!target || !/^[0-9a-fA-F]{64}$/.test(target)) return;
      setLedgerLoading(true);
      try {
        const res = await fetch(INDEXER_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: CONTRACT_STATE_QUERY,
            variables: { address: target },
          }),
        });
        const gql = await res.json();
        if (gql.errors?.length) throw new Error(gql.errors[0]?.message ?? 'Indexer error');
        const stateHex = gql.data?.contractAction?.state;
        if (!stateHex) throw new Error('Contract not found on Preprod indexer');
        const contractState = ContractState.deserialize(hexToBytes(stateHex));
        const state = ledger(contractState.data);
        setCounter(state.counter);
        setOwnerHex(
          Array.from(state.owner as Uint8Array)
            .map((b) => b.toString(16).padStart(2, '0'))
            .join(''),
        );
        setError(null);
      } catch (e) {
        setError(friendlyWalletError(e));
      } finally {
        setLedgerLoading(false);
      }
    },
    [contractAddress],
  );

  useEffect(() => {
    if (contractAddress) void refreshLedger(contractAddress);
  }, [contractAddress, refreshLedger]);

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
        const providers = await buildProviders(connected);

        const secret = getOrCreateOwnerSecret();
        const placeholder = (contractAddress || '0'.repeat(64)) as ContractAddress;
        providers.privateStateProvider.setContractAddress(placeholder);
        await providers.privateStateProvider.set(
          PRIVATE_STATE_ID,
          createPrivateState(secret),
        );

        connectedRef.current = connected;
        providersRef.current = providers;
        joinedRef.current = false;

        setWalletLabel(entry.label);
        setSelectedWalletId(entry.id);
        setAddress(unshieldedAddress);
        setPhase('connected');
      } catch (e) {
        setPhase('ready');
        setError(friendlyWalletError(e));
      }
    },
    [selectedWalletId, contractAddress],
  );

  const disconnect = useCallback(() => {
    connectedRef.current = null;
    providersRef.current = null;
    joinedRef.current = false;
    setAddress(null);
    setWalletLabel(null);
    setTxId(null);
    setCallMessage(null);
    setCallPhase('idle');
    setPhase(listMidnightWallets().length ? 'ready' : 'none');
  }, []);

  const ensureJoined = useCallback(async () => {
    const providers = providersRef.current;
    if (!providers) throw new Error('Connect a wallet first.');
    const addr = contractAddress.trim();
    if (!/^[0-9a-fA-F]{64}$/.test(addr)) {
      throw new Error('Set a valid 64-hex Preprod contract address first.');
    }
    providers.privateStateProvider.setContractAddress(addr as ContractAddress);
    const secret = getOrCreateOwnerSecret();
    await providers.privateStateProvider.set(PRIVATE_STATE_ID, createPrivateState(secret));

    if (!joinedRef.current) {
      await findDeployedContract(providers as any, {
        compiledContract: compiledRef.current,
        contractAddress: addr as ContractAddress,
        privateStateId: PRIVATE_STATE_ID,
        initialPrivateState: createPrivateState(secret),
      } as any);
      joinedRef.current = true;
    }
  }, [contractAddress]);

  const persistOwnerSecret = useCallback((raw: string) => {
    try {
      const secret = decodeImportedOwnerSecret(raw);
      saveOwnerSecret(secret);
      setOwnerSecretInput('');
      setOwnerSecretStatus('saved');
      setError(null);
      setTimeout(() => setOwnerSecretStatus('idle'), 2000);
    } catch (e) {
      setError(friendlyWalletError(e));
    }
  }, []);

  const deployNewContract = useCallback(async () => {
    setError(null);
    setDeployPhase('proving');
    setDeployMessage(null);
    try {
      const providers = providersRef.current;
      if (!providers) throw new Error('Connect a wallet first.');

      // Fresh owner secret: the browser provably owns the new contract from birth.
      const secret = crypto.getRandomValues(new Uint8Array(32));
      saveOwnerSecret(secret);

      const placeholder = '0'.repeat(64) as ContractAddress;
      providers.privateStateProvider.setContractAddress(placeholder);
      await providers.privateStateProvider.set(
        PRIVATE_STATE_ID,
        createPrivateState(secret),
      );

      setDeployMessage(
        'Deploying new contract… generating ZK proof. 1AM sponsors the DUST fees.',
      );

      const deployed = await deployContract(providers as any, {
        compiledContract: compiledRef.current,
        privateStateId: PRIVATE_STATE_ID,
        initialPrivateState: createPrivateState(secret),
      } as any);

      const addr = String((deployed as any).deployTxData.public.contractAddress);
      localStorage.setItem(CONTRACT_STORAGE_KEY, addr);
      setContractAddress(addr);
      joinedRef.current = true;

      setDeployMessage('Contract deployed. This browser now owns it — call increment() below.');
      setDeployPhase('done');
      setTimeout(() => void refreshLedger(addr), 2500);
    } catch (e) {
      setDeployPhase('error');
      setError(friendlyWalletError(e));
    }
  }, [refreshLedger]);

  const callIncrement = useCallback(async () => {
    setError(null);
    setTxId(null);
    setCallMessage(null);
    setCallPhase('proving');
    try {
      const providers = providersRef.current;
      if (!providers) throw new Error('Connect a wallet first.');
      await ensureJoined();

      setCallMessage(
        'Generating ZK proof… private owner secret is never shown or sent in the clear.',
      );

      // increment has no circuit args — omit `args` (typed as empty-parameter circuit)
      const result = await submitCallTx(providers as any, {
        compiledContract: compiledRef.current,
        contractAddress: contractAddress as ContractAddress,
        privateStateId: PRIVATE_STATE_ID,
        circuitId: 'increment',
      } as any);

      setCallPhase('submitting');
      const publicData = (result as any)?.public ?? {};
      const id =
        publicData.txId ??
        publicData.txHash ??
        publicData.transactionId ??
        'submitted';
      setTxId(String(id));
      setCallMessage('On-chain result: proved you know the owner secret without revealing it.');
      setCallPhase('done');
      setTimeout(() => void refreshLedger(), 2500);
    } catch (e) {
      setCallPhase('error');
      setError(friendlyWalletError(e));
    }
  }, [contractAddress, ensureJoined, refreshLedger]);

  return {
    phase,
    wallets,
    selectedWalletId,
    setSelectedWalletId,
    walletLabel,
    address,
    error,
    setError,
    contractAddress,
    setContractAddress,
    counter,
    ownerHex,
    ledgerLoading,
    callPhase,
    txId,
    callMessage,
    deployPhase,
    deployMessage,
    networkId: NETWORK_ID,
    ownerSecretInput,
    setOwnerSecretInput,
    persistOwnerSecret,
    ownerSecretStatus,
    connect,
    disconnect,
    deployNewContract,
    callIncrement,
    refreshLedger,
  };
}
