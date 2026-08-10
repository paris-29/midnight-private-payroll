import type { DeployPhase, DeployStep } from '../hooks/useL1Deploy';

const STEPS: { id: DeployStep; label: string }[] = [
  { id: 'zk', label: 'Loading ZK keys & circuits' },
  { id: 'prove', label: 'Generating ZK proof (locally)' },
  { id: 'balance', label: 'Balancing transaction (1AM)' },
  { id: 'submit', label: 'Submitting to Preprod' },
  { id: 'finalize', label: 'Waiting for on-chain confirmation' },
];

type Props = {
  connected: boolean;
  deployPhase: DeployPhase;
  deployMessage: string | null;
  deployStep: DeployStep | null;
  contractAddress: string | null;
  copied: boolean;
  onDeploy: () => void;
  onCopy: () => void;
};

export function DeployContract({
  connected,
  deployPhase,
  deployMessage,
  deployStep,
  contractAddress,
  copied,
  onDeploy,
  onCopy,
}: Props) {
  const busy = deployPhase === 'proving';
  const activeIdx = deployStep ? STEPS.findIndex((s) => s.id === deployStep) : -1;

  const readmeRow = contractAddress
    ? `| Preprod | ${contractAddress} |`
    : '| Preprod | [PASTE ADDRESS AFTER DEPLOY] |';

  return (
    <section className="card">
      <div className="card-head">
        <h2>2 · Deploy to Preprod</h2>
        <span className="pill">browser · sponsored DUST</span>
      </div>

      <p className="muted">
        Deploys <code>counter.compact</code> (compiled, with ZK keys/zkir) to Preprod. The
        proof is generated locally in this browser; 1AM sponsors the fee. No CLI crawl, no
        DUST balance required.
      </p>

      <button
        type="button"
        className="btn primary"
        disabled={!connected || busy}
        onClick={onDeploy}
      >
        {busy
          ? 'Deploying…'
          : deployPhase === 'done'
            ? 'Deploy another'
            : 'Deploy counter contract to Preprod'}
      </button>

      {busy && (
        <div className="deploy-steps" aria-live="polite">
          {STEPS.map((step, i) => {
            const state =
              activeIdx < 0 || i < activeIdx
                ? 'done'
                : i === activeIdx
                  ? 'active'
                  : 'pending';
            return (
              <div key={step.id} className={`step ${state}`}>
                <span className="step-icon">{state === 'done' ? '✓' : state === 'active' ? '●' : '○'}</span>
                <span className="step-label">{step.label}</span>
              </div>
            );
          })}
        </div>
      )}

      {deployMessage && (
        <p className={`status ${deployPhase === 'error' ? 'err' : 'ok'}`}>{deployMessage}</p>
      )}

      {contractAddress && (
        <div className="deploy-box">
          <span className="label">Preprod contract address</span>
          <div className="addr-box mono" title={contractAddress}>
            {contractAddress}
          </div>
          <button type="button" className="btn secondary" onClick={onCopy}>
            {copied ? 'Copied ✓' : 'Copy address'}
          </button>

          <div className="readme-snippet">
            <span className="label">Paste into your README Contract Address table</span>
            <pre className="mono">{readmeRow}</pre>
          </div>
        </div>
      )}

      <div className="privacy-claim">
        <strong>After deploying — do not close this tab</strong>
        <ul>
          <li>This browser now holds the private owner secret for the contract.</li>
          <li>
            Your L2 frontend must connect with <strong>this same wallet/browser</strong> to
            call <code>increment()</code>.
          </li>
          <li>The address above is your L1 deliverable and your L2 contract address.</li>
        </ul>
      </div>
    </section>
  );
}
