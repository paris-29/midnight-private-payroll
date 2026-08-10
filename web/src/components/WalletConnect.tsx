import type { ConnectionPhase } from '../hooks/useMidnight';
import type { DetectedWallet } from '../lib/wallets';
import { truncateAddress } from '../lib/wallets';

type Props = {
  phase: ConnectionPhase;
  wallets: DetectedWallet[];
  selectedWalletId: string | null;
  onSelectWallet: (id: string) => void;
  walletLabel: string | null;
  address: string | null;
  networkId: string;
  error: string | null;
  onConnect: () => void;
  onDisconnect: () => void;
  onDismissError: () => void;
};

export function WalletConnect({
  phase,
  wallets,
  selectedWalletId,
  onSelectWallet,
  walletLabel,
  address,
  networkId,
  error,
  onConnect,
  onDisconnect,
  onDismissError,
}: Props) {
  return (
    <section className="card">
      <div className="card-head">
        <h2>Wallet</h2>
        <span className="pill">{networkId}</span>
      </div>

      <p className="muted">
        Connect with <strong>1AM</strong> or <strong>Lace</strong> (Midnight DApp Connector).
        Both appear if installed; pick one below.
      </p>

      {phase === 'detecting' && <p className="status">Detecting wallets…</p>}

      {phase === 'none' && (
        <div className="stack">
          <p className="warn">No Midnight wallet found.</p>
          <div className="row">
            <a
              className="btn secondary"
              href="https://1am.xyz"
              target="_blank"
              rel="noreferrer"
            >
              Get 1AM
            </a>
            <a
              className="btn secondary"
              href="https://chromewebstore.google.com/detail/lace/gafhhkghbfjjkeiendhlofajokpaflmk"
              target="_blank"
              rel="noreferrer"
            >
              Get Lace
            </a>
          </div>
          <p className="muted small">Refresh this page after installing.</p>
        </div>
      )}

      {(phase === 'ready' || phase === 'connecting') && wallets.length > 0 && (
        <div className="stack">
          <label className="label" htmlFor="wallet-select">
            Choose wallet
          </label>
          <select
            id="wallet-select"
            className="input"
            value={selectedWalletId ?? wallets[0]?.id}
            onChange={(e) => onSelectWallet(e.target.value)}
            disabled={phase === 'connecting'}
          >
            {wallets.map((w) => (
              <option key={w.id} value={w.id}>
                {w.label}
                {w.brand === '1am' ? ' (recommended)' : ''}
                {w.brand === 'lace' ? ' (Lace)' : ''}
                {` · API ${w.api.apiVersion}`}
              </option>
            ))}
          </select>
          <div className="wallet-list">
            {wallets.map((w) => (
              <button
                key={w.id}
                type="button"
                className={`wallet-chip ${selectedWalletId === w.id ? 'active' : ''} brand-${w.brand}`}
                onClick={() => onSelectWallet(w.id)}
                disabled={phase === 'connecting'}
              >
                <span className="wallet-name">{w.label}</span>
                <span className="wallet-meta">{w.brand.toUpperCase()}</span>
              </button>
            ))}
          </div>
          <button
            type="button"
            className="btn primary"
            onClick={onConnect}
            disabled={phase === 'connecting' || !selectedWalletId}
          >
            {phase === 'connecting' ? 'Connecting…' : `Connect ${wallets.find((w) => w.id === selectedWalletId)?.label ?? 'wallet'}`}
          </button>
        </div>
      )}

      {phase === 'connected' && address && (
        <div className="stack">
          <div className="connected-banner">
            <span className="dot" />
            Connected via <strong>{walletLabel ?? 'wallet'}</strong>
          </div>
          <div className="addr-box" title={address}>
            {truncateAddress(address, 18, 12)}
          </div>
          <p className="muted small mono full-addr">{address}</p>
          <button type="button" className="btn danger" onClick={onDisconnect}>
            Disconnect
          </button>
        </div>
      )}

      {error && (
        <div className="error-box" role="alert">
          <span>{error}</span>
          <button type="button" className="link" onClick={onDismissError}>
            dismiss
          </button>
        </div>
      )}
    </section>
  );
}
