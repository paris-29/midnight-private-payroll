import type { InitialAPI } from '@midnight-ntwrk/dapp-connector-api';
import semver from 'semver';

/** Prefer API v4.x (Lace Carbon + 1AM current connectors). */
export const COMPATIBLE_CONNECTOR_API = '4.x';

export type DetectedWallet = {
  id: string;
  label: string;
  brand: '1am' | 'lace' | 'other';
  api: InitialAPI;
};

function brandOf(id: string, name: string): DetectedWallet['brand'] {
  const s = `${id} ${name}`.toLowerCase();
  if (s.includes('1am') || s.includes('oneam')) return '1am';
  if (s.includes('lace')) return 'lace';
  return 'other';
}

function displayLabel(id: string, api: InitialAPI): string {
  const brand = brandOf(id, api.name ?? '');
  if (brand === '1am') return '1AM';
  if (brand === 'lace') return 'Lace';
  return api.name?.trim() || id;
}

/** Enumerate every Midnight wallet injected on window.midnight. */
export function listMidnightWallets(): DetectedWallet[] {
  const midnight = window.midnight;
  if (!midnight) return [];

  return Object.entries(midnight)
    .filter((entry): entry is [string, InitialAPI] => {
      const api = entry[1];
      return (
        !!api &&
        typeof api === 'object' &&
        typeof api.connect === 'function' &&
        typeof api.apiVersion === 'string' &&
        semver.satisfies(api.apiVersion, COMPATIBLE_CONNECTOR_API)
      );
    })
    .map(([id, api]) => ({
      id,
      label: displayLabel(id, api),
      brand: brandOf(id, api.name ?? ''),
      api,
    }))
    .sort((a, b) => {
      // Prefer 1AM then Lace then others
      const order = { '1am': 0, lace: 1, other: 2 } as const;
      return order[a.brand] - order[b.brand] || a.label.localeCompare(b.label);
    });
}

export function truncateAddress(addr: string, head = 14, tail = 8): string {
  if (addr.length <= head + tail + 3) return addr;
  return `${addr.slice(0, head)}…${addr.slice(-tail)}`;
}

export function friendlyWalletError(err: unknown): string {
  const msg =
    err instanceof Error
      ? err.message
      : typeof err === 'string'
        ? err
        : (() => {
            try {
              return JSON.stringify(err);
            } catch {
              return String(err);
            }
          })();

  const lower = msg.toLowerCase();
  if (lower.includes('user rejected') || lower.includes('rejected by user')) {
    return 'Connection or transaction rejected in the wallet.';
  }
  if (lower.includes('not found') || lower.includes('could not find')) {
    return 'No Midnight wallet extension found. Install 1AM or Lace and refresh.';
  }
  if (lower.includes('network') || lower.includes('mismatch')) {
    return 'Network mismatch. Set the wallet network to Preprod and try again.';
  }
  if (lower.includes('not authorized') || lower.includes('permission')) {
    return 'Wallet did not authorize this DApp.';
  }
  // Substrate 1010 + Midnight LedgerApiError u8
  // https://docs.midnight.network/how-to/decode-1010-transaction-rejection-errors
  if (lower.includes('custom error: 182') || lower.includes('custom error:182')) {
    return (
      'Tx rejected (code 182 · TransactionApplication). Common causes: intent TTL expired ' +
      'after slow proving, or stale/duplicate intent. Retry increment once quickly. ' +
      'If it keeps failing: Deploy new, then Call increment immediately (same browser — owner secret is local).'
    );
  }
  if (lower.includes('custom error: 155') || lower.includes('feecalculation')) {
    return 'Fee calculation failed. Check wallet DUST/fees on Preprod, then retry.';
  }
  if (lower.includes('custom error: 115') || lower.includes('invalidproof')) {
    return 'Invalid ZK proof. Check proof-server version/settings in the wallet, then retry.';
  }
  if (lower.includes('custom error: 104') || lower.includes('unauthorized')) {
    return (
      'Circuit rejected (likely wrong owner secret). Deploy new in this browser, then call ' +
      'increment without clearing site data.'
    );
  }
  if (lower.includes('1010') || lower.includes('invalid transaction')) {
    return `Invalid transaction (1010). Full message: ${msg}`;
  }
  return msg || 'Wallet error. Check the browser console.';
}
