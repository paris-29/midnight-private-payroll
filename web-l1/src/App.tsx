import { WalletConnect } from './components/WalletConnect';
import { DeployContract } from './components/DeployContract';
import { useL1Deploy } from './hooks/useL1Deploy';
import './App.css';

export default function App() {
  const m = useL1Deploy();

  return (
    <div className="page">
      <header className="hero">
        <p className="eyebrow">Rise In · New Moon · L1</p>
        <h1>Deploy to Preprod</h1>
        <p className="lede">
          The 2-minute L1 deploy: connect <strong>1AM</strong> or <strong>Lace</strong>, deploy
          the compiled counter contract to Preprod, and copy the address into your README.
        </p>
      </header>

      <main className="grid">
        <WalletConnect
          phase={m.phase}
          wallets={m.wallets}
          selectedWalletId={m.selectedWalletId}
          onSelectWallet={m.setSelectedWalletId}
          walletLabel={m.walletLabel}
          address={m.address}
          networkId={m.networkId}
          error={m.error}
          onConnect={() => void m.connect()}
          onDisconnect={m.disconnect}
          onDismissError={() => m.setError(null)}
        />
        <DeployContract
          connected={m.phase === 'connected'}
          deployPhase={m.deployPhase}
          deployMessage={m.deployMessage}
          deployStep={m.deployStep}
          contractAddress={m.contractAddress}
          copied={m.copied}
          onDeploy={() => void m.deployNewContract()}
          onCopy={() => void m.copyAddress()}
        />
      </main>

      <footer className="footer">
        <p>
          L1 tool: deploy the contract to Preprod from the browser (no headless crawl, no DUST
          balance). The owner secret stays in this browser — use the same wallet for L2.
        </p>
      </footer>
    </div>
  );
}
