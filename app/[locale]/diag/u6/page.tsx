"use client";

/**
 * U-6 closure harness — client side. STAGING ONLY.
 *
 * Linked from nothing. Gated off by default. Never to reach a branch destined
 * for upstream.
 *
 * What it settles: the connect surface calls `signMessage(message,
 * "bip322-simple")` on window.subfrost and expects a base64 BIP-322 signature
 * that lib/bip322.ts can verify. That was inferred from UniSat's API and
 * asserted for SUBFROST without ever running it — no SUBFROST extension exists
 * on the machine this was written on. This page runs it for real and reports
 * exactly what came back.
 *
 * It deliberately calls the SAME adapter the site uses, rather than a copy, so
 * a PASS here is evidence about the real code path and not about this page.
 */

import { useCallback, useEffect, useState } from "react";
import { WALLETS, type WalletId } from "@/lib/registry/wallets";
import { buildSigningMessage, newNonce, SIGNING_ACTIONS } from "@/lib/signing-message";

const ENABLED = process.env.NEXT_PUBLIC_U6_DIAGNOSTIC === "on";

type Probe = {
  present: boolean;
  methods: string[];
  isAvailable: boolean;
};

type RawResult = {
  address: string;
  message: string;
  callExpression: string;
  returned: unknown;
  typeofReturn: string;
  constructorName: string;
  isString: boolean;
  stringLength: number | null;
  jsonStringified: string;
  error: string | null;
};

type Verdict = {
  pass: boolean;
  detail: string;
  observations: Record<string, unknown>;
};

function probe(id: WalletId): Probe {
  const key = id === "SUBFROST" ? "subfrost" : "unisat";
  const obj = (window as unknown as Record<string, Record<string, unknown> | undefined>)[key];
  return {
    present: obj !== undefined && obj !== null,
    methods: obj
      ? Object.keys(obj).filter((k) => typeof obj[k] === "function").sort()
      : [],
    isAvailable: WALLETS.find((w) => w.id === id)!.isAvailable(),
  };
}

