"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

const BACKGROUND_REFRESH_POLL_MS = 500;

interface ServerRefreshProgressProps {
  serverRefreshing: boolean;
}

export function ServerRefreshProgress({
  serverRefreshing,
}: ServerRefreshProgressProps) {
  const router = useRouter();

  useEffect(() => {
    if (!serverRefreshing) return;

    router.refresh();

    const timer = setInterval(() => {
      router.refresh();
    }, BACKGROUND_REFRESH_POLL_MS);

    return () => clearInterval(timer);
  }, [serverRefreshing, router]);

  return (
    <div
      className="vaults-progress-slot"
      aria-live="polite"
      aria-busy={serverRefreshing}
    >
      {serverRefreshing ? <div className="vaults-progress-bar" /> : null}
    </div>
  );
}
