"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const MAX_INTERACTION_PENDING_MS = 15_000;
const BACKGROUND_REFRESH_POLL_MS = 2_000;

function clearTimer(timerRef: {
  current: ReturnType<typeof setTimeout> | null;
}) {
  if (!timerRef.current) return;
  clearTimeout(timerRef.current);
  timerRef.current = null;
}

function setInteractionTimeout(
  timerRef: { current: ReturnType<typeof setTimeout> | null },
  onTimeout: () => void,
) {
  clearTimer(timerRef);
  timerRef.current = setTimeout(onTimeout, MAX_INTERACTION_PENDING_MS);
}

function isSameOriginVaultsUrl(url: URL): boolean {
  return url.origin === window.location.origin && url.pathname === "/vaults";
}

interface VaultsNavigationProgressProps {
  readyToken: string;
  serverRefreshing: boolean;
}

export function VaultsNavigationProgress({
  readyToken,
  serverRefreshing,
}: VaultsNavigationProgressProps) {
  const router = useRouter();
  const [interactionPending, setInteractionPending] = useState(false);
  const interactionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const readyTokenRef = useRef(readyToken);

  useEffect(() => {
    if (readyTokenRef.current === readyToken) return;
    readyTokenRef.current = readyToken;
    setInteractionPending(false);
    clearTimer(interactionTimerRef);
  }, [readyToken]);

  useEffect(() => {
    const beginPending = () => {
      setInteractionPending(true);
      setInteractionTimeout(interactionTimerRef, () => {
        setInteractionPending(false);
      });
    };

    const handleClick = (event: MouseEvent) => {
      if (event.defaultPrevented) return;
      if (event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
        return;

      const target = event.target as HTMLElement | null;
      const anchor = target?.closest("a[href]") as HTMLAnchorElement | null;
      if (!anchor) return;
      if (anchor.target && anchor.target !== "_self") return;

      const url = new URL(anchor.href, window.location.href);
      if (!isSameOriginVaultsUrl(url)) return;

      const current = `${window.location.pathname}${window.location.search}`;
      const next = `${url.pathname}${url.search}`;
      if (next === current) return;

      beginPending();
    };

    const handleSubmit = (event: SubmitEvent) => {
      if (event.defaultPrevented) return;
      const form = event.target as HTMLFormElement | null;
      if (!form) return;
      if (!form.closest("[data-vaults-page]")) return;

      const method = (form.method || "get").toLowerCase();
      if (method !== "get") return;

      const actionUrl = new URL(
        form.action || window.location.href,
        window.location.href,
      );
      if (!isSameOriginVaultsUrl(actionUrl)) return;

      const formData = new FormData(form);
      const params = new URLSearchParams();
      for (const [key, value] of formData.entries()) {
        if (typeof value !== "string") continue;
        if (key === "q" && value.length === 0) continue;
        params.append(key, value);
      }

      const next = params.toString()
        ? `${actionUrl.pathname}?${params.toString()}`
        : actionUrl.pathname;
      const current = `${window.location.pathname}${window.location.search}`;
      if (next === current) return;

      beginPending();
    };

    document.addEventListener("click", handleClick, true);
    document.addEventListener("submit", handleSubmit, true);

    return () => {
      clearTimer(interactionTimerRef);
      document.removeEventListener("click", handleClick, true);
      document.removeEventListener("submit", handleSubmit, true);
    };
  }, []);

  useEffect(() => {
    if (!serverRefreshing) return;

    const timer = setInterval(() => {
      router.refresh();
    }, BACKGROUND_REFRESH_POLL_MS);

    return () => clearInterval(timer);
  }, [serverRefreshing, router]);

  const isPending = interactionPending || serverRefreshing;

  return (
    <div
      className="vaults-progress-slot"
      aria-live="polite"
      aria-busy={isPending}
    >
      {isPending ? <div className="vaults-progress-bar" /> : null}
    </div>
  );
}
