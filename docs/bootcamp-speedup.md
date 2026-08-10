# Bootcamp Speed-Up: L1 → L2 in One Day on Preprod

**Audience:** Rise In / Midnight Builder Challenge organizers
**Prepared by:** Project `midnight-risein` (Authorized Counter)
**Status:** Live-tested against the official L1 + L2 challenge prompts

---

## 1. Executive Summary

The official L1/L2 flow can be completed **end-to-end in a single day (10:00–16:00)** — including a **Preprod deployment with a verifiable address** — by making three targeted changes to how the steps are executed. Nothing in the challenge checklist is skipped or weakened; the changes remove a **90-minute unavoidable sync crawl** that the default toolchain imposes, and replace it with a **2-minute browser deploy**.

Measured result of the change:

| Step | Default path | Bootcamp path |
|---|---|---|
| Wallet sync / crawl | **90 min** (Preprod dust-merkle crawl) | **0 min** (browser deploy bypasses it) |
| Local test suite | ~10 min | ~10 min (unchanged) |
| Deploy to Preprod | 90+ min (gated by crawl) | **~2 min** (browser + sponsored fee) |
| Frontend wiring + call | ~30 min | ~30 min (unchanged) |
| **Total active time** | **~3–4 h, unpredictable** | **~1.5–2 h, deterministic** |

---

## 2. The Problem We Found

### 2.1 The default toolchain has a hidden time sink

The official L1 prompt tells the user to deploy via the CLI:

```
NODE_OPTIONS="--max-old-space-size=12288" npm run deploy -- --network preview
```

For **Preview** this is acceptable (small chain history). But the challenge's L2 requires a **Preprod** contract. When the same CLI deploy flow runs against **Preprod**, the headless wallet must first crawl the entire Preprod dust-merkle history (currently **~1.37M records**) before it can spend DUST. At ~250 records/sec this is **~90 minutes of pure sync** with no progress toward the deliverable.

Worse: the default `npm run deploy` **times out at 30 minutes**, so a naive run *always fails* before the crawl finishes. Every participant on the default path hits this wall.

### 2.2 Evidence

Real run against Preprod, default settings:

```
[23:00:26] Wallet sync complete after 5569 emissions (requireDust=false)
[23:00:26] Waiting for spendable DUST (timeout 1800000ms)...
[23:00:40] dust coins=0, balance=0, sync=36385/1370587 (2%)
[23:17:23] dust coins=0, balance=0, sync=290559/1370636 (21%)   ← 17 min in, still 79% to go
[23:21:39] FAIL: No spendable DUST within 1800000ms             ← 30-min timeout killed it
```

The wallet's own reported sync rate (~250 evt/s) puts a full Preprod crawl at **~90 minutes**. Even with the timeout raised, that is the floor for the headless path — and it must be repeated on every machine that hasn't crawled before.

---

## 3. What We Changed, In Detail

### Change 1 — Deploy to Preprod via the browser, not the headless CLI

**Why it's fast:** The browser wallet (Lace / 1AM) uses **sponsored DUST** — fees are paid server-side by the wallet provider (1AM ProofStation). The participant's machine never needs to prove ownership of DUST, so it **never crawls the dust-merkle history**. Deploying the same contract to Preprod takes ~2 minutes instead of 90.

**What stays identical:**
- The contract is the same `counter.compact`.
- The deployed address is a real, verifiable on-chain Preprod address (confirmed via indexer).
- The L2 prompt's `My Preprod contract address is: …` is satisfied.

**Checklist coverage:** L1 requires "deployed to Preview or Preprod" — Preprod qualifies. L2 requires "Preprod with a verifiable address" — satisfied.

### Change 2 — Run the test suite against a local network, not Preprod

**Why:** The official prompt's "passing test suite" step only requires the tests to pass; it never specifies which network. Running the suite on a **local dev network** (testkit) needs zero crawl and zero faucet funding — it passes in minutes.

**What stays identical:** The test file is the same 3 tests (deploy with disclosed owner, increment with authorized witness, reject unauthorized). We only changed *where* they execute.

### Change 3 — One Preprod address serves both L1 and L2

The L1 README's Contract Address table gets both rows filled:
- **Preview** row → the hello-world demo address (from the toolchain check, optional)
- **Preprod** row → the participant's real contract (browser deploy)

L2 then references the **same Preprod address** — no second deploy, no network mismatch, nothing to reconcile. This removes the classic "deployed L1 on preview, L2 frontend points at preprod, nothing works" failure.

### Change 4 — Pre-provisioned starter repo (ours: `midnight-risein`)

Instead of asking participants to scaffold + wire everything live (30–45 min of fragile setup), hand them a **pre-built starter** with:
- `contracts/counter.compact` (public `counter` state + private `owner` witness + deliberate `disclose()`)
- `src/test/counter.test.ts` (3 passing tests)
- `web/` React + Vite frontend with `WalletConnect.tsx` + `CircuitCall.tsx` + `useMidnight.ts` hook
- `managed/` artifacts pipeline (`compact compile` → zkir copied to `web/public/`)
- README with the mandated sections (placeholders to fill)
- CI-friendly structure

**What changes for the participant:** they only *edit* the contract and README, rather than building from zero. This preserves the learning (they read and modify a real contract) while removing setup risk.

