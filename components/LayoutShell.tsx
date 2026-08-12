"use client";

import { usePathname } from "@/i18n/navigation";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { BottomNav } from "@/components/BottomNav";

/** Routes that render without the shared Header/Footer chrome. */
const BARE_ROUTES = ["/terminal"];

export function LayoutShell({ children }: { children: React.ReactNode }) {
  // next-intl's usePathname returns the path WITHOUT the locale segment, which
  // is exactly what this comparison wants. The previous version read the raw
  // pathname from next/navigation and stripped the locale with /^\/[a-z]{2}/ —
  // a hand-rolled stand-in that also ate any future two-letter first segment
  // that was not a locale, and would not have survived a tag like `zh-Hans`.
  const pathname = usePathname();
  const isBare = BARE_ROUTES.some((r) => pathname.startsWith(r));

  if (isBare) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen flex flex-col pb-14 md:pb-0">
      <Header />
      <div className="flex-1">{children}</div>
      <Footer />
      <BottomNav />
    </div>
  );
}
