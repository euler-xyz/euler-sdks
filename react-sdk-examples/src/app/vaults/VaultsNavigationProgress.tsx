"use client";

import { useEffect, useRef, useState } from "react";

const VAULTS_READY_EVENT = "vaults:data-ready";
const MAX_PENDING_MS = 15_000;

function clearTimer(timerRef: {
  current: ReturnType<typeof setTimeout> | null;
}) {
  if (!timerRef.current) return;
  clearTimeout(timerRef.current);
  timerRef.current = null;
}

function setPendingTimeout(
  timerRef: { current: ReturnType<typeof setTimeout> | null },
  onTimeout: () => void,
) {
  clearTimer(timerRef);
  timerRef.current = setTimeout(onTimeout, MAX_PENDING_MS);
}

function isSameOriginVaultsUrl(url: URL): boolean {
  return url.origin === window.location.origin && url.pathname === "/vaults";
}

export function VaultsNavigationProgress() {
  const [isPending, setIsPending] = useState(false);
  const pendingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const beginPending = () => {
      setIsPending(true);
      setPendingTimeout(pendingTimerRef, () => {
        setIsPending(false);
      });
    };

    const endPending = () => {
      setIsPending(false);
      clearTimer(pendingTimerRef);
    };

    const handleReady = () => {
      endPending();
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

    window.addEventListener(VAULTS_READY_EVENT, handleReady);
    document.addEventListener("click", handleClick, true);
    document.addEventListener("submit", handleSubmit, true);

    return () => {
      clearTimer(pendingTimerRef);
      window.removeEventListener(VAULTS_READY_EVENT, handleReady);
      document.removeEventListener("click", handleClick, true);
      document.removeEventListener("submit", handleSubmit, true);
    };
  }, []);

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

export function VaultsDataReadySignal({ token }: { token: string }) {
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent(VAULTS_READY_EVENT, { detail: token }),
    );
  }, [token]);

  return null;
}
