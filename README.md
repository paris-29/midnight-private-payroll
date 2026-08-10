# Midnight Private Payroll — Authorized Counter

> Privacy-preserving authorized counter on Midnight: public count, private owner secret, ZK proof of authorization without revealing the key.

## Live Demo

https://c4a82ecc.midnight-private-payroll.pages.dev

## Contract Address

| Network  | Address |
|----------|---------|
| Preprod  | `db476032de194149e1890863b68b52bf95a02ed139fd705789e39de75daddf7d` |
| Preview  | `027bb11dcd593df06f83e0925691a7730a8b8590ff715cb60c52dfc791e9c542` |
| Local    | printed by `yarn test:local` |

> **Level 2 uses the contract deployed from Level 1 (CLI).** The frontend connects to this existing address; it does not deploy a new contract.

## What This Does

A Compact smart contract + React frontend that:

1. Stores a **public** `counter` and a **public** `owner` commitment (hash of a private secret).
2. Takes the owner secret only via a **private witness** (`localSecretKey`).
3. Lets the owner call `increment()` after a ZK proof that they know the secret — without putting the secret on-chain.
4. Connects **1AM** or **Lace** via the Midnight DApp Connector API (pick either in the UI).

## Privacy Model

- **PUBLIC:**
  - `counter` — number of successful increments
  - `owner` — 32-byte public key derived from the private secret
- **PRIVATE:**
  - `localSecretKey()` witness — 32-byte secret held in browser private state / localStorage only
- **PROVES without revealing:**
  - The caller knows the secret whose hash equals `owner`
  - The raw secret bytes never appear in ledger state, circuit arguments, or the UI

## Privacy Claim

An on-chain observer **sees** the public counter value and the public owner hash, and that some authorized party called `increment`.  
An observer **cannot see** the 32-byte owner secret used as a witness — it is proved via ZK and never shown in the frontend (label: *Proved without revealing your input*). The owner secret may be imported once from the Level 1 CLI deploy into browser `localStorage`; it is never sent to a server or placed in circuit arguments.

## Tech Stack

- Midnight Network (Preprod / Preview / local)
- Compact 0.5.x (`pragma language_version 0.23`)
- Midnight.js 4.1.x + DApp Connector API 4.x
- React + Vite
- Wallets: **1AM** and **Lace** (both supported)
- Vitest (headless deploy/tests)
- Cloudflare Pages (frontend host)

## Prerequisites

- Node.js **v22+**
- Yarn 1.x
- Docker (proof server / local stack)
- Compact compiler on `PATH`
- Browser extension: **1AM** and/or **Lace**, network set to **Preprod**
- ZK proof server reachable (wallet settings or local `:6300`)

## Run Locally

```bash
# repo root
yarn install
yarn compile

# headless contract tests (optional)
yarn test:local

# frontend
yarn web:install
yarn web:dev
# open http://localhost:3000
```

Preprod deploy (Level 1 CLI, needs funded wallet + DUST):

```bash
cp .env.preprod.example .env.preprod
# set MIDNIGHT_PREPROD_MNEMONIC or MIDNIGHT_PREPROD_SEED
# fund: https://midnight-tmnight-preprod.nethermind.dev/
yarn proof:up
WAIT_FOR_DUST_TIMEOUT_MS=1800000 yarn test:preprod
# copy "Contract deployed at: …" into README + web/.env VITE_DEFAULT_CONTRACT
```

Connect the frontend to the existing Level 1 contract:

```bash
# web/.env
VITE_NETWORK_ID=preprod
VITE_DEFAULT_CONTRACT=<64-hex-preprod-address>
```

The frontend can both **deploy a new contract** and **call circuits** on an existing one.

### Deploy a new contract from the browser (easiest for demos)

1. Connect 1AM/Lace on Preprod and wait for sync.
2. Click **Deploy new contract**. The browser generates a fresh 32-byte owner secret, runs the
   constructor, and submits the deploy transaction.
3. The contract address appears in the input field.
4. Click **Call increment()** — the browser already owns the secret, so authorization succeeds.

### Importing the Level 1 owner secret into the browser

The Level 1 CLI deploy creates a random 32-byte owner secret in its LevelDB
private-state store. To call `increment()` from the browser on that same
contract, paste the secret (base64 or hex) into the frontend's **Owner secret**
field and click **Save owner secret**. The secret is stored only in browser
`localStorage` and is never sent to a server or shown in circuit arguments.

## Deploy frontend (Cloudflare Pages)

```bash
yarn compile
yarn web:install
yarn web:build
# from web/
npx wrangler pages deploy dist --project-name midnight-private-payroll
```

Cloudflare dashboard build settings (if connecting the GitHub repo):

- **Root directory:** `web` (or monorepo custom)
- **Build command:** `cd .. && yarn install && yarn compile && yarn web:install && yarn --cwd web build`  
  (requires Compact on the build image — prefer local `wrangler pages deploy` if Compact is only on your machine)
- **Output directory:** `web/dist`

## Demo Video

[PLACEHOLDER — record after live deploy]

Script (under 2 minutes) for Level 2:

1. Open live demo → choose **1AM** or **Lace** → Connect → address appears  
2. Either **Deploy new contract** (browser generates fresh secret) or paste the **Preprod contract address from Level 1**  
3. If using the Level 1 address, paste its owner secret and save  
3. Call **increment()** → show proving / loading state  
4. Show on-chain result (counter + tx id)  
5. Point out private secret was never shown (*Proved without revealing your input*)

## Project Structure

```
.
├── contracts/
│   ├── counter.compact
│   ├── witnesses.ts
│   ├── index.ts
│   └── managed/counter/     # yarn compile
├── src/                     # headless Node tests / wallet
│   └── test/counter.test.ts
├── web/                     # React + Vite frontend (L2)
│   ├── src/components/WalletConnect.tsx
│   ├── src/components/CircuitCall.tsx
│   ├── src/hooks/useMidnight.ts
│   ├── src/App.tsx
│   └── src/main.tsx
├── screenshots/
├── README.md
└── package.json
```

## Initial Idea

[HUMAN FILLS]

## Screenshots

See `screenshots/` (L1 compile/deploy). Add L2 wallet + circuit screenshots when ready.

## MCP / Docs

- Docs: https://docs.midnight.network/
- Docs MCP: https://midnight.mcp.kapa.ai
- Package MCP: `npx -y @midnight-ntwrk/mcp-server`
