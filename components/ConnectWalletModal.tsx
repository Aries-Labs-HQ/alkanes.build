'use client';

import { Check, Download, Loader2, RefreshCw, X } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { useWallet } from '@/context/WalletContext';
import { WALLETS, type WalletId } from '@/lib/registry/wallets';

/**
 * The connect surface.
 *
 * Two wallets, both reached through `lib/registry/wallets.ts` — the same
 * adapter the builder registry signs with, so there is one definition of what
 * SUBFROST and UniSat are and one place to change it. SUBFROST is first and
 * marked recommended; UniSat is the alternative.
 *
 * There is deliberately no in-browser wallet here: no key generation, no
 * recovery phrase, no keystore file, no cloud backup. Those are the terminal's
 * business (see `lib/featureFlags.ts`), not the header's.
 *
 * Styling reuses what this file already used — the same panel and row surfaces
 * and the same `--sf-*` tokens. The terminal design system lands later and this
 * modal gets its final skin there; nothing here invents a new visual language.
 */

type Availability = 'unknown' | 'present' | 'absent';

export default function ConnectWalletModal() {
  const { isConnectModalOpen, onConnectModalOpenChange, connectInjectedWallet } =
    useWallet();

  const [availability, setAvailability] = useState<Record<WalletId, Availability>>({
    SUBFROST: 'unknown',
    UNISAT: 'unknown',
  });
  const [connecting, setConnecting] = useState<WalletId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [awaitingInstall, setAwaitingInstall] = useState<WalletId | null>(null);

  const [isClosing, setIsClosing] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [contentHeight, setContentHeight] = useState<number | 'auto'>('auto');
  const contentRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);

  /**
   * Detection has to happen after mount: `window.subfrost` does not exist on the
   * server, and reading it during render would make the first client render
   * disagree with the server's. 'unknown' is what both sides render.
   */
  const detect = useCallback(() => {
    setAvailability({
      SUBFROST: WALLETS[0].isAvailable() ? 'present' : 'absent',
      UNISAT: WALLETS[1].isAvailable() ? 'present' : 'absent',
    });
  }, []);

  useEffect(() => {
    if (!isConnectModalOpen) return;
    setError(null);
    setConnecting(null);
    setAwaitingInstall(null);
    setIsVisible(true);
    setIsClosing(false);
    detect();
  }, [isConnectModalOpen, detect]);

  /**
   * An extension installed while this modal is open only appears after the page
   * regains focus. Re-detecting then is what lets someone install a wallet in
   * another tab and come back to a working button instead of a stale dead end.
   */
  useEffect(() => {
    if (!isConnectModalOpen) return;
    const recheck = () => {
      detect();
      setAwaitingInstall(null);
    };
    window.addEventListener('focus', recheck);
    document.addEventListener('visibilitychange', recheck);
    return () => {
      window.removeEventListener('focus', recheck);
      document.removeEventListener('visibilitychange', recheck);
    };
  }, [isConnectModalOpen, detect]);

  const measureHeight = useCallback(() => {
    if (innerRef.current) setContentHeight(innerRef.current.scrollHeight);
  }, []);

  useLayoutEffect(() => {
    measureHeight();
  }, [availability, error, connecting, awaitingInstall, measureHeight]);

  const handleClose = useCallback(() => {
    setIsClosing(true);
    setTimeout(() => {
      onConnectModalOpenChange(false);
      setIsVisible(false);
      setIsClosing(false);
      setError(null);
      setConnecting(null);
      setAwaitingInstall(null);
    }, 140);
  }, [onConnectModalOpenChange]);

  useEffect(() => {
    if (!isConnectModalOpen) return;
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') handleClose();
    };
    document.addEventListener('keydown', onEscape);
    return () => document.removeEventListener('keydown', onEscape);
  }, [isConnectModalOpen, handleClose]);

  const handleConnect = async (id: WalletId) => {
    const adapter = WALLETS.find((w) => w.id === id)!;

    // Re-check at click time: the extension may have arrived or gone away since
    // the modal opened.
    if (!adapter.isAvailable()) {
      setAvailability((prev) => ({ ...prev, [id]: 'absent' }));
      setError(null);
      return;
    }

    setConnecting(id);
    setError(null);
    try {
      await connectInjectedWallet(id);
      handleClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // A rejected prompt is a decision, not a failure worth shouting about.
      setError(
        /reject|denied|cancel/i.test(message)
          ? `${adapter.label} connection was declined.`
          : message
      );
    } finally {
      setConnecting(null);
    }
  };

  if (!isConnectModalOpen && !isVisible) return null;

  return (
    <div
      onClick={handleClose}
      className={`fixed inset-0 z-50 grid place-items-center bg-black/25 backdrop-blur-sm px-4 transition-opacity duration-150 ${
        isClosing ? 'opacity-0' : 'opacity-100'
      }`}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.08)' }}
        className={`w-[400px] max-w-[92vw] rounded-3xl transition-transform duration-150 ${
          isClosing ? 'scale-95' : 'scale-100'
        }`}
      >
        <div className="flex items-center justify-between px-5 pt-5">
          <div className="text-base font-semibold text-[color:var(--sf-text)]">
            Connect a wallet
          </div>
          <button
            onClick={handleClose}
            aria-label="Close"
            className="text-[color:var(--sf-muted)] transition-colors hover:text-[color:var(--sf-text)]"
          >
            <X size={18} />
          </button>
        </div>

        <div
          ref={contentRef}
          className="overflow-hidden"
          style={{
            height: contentHeight === 'auto' ? 'auto' : contentHeight,
            transition: 'height 300ms cubic-bezier(0.25, 0.1, 0.25, 1)',
          }}
        >
          <div ref={innerRef} className="p-5">
            <div className="flex flex-col gap-3">
              {WALLETS.map((adapter, index) => (
                <WalletRow
                  key={adapter.id}
                  label={adapter.label}
                  note={index === 0 ? 'Recommended' : 'Alternative'}
                  recommended={index === 0}
                  installUrl={adapter.installUrl}
                  availability={availability[adapter.id]}
                  connecting={connecting === adapter.id}
                  disabled={connecting !== null}
                  awaitingInstall={awaitingInstall === adapter.id}
                  onConnect={() => handleConnect(adapter.id)}
                  onInstall={() => setAwaitingInstall(adapter.id)}
                  onRecheck={() => {
                    detect();
                    setAwaitingInstall(null);
                  }}
                />
              ))}
            </div>

            {error && (
              <div className="mt-4 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2.5 text-sm font-medium text-red-400">
                {error}
              </div>
            )}

            <p className="mt-4 text-[13px] leading-relaxed text-[color:var(--sf-muted)]">
              This site never asks for a recovery phrase and never holds a key.
              Signing happens in your wallet.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function WalletRow({
  label,
  note,
  recommended,
  installUrl,
  availability,
  connecting,
  disabled,
  awaitingInstall,
  onConnect,
  onInstall,
  onRecheck,
}: {
  label: string;
  note: string;
  recommended: boolean;
  installUrl: string;
  availability: Availability;
  connecting: boolean;
  disabled: boolean;
  awaitingInstall: boolean;
  onConnect: () => void;
  onInstall: () => void;
  onRecheck: () => void;
}) {
  const absent = availability === 'absent';

  return (
    <div className="rounded-2xl bg-[#232323]">
      <button
        onClick={absent ? undefined : onConnect}
        disabled={disabled || absent}
        className={`w-full flex items-center justify-between px-5 py-4 text-left transition-colors rounded-2xl ${
          absent ? 'cursor-default opacity-60' : 'hover:bg-[#2a2a2a] disabled:opacity-50'
        }`}
      >
        <div>
          <div className="flex items-center gap-2">
            <span className="text-base font-semibold text-[color:var(--sf-text)]">
              {label}
            </span>
            {recommended && (
              <span className="rounded-full border border-[color:var(--sf-outline)] px-2 py-0.5 text-[11px] font-bold uppercase tracking-widest text-[color:var(--sf-muted)]">
                {note}
              </span>
            )}
          </div>
          <div className="mt-0.5 text-[13px] text-[color:var(--sf-muted)]">
            {availability === 'unknown'
              ? 'Checking…'
              : absent
                ? 'Not installed'
                : recommended
                  ? 'Detected'
                  : `Detected — ${note.toLowerCase()}`}
          </div>
        </div>

        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/[0.06]">
          {connecting ? (
            <Loader2 size={18} className="animate-spin text-[color:var(--sf-muted)]" />
          ) : absent ? (
            <Download size={18} className="text-[color:var(--sf-muted)]" />
          ) : (
            <Check size={18} className="text-[color:var(--sf-muted)]" />
          )}
        </div>
      </button>

      {absent && (
        <div className="flex items-center gap-3 border-t border-white/[0.06] px-5 py-3">
          <a
            href={installUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={onInstall}
            className="text-[13px] font-semibold text-[color:var(--sf-text)] underline underline-offset-4 transition-colors hover:text-white"
          >
            Install {label}
          </a>
          <button
            onClick={onRecheck}
            className="ml-auto flex items-center gap-1.5 text-[13px] font-medium text-[color:var(--sf-muted)] transition-colors hover:text-[color:var(--sf-text)]"
          >
            <RefreshCw size={13} />
            {awaitingInstall ? 'Done — check again' : 'Check again'}
          </button>
        </div>
      )}
    </div>
  );
}
