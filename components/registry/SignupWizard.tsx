"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  ArrowRight,
  Check,
  CircleAlert,
  Loader2,
  PenLine,
  Wallet,
  X as XIcon,
} from "lucide-react";
import {
  buildSigningMessage,
  newNonce,
  SIGNING_ACTIONS,
} from "@/lib/signing-message";
import { WALLETS, walletById, type WalletId } from "@/lib/registry/wallets";

/**
 * The builder registration wizard: connect X -> connect wallet -> sign -> done.
 *
 * RESUMABLE ACROSS AN EXTENSION INSTALL. Installing a wallet extension
 * reloads, and sometimes replaces, the page. Every step therefore records its
 * progress in localStorage, CLIENT-SIDE ONLY — no server round trip, and
 * nothing sensitive: the chosen wallet, the address it reported, and which
 * step was reached. The signature is never stored, only submitted.
 *
 * The X leg is STUBBED: /api/auth/x/start answers 501 until the OAuth routes
 * are implemented, and the wizard reports that honestly rather than pretending
 * to advance.
 */

const STORAGE_KEY = "alkanes.builder-signup.v1";

type Step = "x" | "wallet" | "sign" | "done";

interface WizardState {
  step: Step;
  walletId: WalletId | null;
  address: string | null;
  xHandle: string | null;
}

const EMPTY: WizardState = {
  step: "x",
  walletId: null,
  address: null,
  xHandle: null,
};

function load(): WizardState {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw);
    return {
      step: ["x", "wallet", "sign", "done"].includes(parsed?.step)
        ? parsed.step
        : "x",
      walletId: parsed?.walletId ?? null,
      address: typeof parsed?.address === "string" ? parsed.address : null,
      xHandle: typeof parsed?.xHandle === "string" ? parsed.xHandle : null,
    };
  } catch {
    return EMPTY;
  }
}

function save(state: WizardState) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Private browsing, quota, whatever — the wizard still works, it just
    // will not survive a reload. Not worth failing the flow over.
  }
}

const STEPS: Step[] = ["x", "wallet", "sign", "done"];

