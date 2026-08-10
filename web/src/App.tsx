import { WalletConnect } from './components/WalletConnect';
import { CircuitCall } from './components/CircuitCall';
import { useMidnight } from './hooks/useMidnight';
import './App.css';

export default function App() {
  const m = useMidnight();

  return (
    <div className="page">
      <header className="hero">
        <p className="eyebrow">Rise In · Waxing Crescent · L2</p>
        <h1>Authorized Counter</h1>
        <p className="lede">
          Midnight Preprod dApp: connect <strong>1AM</strong> or <strong>Lace</strong>,
          call a Compact circuit, prove ownership without revealing your private secret.
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
        <CircuitCall
          connected={m.phase === 'connected'}
          contractAddress={m.contractAddress}
          onContractAddressChange={m.setContractAddress}
          counter={m.counter}
          ownerHex={m.ownerHex}
          ledgerLoading={m.ledgerLoading}
          callPhase={m.callPhase}
          txId={m.txId}
          callMessage={m.callMessage}
          deployPhase={m.deployPhase}
          deployMessage={m.deployMessage}
          ownerSecretInput={m.ownerSecretInput}
          ownerSecretStatus={m.ownerSecretStatus}
          onOwnerSecretChange={m.setOwnerSecretInput}
          onPersistOwnerSecret={() => void m.persistOwnerSecret(m.ownerSecretInput)}
          onDeploy={() => void m.deployNewContract()}
          onIncrement={() => void m.callIncrement()}
          onRefresh={() => void m.refreshLedger()}
        />
      </main>

      <footer className="footer">
        <p>
          Private witness stays in local storage only. Public ledger: counter + owner hash.
        </p>
      </footer>
    </div>
  );
}