export default function U6Diagnostic() {
  const [probes, setProbes] = useState<Record<WalletId, Probe> | null>(null);
  const [raw, setRaw] = useState<Partial<Record<WalletId, RawResult>>>({});
  const [verdicts, setVerdicts] = useState<Partial<Record<WalletId, Verdict>>>({});
  const [busy, setBusy] = useState<WalletId | null>(null);

  const rescan = useCallback(() => {
    setProbes({ SUBFROST: probe("SUBFROST"), UNISAT: probe("UNISAT") });
  }, []);

  useEffect(() => {
    if (!ENABLED) return;
    rescan();
  }, [rescan]);

  const run = async (id: WalletId) => {
    const adapter = WALLETS.find((w) => w.id === id)!;
    setBusy(id);
    setRaw((r) => ({ ...r, [id]: undefined }));
    setVerdicts((v) => ({ ...v, [id]: undefined }));

    try {
      const address = await adapter.connect();

      // The exact message shape the site signs, built by the site's own module.
      const message = buildSigningMessage({
        action: SIGNING_ACTIONS.PROFILE_VERIFY,
        address,
        resource: `address:${address}`,
        issuedAt: Date.now(),
        nonce: newNonce(),
      });

      // Call through the real adapter — same arguments, same order, same
      // "bip322-simple" second parameter.
      let returned: unknown = null;
      let error: string | null = null;
      try {
        returned = await adapter.signMessage(message);
      } catch (e) {
        error = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
      }

      const result: RawResult = {
        address,
        message,
        callExpression: `window.${id === "SUBFROST" ? "subfrost" : "unisat"}.signMessage(message, "bip322-simple")`,
        returned,
        typeofReturn: typeof returned,
        constructorName:
          returned === null || returned === undefined
            ? String(returned)
            : (returned as object).constructor?.name ?? "unknown",
        isString: typeof returned === "string",
        stringLength: typeof returned === "string" ? returned.length : null,
        jsonStringified: (() => {
          try {
            return JSON.stringify(returned, null, 2) ?? String(returned);
          } catch {
            return "<not JSON-serialisable>";
          }
        })(),
        error,
      };
      setRaw((r) => ({ ...r, [id]: result }));

      if (error || typeof returned !== "string") {
        setVerdicts((v) => ({
          ...v,
          [id]: {
            pass: false,
            detail: error
              ? `FAIL — signMessage threw before returning anything: ${error}`
              : `FAIL — signMessage resolved with a ${typeof returned}, not a string. ` +
                `lib/registry/wallets.ts asserts a string and would throw here; the ` +
                `raw value is shown above so the real shape can be read off it.`,
            observations: {},
          },
        }));
        return;
      }

      const response = await fetch("/api/diag/u6", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, address, signature: returned }),
      });

      if (!response.ok) {
        setVerdicts((v) => ({
          ...v,
          [id]: {
            pass: false,
            detail: `FAIL — the verification endpoint answered ${response.status}. ` +
              `If that is 404, U6_DIAGNOSTIC is not set to "on" in the server env.`,
            observations: {},
          },
        }));
        return;
      }

      const verdict = (await response.json()) as Verdict;
      setVerdicts((v) => ({ ...v, [id]: verdict }));
    } catch (e) {
      setRaw((r) => ({
        ...r,
        [id]: {
          address: "",
          message: "",
          callExpression: "",
          returned: null,
          typeofReturn: "undefined",
          constructorName: "n/a",
          isString: false,
          stringLength: null,
          jsonStringified: "",
          error: e instanceof Error ? `${e.name}: ${e.message}` : String(e),
        },
      }));
    } finally {
      setBusy(null);
    }
  };

  if (!ENABLED) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16 font-mono text-sm text-[#a0a0a0]">
        <h1 className="mb-3 text-[#e0e0e0]">U-6 diagnostic</h1>
        <p>
          Disabled. Set <code>NEXT_PUBLIC_U6_DIAGNOSTIC=on</code> and{" "}
          <code>U6_DIAGNOSTIC=on</code>, rebuild, and restart the staging
          service.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 font-mono text-sm text-[#a0a0a0]">
      <h1 className="mb-1 text-base text-[#e0e0e0]">U-6 — signMessage closure harness</h1>
      <p className="mb-6 text-[#707070]">
        Staging only. Nothing here signs a transaction, spends anything, or
        writes to a database. It asks each wallet to sign one message and reports
        whether the result verifies against <code>lib/bip322.ts</code>.
      </p>

      <button
        onClick={rescan}
        className="mb-6 border border-[#333] px-3 py-1.5 text-[#e0e0e0] hover:bg-white/5"
      >
        Re-scan for extensions
      </button>

      {(["SUBFROST", "UNISAT"] as WalletId[]).map((id) => {
        const p = probes?.[id];
        const r = raw[id];
        const v = verdicts[id];
        return (
          <section key={id} className="mb-8 border border-[#252525] p-4">
            <h2 className="mb-2 text-[#e0e0e0]">{id}</h2>

            <dl className="mb-3 grid grid-cols-[220px_1fr] gap-x-3 gap-y-1">
              <dt>window.{id === "SUBFROST" ? "subfrost" : "unisat"} present</dt>
              <dd className={p?.present ? "text-green-400" : "text-red-400"}>
                {String(p?.present ?? "…")}
              </dd>
              <dt>adapter isAvailable()</dt>
              <dd className={p?.isAvailable ? "text-green-400" : "text-red-400"}>
                {String(p?.isAvailable ?? "…")}
              </dd>
              <dt>methods exposed</dt>
              <dd className="break-all">{p?.methods.join(", ") || "—"}</dd>
            </dl>

            <button
              onClick={() => run(id)}
              disabled={!p?.present || busy !== null}
              className="border border-[#ffcc00]/50 px-3 py-1.5 text-[#ffcc00] hover:bg-[#ffcc00]/5 disabled:opacity-40"
            >
              {busy === id ? "running…" : "Connect and sign"}
            </button>

            {r && (
              <div className="mt-4 space-y-2">
                <div>
                  <div className="text-[#707070]">call</div>
                  <pre className="overflow-x-auto whitespace-pre-wrap break-all bg-black/40 p-2 text-[#e0e0e0]">
                    {r.callExpression}
                  </pre>
                </div>
                <div>
                  <div className="text-[#707070]">address</div>
                  <pre className="overflow-x-auto break-all bg-black/40 p-2 text-[#e0e0e0]">{r.address}</pre>
                </div>
                <div>
                  <div className="text-[#707070]">message signed</div>
                  <pre className="overflow-x-auto whitespace-pre-wrap break-all bg-black/40 p-2 text-[#e0e0e0]">
                    {r.message}
                  </pre>
                </div>
                <div>
                  <div className="text-[#707070]">
                    RAW return — typeof {r.typeofReturn}, constructor {r.constructorName}
                    {r.stringLength !== null ? `, length ${r.stringLength}` : ""}
                  </div>
                  <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all bg-black/40 p-2 text-[#e0e0e0]">
                    {r.error ? `THREW: ${r.error}` : r.jsonStringified}
                  </pre>
                </div>
              </div>
            )}

            {v && (
              <div
                className={`mt-4 border p-3 ${
                  v.pass ? "border-green-500/40 bg-green-500/5" : "border-red-500/40 bg-red-500/5"
                }`}
              >
                <div className={`mb-1 font-bold ${v.pass ? "text-green-400" : "text-red-400"}`}>
                  {v.pass ? "PASS" : "FAIL"}
                </div>
                <p className="mb-2 text-[#c0c0c0]">{v.detail}</p>
                {Object.keys(v.observations).length > 0 && (
                  <pre className="overflow-x-auto whitespace-pre-wrap break-all bg-black/40 p-2 text-[#909090]">
                    {JSON.stringify(v.observations, null, 2)}
                  </pre>
                )}
              </div>
            )}
          </section>
        );
      })}
    </main>
  );
}
