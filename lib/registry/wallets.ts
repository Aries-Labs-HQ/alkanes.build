"use client";

/**
 * Browser wallet adapters for the builder registry.
 *
 * SUBFROST is the recommended builder wallet; UniSat is the alternative. Both
 * expose an injected object with `requestAccounts` and `signMessage`, so the
 * adapter surface is small and the difference between them is a name.
 *
 * The registry never asks a wallet to sign a transaction or a PSBT — only a
 * message. Nothing here builds, signs or broadcasts anything spendable.
 */

export type WalletId = "SUBFROST" | "UNISAT";

interface InjectedWallet {
  requestAccounts?: () => Promise<string[]>;
  getAccounts?: () => Promise<string[]>;
  signMessage?: (message: string, type?: string) => Promise<string>;
}

declare global {
  interface Window {
    subfrost?: InjectedWallet;
    unisat?: InjectedWallet;
  }
}

export interface WalletAdapter {
  id: WalletId;
  /** Display name, always spelled this way. */
  label: string;
  /** Where to get it, for the "not installed" case. */
  installUrl: string;
  /** Is the extension injected right now? */
  isAvailable(): boolean;
  /** Prompt for accounts, return the first. */
  connect(): Promise<string>;
  /** BIP-322 message signature, base64. */
  signMessage(message: string): Promise<string>;
}

function injected(id: WalletId): InjectedWallet | undefined {
  if (typeof window === "undefined") return undefined;
  return id === "SUBFROST" ? window.subfrost : window.unisat;
}

function makeAdapter(
  id: WalletId,
  label: string,
  installUrl: string
): WalletAdapter {
  return {
    id,
    label,
    installUrl,
    isAvailable() {
      const w = injected(id);
      return typeof w?.signMessage === "function";
    },
    async connect() {
      const w = injected(id);
      if (!w) throw new Error(`${label} is not installed`);
      const accounts =
        (await w.requestAccounts?.()) ?? (await w.getAccounts?.()) ?? [];
      const address = accounts[0];
      if (!address) throw new Error(`${label} returned no account`);
      return address;
    },
    async signMessage(message: string) {
      const w = injected(id);
      if (typeof w?.signMessage !== "function") {
        throw new Error(`${label} cannot sign messages`);
      }
      // Both wallets take an optional signature-type argument; "bip322-simple"
      // is what produces a signature this site's verifier accepts.
      const signature = await w.signMessage(message, "bip322-simple");
      if (typeof signature !== "string" || signature === "") {
        throw new Error(`${label} returned an empty signature`);
      }
      return signature;
    },
  };
}

/** SUBFROST first: it is the recommended builder wallet. */
export const WALLETS: WalletAdapter[] = [
  makeAdapter("SUBFROST", "SUBFROST", "https://subfrost.io"),
  makeAdapter("UNISAT", "UniSat", "https://unisat.io"),
];

export function walletById(id: WalletId): WalletAdapter {
  const adapter = WALLETS.find((w) => w.id === id);
  if (!adapter) throw new Error(`unknown wallet: ${id}`);
  return adapter;
}
