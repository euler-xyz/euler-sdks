const serverFlagGlobal = globalThis as typeof globalThis & {
  __simulateRpcErrorsEnabled?: boolean;
};

export function getSimulateRpcErrorsEnabled(): boolean {
  return !!serverFlagGlobal.__simulateRpcErrorsEnabled;
}

export function setSimulateRpcErrorsEnabled(enabled: boolean): boolean {
  serverFlagGlobal.__simulateRpcErrorsEnabled = enabled;
  return enabled;
}

export function toggleSimulateRpcErrorsEnabled(): boolean {
  return setSimulateRpcErrorsEnabled(!getSimulateRpcErrorsEnabled());
}
