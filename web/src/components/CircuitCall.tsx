import type { CallPhase } from '../hooks/useMidnight';

type Props = {
  connected: boolean;
  contractAddress: string;
  onContractAddressChange: (v: string) => void;
  counter: bigint | null;
  ownerHex: string | null;
  ledgerLoading: boolean;
  callPhase: CallPhase;
  txId: string | null;
  callMessage: string | null;
  deployPhase: CallPhase;
  deployMessage: string | null;
  ownerSecretInput: string;
  ownerSecretStatus: 'idle' | 'saved';
  onOwnerSecretChange: (v: string) => void;
  onPersistOwnerSecret: () => void;
  onDeploy: () => void;
  onIncrement: () => void;
  onRefresh: () => void;
};

export function CircuitCall({
  connected,
  contractAddress,
  onContractAddressChange,
  counter,
  ownerHex,
  ledgerLoading,
  callPhase,
  txId,
  callMessage,
  deployPhase,
  deployMessage,
  ownerSecretInput,
  ownerSecretStatus,
  onOwnerSecretChange,
  onPersistOwnerSecret,
  onDeploy,
  onIncrement,
  onRefresh,
}: Props) {
  const busy = callPhase === 'proving' || callPhase === 'submitting' || deployPhase === 'proving';

  return (
    <section className="card">
      <div className="card-head">
        <h2>Circuit call</h2>
        <span className="pill privacy">Proved without revealing your input</span>
      </div>

      <p className="muted">
        Calls <code>increment()</code> on the already-deployed Preprod contract from Level 1.
        Authorization uses a <strong>private owner secret</strong> (witness). That secret is never
        rendered in this UI — only a public owner hash and counter appear on-chain.
      </p>

      <label className="label" htmlFor="contract">
        Preprod contract address (64 hex) — from your Level 1 CLI deploy
      </label>
      <input
        id="contract"
        className="input mono"
        value={contractAddress}
        onChange={(e) => onContractAddressChange(e.target.value.trim())}
        placeholder="paste 64-char hex address from yarn test:preprod"
        spellCheck={false}
      />

      <div className="secret-import">
        <label className="label" htmlFor="owner-secret">
          Owner secret (base64 or hex) — optional
        </label>
        <input
          id="owner-secret"
          className="input mono"
          type="password"
          value={ownerSecretInput}
          onChange={(e) => onOwnerSecretChange(e.target.value)}
          placeholder="paste secret from Level 1 deploy"
          spellCheck={false}
          autoComplete="off"
        />
        <p className="muted small">
          Stays in browser localStorage only; never sent to any server or shown in circuit args.
      If this field is empty, the DApp uses a browser-generated secret (will fail for the L1-deployed contract).
        </p>
        <button
          type="button"
          className="btn secondary"
          disabled={!ownerSecretInput.trim() || busy}
          onClick={onPersistOwnerSecret}
        >
          {ownerSecretStatus === 'saved' ? 'Saved ✓' : 'Save owner secret'}
        </button>
      </div>

      <div className="stats">
        <div>
          <span className="label">Public counter</span>
          <div className="stat-value">
            {ledgerLoading ? '…' : counter === null ? '—' : counter.toString()}
          </div>
        </div>
        <div>
          <span className="label">Public owner (hash)</span>
          <div className="stat-value mono small">
            {ownerHex ? `${ownerHex.slice(0, 16)}…` : '—'}
          </div>
        </div>
      </div>

      <div className="row">
        <button
          type="button"
          className="btn primary"
          disabled={!connected || busy || deployPhase === 'done'}
          onClick={onDeploy}
        >
          {deployPhase === 'proving'
            ? 'Deploying…'
            : deployPhase === 'done'
              ? 'Deployed ✓'
              : 'Deploy new contract'}
        </button>
        <button
          type="button"
          className="btn primary"
          disabled={!connected || busy || !/^[0-9a-fA-F]{64}$/.test(contractAddress)}
          onClick={onIncrement}
        >
          {callPhase === 'proving'
            ? 'Proving…'
            : callPhase === 'submitting'
              ? 'Submitting…'
              : 'Call increment() on existing contract'}
        </button>
        <button type="button" className="btn ghost" disabled={busy} onClick={onRefresh}>
          Refresh state
        </button>
      </div>

      {deployMessage && <p className="status ok">{deployMessage}</p>}

      <div className="privacy-claim">
        <strong>Observable privacy behavior</strong>
        <ul>
          <li>You prove knowledge of the owner secret (ZK).</li>
          <li>The secret key is <em>never</em> shown in the UI or circuit args.</li>
          <li>Observers only see counter bumps and the public owner hash.</li>
          <li>Your secret is stored only in this browser; imports are saved to localStorage.</li>
        </ul>
      </div>

      {callMessage && <p className="status ok">{callMessage}</p>}
      {txId && (
        <p className="mono small">
          Tx / result id: <code>{txId}</code>
        </p>
      )}
      {busy && (
        <div className="loading-bar" aria-live="polite">
          <div className="loading-bar-inner" />
          <span>Local proof generation in progress…</span>
        </div>
      )}
    </section>
  );
}