export function SignupWizard() {
  const t = useTranslations("registry.wizard");

  const [state, setState] = useState<WizardState>(EMPTY);
  const [hydrated, setHydrated] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Restore on mount, so an extension install mid-flow does not reset it.
  useEffect(() => {
    setState(load());
    setHydrated(true);
  }, []);

  const update = useCallback((patch: Partial<WizardState>) => {
    setState((prev) => {
      const next = { ...prev, ...patch };
      save(next);
      return next;
    });
  }, []);

  // --- step 1: X -----------------------------------------------------------
  const connectX = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/x/start");
      if (res.status === 501) {
        const body = await res.json().catch(() => ({}));
        setError(body?.error ?? t("errors.xUnavailable"));
        return;
      }
      if (res.redirected) {
        window.location.href = res.url;
        return;
      }
      setError(t("errors.xUnavailable"));
    } catch {
      setError(t("errors.xUnavailable"));
    } finally {
      setBusy(false);
    }
  }, [t]);

  // --- step 2: wallet ------------------------------------------------------
  const connectWallet = useCallback(
    async (id: WalletId) => {
      setBusy(true);
      setError(null);
      try {
        const adapter = walletById(id);
        if (!adapter.isAvailable()) {
          setError(t("errors.notInstalled", { wallet: adapter.label }));
          return;
        }
        const address = await adapter.connect();
        update({ walletId: id, address, step: "sign" });
      } catch (err) {
        setError(err instanceof Error ? err.message : t("errors.walletFailed"));
      } finally {
        setBusy(false);
      }
    },
    [t, update]
  );

  // --- step 3: sign --------------------------------------------------------
  const signAndRegister = useCallback(async () => {
    if (!state.walletId || !state.address) return;
    setBusy(true);
    setError(null);
    try {
      const adapter = walletById(state.walletId);
      const issuedAt = Date.now();
      const nonce = newNonce();

      // The server rebuilds this exact string from the fields below and checks
      // the signature against its own copy, so the message is not sent.
      // `resource` binds the signature to the X account being claimed; the
      // server fills it from the session, never from this request.
      const message = buildSigningMessage({
        action: SIGNING_ACTIONS.BUILDER_REGISTER,
        address: state.address,
        resource: "x:<from your X session>",
        params: { walletType: state.walletId },
        issuedAt,
        nonce,
      });

      const signature = await adapter.signMessage(message);

      const res = await fetch("/api/registry/builders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: state.address,
          walletType: state.walletId,
          signature,
          issuedAt,
          nonce,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body?.error ?? t("errors.registerFailed"));
        return;
      }

      update({ step: "done" });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errors.signFailed"));
    } finally {
      setBusy(false);
    }
  }, [state.address, state.walletId, t, update]);

  const reset = useCallback(() => {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* see save() */
    }
    setState(EMPTY);
    setError(null);
  }, []);

  const currentIndex = STEPS.indexOf(state.step);

  return (
    <div className="glass-card p-8 md:p-10">
      {/* Progress rail */}
      <ol className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-10">
        {STEPS.map((step, i) => {
          const done = i < currentIndex;
          const active = i === currentIndex;
          return (
            <li key={step} className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-mono ${
                  done
                    ? "border-[color:var(--sf-primary)] text-[color:var(--sf-primary)]"
                    : active
                      ? "border-[color:var(--sf-text)] text-[color:var(--sf-text)]"
                      : "border-[color:var(--sf-outline)] text-[color:var(--sf-muted)]"
                }`}
              >
                {done ? <Check className="h-3 w-3" /> : i + 1}
              </span>
              <span
                className={`text-sm ${
                  active
                    ? "text-[color:var(--sf-text)]"
                    : "text-[color:var(--sf-muted)]"
                }`}
              >
                {t(`steps.${step}`)}
              </span>
              {i < STEPS.length - 1 && (
                <ArrowRight
                  aria-hidden="true"
                  className="h-3 w-3 text-[color:var(--sf-outline)]"
                />
              )}
            </li>
          );
        })}
      </ol>

      {!hydrated ? (
        <p className="text-[color:var(--sf-muted)]">{t("loading")}</p>
      ) : (
        <>
          {state.step === "x" && (
            <section>
              <h2 className="text-xl font-semibold text-[color:var(--sf-text)] mb-2">
                {t("x.title")}
              </h2>
              <p className="text-[color:var(--sf-muted)] leading-relaxed max-w-[60ch] mb-6">
                {t("x.body")}
              </p>
              <button
                type="button"
                onClick={connectX}
                disabled={busy}
                className="btn-primary inline-flex items-center gap-2 disabled:opacity-50"
              >
                {busy ? (
                  <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
                ) : (
                  <XIcon aria-hidden="true" className="h-4 w-4" />
                )}
                {t("x.cta")}
              </button>
            </section>
          )}

          {state.step === "wallet" && (
            <section>
              <h2 className="text-xl font-semibold text-[color:var(--sf-text)] mb-2">
                {t("wallet.title")}
              </h2>
              <p className="text-[color:var(--sf-muted)] leading-relaxed max-w-[60ch] mb-6">
                {t("wallet.body")}
              </p>
              <div className="grid sm:grid-cols-2 gap-4">
                {WALLETS.map((adapter, i) => (
                  <div key={adapter.id} className="glass-card p-5">
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <p className="font-semibold text-[color:var(--sf-text)]">
                        {adapter.label}
                      </p>
                      {i === 0 && (
                        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--sf-primary)] border border-[color:var(--sf-primary)] rounded-full px-2 py-0.5">
                          {t("wallet.recommended")}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-[color:var(--sf-muted)] leading-relaxed mb-4">
                      {t(`wallet.${adapter.id === "SUBFROST" ? "subfrost" : "unisat"}`)}
                    </p>
                    <button
                      type="button"
                      onClick={() => connectWallet(adapter.id)}
                      disabled={busy}
                      className="btn-secondary inline-flex items-center gap-2 w-full justify-center disabled:opacity-50"
                    >
                      <Wallet aria-hidden="true" className="h-4 w-4" />
                      {t("wallet.connect")}
                    </button>
                  </div>
                ))}
              </div>
              <p className="text-sm text-[color:var(--sf-muted)] mt-6">
                {t("wallet.resumeNote")}
              </p>
            </section>
          )}

          {state.step === "sign" && (
            <section>
              <h2 className="text-xl font-semibold text-[color:var(--sf-text)] mb-2">
                {t("sign.title")}
              </h2>
              <p className="text-[color:var(--sf-muted)] leading-relaxed max-w-[60ch] mb-4">
                {t("sign.body")}
              </p>
              <p className="font-mono text-sm text-[color:var(--sf-text)] break-all mb-6">
                {state.address}
              </p>
              <button
                type="button"
                onClick={signAndRegister}
                disabled={busy}
                className="btn-primary inline-flex items-center gap-2 disabled:opacity-50"
              >
                {busy ? (
                  <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
                ) : (
                  <PenLine aria-hidden="true" className="h-4 w-4" />
                )}
                {t("sign.cta")}
              </button>
            </section>
          )}

          {state.step === "done" && (
            <section>
              <h2 className="text-xl font-semibold text-[color:var(--sf-text)] mb-2">
                {t("done.title")}
              </h2>
              <p className="text-[color:var(--sf-muted)] leading-relaxed max-w-[60ch] mb-6">
                {t("done.body")}
              </p>
              <Link href="/" className="btn-secondary inline-flex items-center gap-2">
                {t("done.cta")}
                <ArrowRight aria-hidden="true" className="h-4 w-4" />
              </Link>
            </section>
          )}

          {error && (
            <p
              role="status"
              className="mt-6 flex items-start gap-2 text-sm text-[color:var(--sf-text)]"
            >
              <CircleAlert
                aria-hidden="true"
                className="h-4 w-4 shrink-0 mt-0.5 text-[color:var(--sf-primary)]"
              />
              {error}
            </p>
          )}

          {state.step !== "x" && (
            <button
              type="button"
              onClick={reset}
              className="mt-8 text-sm text-[color:var(--sf-muted)] hover:text-[color:var(--sf-text)] transition-colors"
            >
              {t("startOver")}
            </button>
          )}
        </>
      )}
    </div>
  );
}
