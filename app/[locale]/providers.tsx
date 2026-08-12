"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { WalletProvider } from "@/context/WalletContext";

type DetectedNetwork = "mainnet" | "testnet" | "signet" | "regtest";

// The configured network, and the only value used for the first render. It is
// the same on the server and in the browser, so it cannot mismatch during
// hydration.
function configuredNetwork(): DetectedNetwork {
  return (process.env.NEXT_PUBLIC_NETWORK as DetectedNetwork) || "mainnet";
}

// Hostname-derived network. This can only be evaluated in the browser, so it is
// applied after mount rather than during render.
function detectNetworkFromHostname(): DetectedNetwork {
  const hostname = window.location.hostname;

  if (hostname.includes("signet") || hostname.includes("staging")) {
    return "signet";
  }
  if (hostname.includes("testnet")) {
    return "testnet";
  }
  if (hostname.includes("regtest")) {
    return "regtest";
  }
  // localhost, and anything else, uses NEXT_PUBLIC_NETWORK
  return configuredNetwork();
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000, // 1 minute
            refetchOnWindowFocus: false,
            // Retry indefinitely for intermittent API errors
            retry: true,
            retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
            // Keep showing previous data while refetching
            placeholderData: (prev: unknown) => prev,
          },
        },
      })
  );

  // First render uses the configured network on both sides of hydration; the
  // hostname refinement lands in an effect, and only when it actually differs
  // (so the wallet provider is not re-initialised for nothing).
  const [network, setNetwork] = useState<DetectedNetwork>(configuredNetwork);

  useEffect(() => {
    const detected = detectNetworkFromHostname();
    setNetwork((current) => (current === detected ? current : detected));
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <WalletProvider network={network}>{children}</WalletProvider>
    </QueryClientProvider>
  );
}
