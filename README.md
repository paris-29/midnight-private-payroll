# Midnight Rise In — New Moon Counter

> Privacy-preserving authorized counter on Midnight: public count, private owner secret, ZK proof of authorization without revealing the key.

## Contract Address

| Network  | Address |
|----------|---------|
| Preview  | `0cbf31ad742ecc85dde1a315717c75b6ef36c186246484aedd83518da6f32273` |
| Preprod  | _not deployed yet_ |
| Local    | `c94599ae5b813e860c7300d2beb363c0a7b3dc5ec48a0be1e513a9e9322ed54e` (from last `yarn test:local`) |

## What This Does

A Compact smart contract that:

1. Stores a **public** `counter` and a **public** `owner` commitment (hash of a private secret).
2. Takes the owner secret only via a **private witness** (`localSecretKey`).
3. Lets the owner call `increment()` after a ZK proof that they know the secret — without putting the secret on-chain.
4. Uses deliberate `disclose()` only when writing the derived public key in the constructor / `resetOwner`.

## Privacy Model

- **PUBLIC:**
  - `counter` — number of successful increments
  - `owner` — 32-byte public key derived from the private secret
- **PRIVATE:**
  - `localSecretKey()` witness — 32-byte secret held in local private state only
- **PROVES without revealing:**
  - The caller knows the secret whose hash equals `owner`
  - The raw secret bytes never appear in ledger state or circuit arguments

## Tech Stack

- Midnight Network (local undeployed / Preview / Preprod)
- Compact 0.5.x (`pragma language_version 0.23`)
- Midnight.js 4.1.x + wallet-sdk + testkit-js
- Node.js 22+, Docker, local ZK proof server (`:6300`)
- Vitest

## Prerequisites

- Node.js **v22+**
- Docker running
- Compact compiler on `PATH` (`compact --version`)
- ZK proof server: `docker run -p 6300:6300 midnightntwrk/proof-server:latest midnight-proof-server -v`
- Yarn 1.x

## Setup

```bash
yarn install
yarn compile
```

## Run Tests

Local stack (node + indexer + proof server):

```bash
yarn env:up
yarn test:local
yarn env:down
```

If you already have a proof server on port 6300, start only node + indexer:

```bash
docker compose up -d --wait node indexer
yarn test:local
```

Preview / Preprod (after funding):

```bash
cp .env.preview.example .env.preview
# set MIDNIGHT_PREVIEW_SEED or MIDNIGHT_PREVIEW_MNEMONIC only (one of them)
yarn proof:up   # or keep your existing proof server
yarn test:preview
```

Faucets:

- Preview: https://midnight-tmnight-preview.nethermind.dev/
- Preprod: https://midnight-tmnight-preprod.nethermind.dev/

## Project Structure

```
.
├── contracts/
│   ├── counter.compact
│   ├── witnesses.ts
│   ├── index.ts
│   └── managed/counter/     # compact compile output
├── src/
│   ├── config.ts
│   ├── providers.ts
│   ├── wallet.ts
│   └── test/counter.test.ts
├── scripts/
├── README.md
└── package.json
```

## Initial Idea

[HUMAN FILLS — one paragraph: what you want to build for Rise In beyond this counter]

## Screenshots

[HUMAN FILLS — paste compile output + deployed contract address screenshot]

## MCP / Docs

- Docs: https://docs.midnight.network/
- Docs MCP: https://midnight.mcp.kapa.ai
- Package MCP: `npx -y @midnight-ntwrk/mcp-server`