### Change 5 — Configurable timeouts (no more silent 30-min kill)

We made the vitest/timeout env vars overridable:

```bash
MIDNIGHT_HOOK_TIMEOUT_MS=21600000   # 6h hook timeout
WAIT_FOR_DUST_TIMEOUT_MS=14400000   # 4h dust-wait (default was a silent 30 min)
```

This is a safety net for anyone who *does* choose the headless Preprod path (e.g. as homework) — the run no longer dies mid-crawl.

### Change 6 — Diagnostics script (`scripts/check-wallet.ts`)

A read-only pre-deploy check that prints:
- unshielded address + NIGHT balance + UTXO registration status
- DUST coins / balance
- crawl progress (`appliedIndex / highestRelevantWalletIndex`, %)

Used to **preflight every participant before the day** — anyone not funded or not synced is caught before class time, not during it.

---

## 4. The Resulting One-Day Schedule

| Time | Activity | Delivers |
|---|---|---|
| 10:00–10:30 | Preflight: toolchain, funding, `check-wallet` | ready state |
| 10:30–11:15 | Edit `counter.compact`, `compact compile` → `managed/` | compile + circuits |
| 11:15–12:00 | Test suite on local network → 3/3 pass | passing suite |
| 12:00–12:45 | Break | — |
| 12:45–13:30 | Frontend: wallet connect, circuit call UI | L2 wiring |
| 13:30–14:30 | **Browser deploy to Preprod** + verify address + call increment | Preprod contract |
| 14:30–15:00 | Record demo video (connect + call + "proved without revealing") | L2 video |
| 15:00–16:00 | README, screenshots, commits, submit | submission |

The **only** thing in the default flow that was slow — the crawl — is simply not present.

---

## 5. What We Did NOT Change (Checklist Integrity)

We verified the official L1 and L2 checklists point-by-point. The following are untouched:

- `compact compile` still produces `managed/` with circuits + keys
- 3+ tests still pass (circuit logic, state transitions, private inputs never exposed)
- Contract deployed to Preview **or Preprod** with visible address ✓
- README contains all mandated sections (Contract Address table, Privacy Model, Privacy Claim, Tech Stack, Prerequisites, Setup, Screenshots placeholders, Initial Idea placeholder)
- L2: Lace connect/disconnect, local proof generation, "Proved without revealing your input" label, private input never in UI
- Live frontend on Vercel/Netlify pointing at the Preprod address
- 5 (L1) / 8 (L2) meaningful commits made by the participant manually

---

## 6. What Would Help From Your Side

1. **Sponsor one faucet run per participant** (tNIGHT + DUST) — funding is the single remaining external dependency.
2. **Confirm sponsored-DUST deploys count as "deployed to Preprod"** for grading (it produces a standard verifiable on-chain address).
3. **Consider adding the crawl-skip note to the official L1 prompt**, or marking "browser deploy" as an accepted method — it would save every participant ~90 minutes of dead time.
4. If headless Preprod deploys remain the norm, **raise the default `npm run deploy` timeout above 30 minutes** so the crawl isn't silently killed.

---

## 7. Participant Playbook (one-page handout)

**The whole day in four steps — no crawling, no waiting, one address.**

### Step 1 — L1, Preview via CLI (10:00–10:30)
Proves your toolchain works. Fast, small history.

```bash
NODE_OPTIONS="--max-old-space-size=12288" npm run deploy -- --network preview
```

Grab the address → it goes in your README's **Preview** row.

### Step 2 — L1, your real contract, Preprod via browser (10:30–11:15)
Edit `contracts/counter.compact`, then `compact compile` → `managed/`.

### Step 3 — Tests pass locally (11:15–12:00)
`npm test` against the local network → 3/3 pass. Screenshot it.

### Step 4 — Deploy to Preprod + L2 call (13:30–14:30)
1. **Deploy your contract to Preprod from the browser** (sponsored DUST) → copy the address.
2. Paste it into the README **Preprod** row → submit L1.
3. Build the frontend, point it at that same address.
4. Connect wallet → call `increment()` → record the demo video.

### ⚠ THE ONE RULE — don't break this
**The wallet that deploys the Preprod contract is the wallet that can call it.**

- Deploy with the browser wallet → the owner secret lives **in that wallet/extension** (localStorage / 1AM).
- The L2 demo must connect with **that same wallet** — otherwise the circuit rejects the call.
- It feels like common sense, but in a room of 50 people it's the #1 failure. Write your own wallet's name down before moving on.

### Submission reminder
- 5 commits (L1) / 8 commits (L2), meaningful messages
- Screenshots: compile output + deployed address
- Live frontend link (Vercel/Netlify) pointing at the Preprod address
- Demo video < 2 min: connect → call → "proved without revealing"

---

## 8. Risks / Caveats (honest)

- **Preview resets:** preview networks are periodically reset by Midnight. Bootcamp projects that must survive days should use Preprod (which our path already does).
- **Browser deploy keeps the owner secret in the browser** (localStorage / wallet). For a demo this is fine; for long-lived ownership, document exporting the secret.
- **Indexer load:** if a large cohort all crawls simultaneously on the headless path, the shared Preprod indexer slows. Our bootcamp path never crawls, so this is avoided by design.
