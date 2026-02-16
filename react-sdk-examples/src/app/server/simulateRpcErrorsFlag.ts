const SIMULATE_RPC_ERRORS_ENV_KEY = "EULER_SIMULATE_RPC_ERRORS_ENABLED";

const serverFlagGlobal = globalThis as typeof globalThis & {
  __simulateRpcErrorsEnabled?: boolean;
};

function parseEnabledFromEnv(raw: string | undefined): boolean | null {
  if (!raw) return null;

  const normalized = raw.trim().toLowerCase();
  if (normalized === "1" || normalized === "true") return true;
  if (normalized === "0" || normalized === "false") return false;
  return null;
}

export function getSimulateRpcErrorsEnabled(): boolean {
  const envEnabled = parseEnabledFromEnv(
    process.env[SIMULATE_RPC_ERRORS_ENV_KEY],
  );
  if (envEnabled !== null) {
    serverFlagGlobal.__simulateRpcErrorsEnabled = envEnabled;
    return envEnabled;
  }

  return !!serverFlagGlobal.__simulateRpcErrorsEnabled;
}

export function setSimulateRpcErrorsEnabled(enabled: boolean): boolean {
  serverFlagGlobal.__simulateRpcErrorsEnabled = enabled;
  process.env[SIMULATE_RPC_ERRORS_ENV_KEY] = enabled ? "1" : "0";
  return enabled;
}

export function toggleSimulateRpcErrorsEnabled(): boolean {
  return setSimulateRpcErrorsEnabled(!getSimulateRpcErrorsEnabled());
}
