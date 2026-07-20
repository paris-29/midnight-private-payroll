# Midnight Private Payroll

> Privacy-first payroll on Midnight: private pay amounts via witnesses, deliberate `disclose()` for public audit totals.

## Contract Address

| Network  | Address                          |
|----------|----------------------------------|
| Local    | `bfae1b953601a3df8c075692e79593e2609002455587d72da0ec759d587ed033` |
| Preview  | `[PASTE AFTER FAUCET + DEPLOY]`  |
| Preprod  | `[PASTE AFTER FAUCET + DEPLOY]`  |

Local deploy uses the pre-funded Alice seed (no faucet). Preview/Preprod need faucet NIGHT + DUST.

## What This Does

A **Private Payroll** contract on Midnight Network. Each `processPay` call reads a **private pay amount** from a witness, proves it is between 1 and 1_000_000 units, then **deliberately discloses** that amount so public ledger fields (`lastDisclosedAmount`, `totalPaid`) update and a public `payRuns` counter increments.

This models selective disclosure for payroll audits: prove a valid private paycheck was processed; only values you choose to `disclose()` appear on-chain.

## Privacy Model

- **What is PUBLIC (on-chain, visible to anyone):**
  - `payRuns` — how many payroll runs completed
  - `lastDisclosedAmount` — last pay amount deliberately revealed
  - `totalPaid` — sum of disclosed pay amounts
- **What is PRIVATE (private witness, never on-chain by itself):**
  - `secretPayAmount()` witness / local private state `{ payAmount }`
  - Until a circuit `disclose()`s it, observers cannot read the raw amount from ledger alone
- **What the user PROVES without revealing:**
  - That a valid private pay amount (1..1_000_000) was used when the proof was generated
  - Invalid amounts (0 or >1_000_000) fail the circuit assert and never update state

## Tech Stack

- Midnight network, Compact language, Node.js v22+, Docker
- `@midnight-ntwrk/*` JS SDK, vitest, compact-runtime offline tests

## Prerequisites

- Node.js **v22+**
- Compact CLI (`compact --version`)
- Docker (proof server / local stack)
- For Preview/Preprod: funded seed/mnemonic + DUST (see faucet links below)

## Setup

```bash
# Toolchain
curl --proto '=https' --tlsv1.2 -LsSf \
  https://github.com/midnightntwrk/compact/releases/latest/download/compact-installer.sh | sh
source ~/.local/bin/env   # or add ~/.local/bin to PATH
compact update

# Project
cd l1-counter
yarn install
yarn compile
```

### Proof server

```bash
yarn proof:up
# or:
docker run -p 6300:6300 midnightntwrk/proof-server:8.1.0 midnight-proof-server -v
```

### Preview / Preprod wallet

```bash
cp .env.preview.example .env.preview
# Edit: set ONLY ONE of MIDNIGHT_PREVIEW_SEED or MIDNIGHT_PREVIEW_MNEMONIC
# Fund at: https://midnight-tmnight-preview.nethermind.dev/

cp .env.preprod.example .env.preprod
# Fund at: https://midnight-tmnight-preprod.nethermind.dev/
```

## Run Tests

```bash
# Offline unit tests (no Docker required) — Level 1 checklist
yarn test:unit

# Local network (Docker compose: node + indexer + proof server)
yarn env:up
yarn test:local
yarn env:down

# Preview / Preprod (wallet must be pre-funded)
yarn deploy:preview
yarn deploy:preprod
```

## Deploy (Level 1)

1. Start stack: `yarn env:up` (local) or `yarn proof:up` (remote)
2. **Local (recommended while faucet is down):** `yarn test:local` — pre-funded wallets
3. **Preview/Preprod:** fund wallet via faucet, then `yarn deploy:preview` / `yarn deploy:preprod`
4. Copy the printed **Contract Address** into the table above
5. On remote nets ensure wallet also has **DUST** (delegate in 1AM / Lace when needed)

## Initial Idea

Private payroll for teams that need **provable pay runs** without dumping every salary into a public spreadsheet forever.

Employers and employees can prove a paycheck amount was valid and processed (ZK range + circuit constraints). For this L1 demo we **selectively disclose** amounts into public totals (`totalPaid`, `payRuns`) so auditors can see aggregate activity — a stepping stone to full commitment/nullifier payroll where amounts stay hidden forever.

## Screenshots

[LEAVE PLACEHOLDER — add compile output + deployed address screenshots]

## Project structure

```
l1-counter/
├── contracts/
│   ├── payroll.compact
│   ├── index.ts
│   └── managed/payroll/     # compact compile output
├── tests/
│   └── payroll.test.ts      # 3+ offline tests
├── src/
│   ├── config.ts
│   ├── providers.ts
│   ├── wallet.ts
│   └── test/payroll.deploy.test.ts
├── .github/workflows/
├── README.md
└── package.json
```

## License

Apache-2.0 (upstream Midnight example licensing where applicable).
