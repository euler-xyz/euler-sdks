const SIMULATE_RPC_ERRORS_STORAGE_KEY = "simulateRpcErrorsEnabled";

type BrowserGlobal = typeof globalThis & {
  __simulateRpcErrorsEnabledClient?: boolean;
};

function getBrowserGlobal(): BrowserGlobal {
  return globalThis as BrowserGlobal;
}

export function getClientSimulateRpcErrorsEnabled(): boolean {
  if (typeof window === "undefined") return false;

  const browserGlobal = getBrowserGlobal();
  if (typeof browserGlobal.__simulateRpcErrorsEnabledClient === "boolean") {
    return browserGlobal.__simulateRpcErrorsEnabledClient;
  }

  return window.localStorage.getItem(SIMULATE_RPC_ERRORS_STORAGE_KEY) === "1";
}

export function setClientSimulateRpcErrorsEnabled(enabled: boolean) {
  if (typeof window === "undefined") return;

  const browserGlobal = getBrowserGlobal();
  browserGlobal.__simulateRpcErrorsEnabledClient = enabled;
  window.localStorage.setItem(
    SIMULATE_RPC_ERRORS_STORAGE_KEY,
    enabled ? "1" : "0",
  );
}
