import { useMemo, useState, type MouseEvent } from "react";
import type { OracleAdapterEntry, OracleResolvedVault } from "euler-v2-sdk";
import type { OracleAdapterMetadataMap } from "../queries/sdkQueries.ts";

type OracleAdaptersInfoProps = {
  chainId: number;
  adapters?: OracleAdapterEntry[];
  resolvedVaults?: OracleResolvedVault[];
  metadataMap?: OracleAdapterMetadataMap;
  tokenSymbolMap?: Record<string, string>;
  addressLabels?: Record<string, string | undefined>;
};

const GENERIC_PROVIDER_ICONS: Record<string, string> = {
  Cross: "X",
  FixedRate: "FR",
  FixedRateOracle: "FR",
  RateProvider: "RP",
  RateProviderOracle: "RP",
  Unknown: "?",
};

const DUPLICATED_PROVIDER_ICONS: Record<string, string[]> = {
  Chainlink: ["ChainlinkInfrequentOracle", "ChainlinkOracle"],
  Lido: ["LidoFundamental"],
  Mev: ["MEVCapital", "MEVLinearDiscount"],
  Pendle: ["PendleUniversalOracle"],
  Pyth: ["PythOracle"],
  RedStone: ["RedstoneClassicOracle", "RedStonePull"],
};

function providerLabel(
  adapter: OracleAdapterEntry,
  metadata?: OracleAdapterMetadataMap[string]
): string {
  return metadata?.provider ?? metadata?.name ?? adapter.name ?? "Unknown";
}

function normalizeProviderName(provider: string): string {
  return provider.replace(/\s+/g, "");
}

function resolveProviderIconName(provider: string): string {
  const normalized = normalizeProviderName(provider);
  const duplicateEntry = Object.entries(DUPLICATED_PROVIDER_ICONS).find(
    ([, names]) => names.includes(normalized)
  );
  return duplicateEntry?.[0] ?? normalized;
}

function shortAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function symbolForAddress(
  address: string,
  tokenSymbolMap?: Record<string, string>,
  addressLabels?: Record<string, string | undefined>
): string {
  const key = address.toLowerCase();
  return addressLabels?.[key] ?? tokenSymbolMap?.[key] ?? shortAddress(address);
}

function checksSummary(metadata?: OracleAdapterMetadataMap[string]): string {
  const checks = metadata?.checks;
  if (!checks || checks.length === 0) return "N/A";
  const failed = checks.filter((check) => check.pass === false);
  if (failed.length === 0) return `${checks.length} passed`;
  return `${failed.length} failed`;
}

function resolvedVaultLabel(resolvedVault: OracleResolvedVault): string {
  return `Resolved vault ${shortAddress(resolvedVault.vault)}`;
}

function ProviderIcon({ provider }: { provider: string }) {
  const resolvedName = resolveProviderIconName(provider);
  const genericLabel = GENERIC_PROVIDER_ICONS[resolvedName];
  const [imageFailed, setImageFailed] = useState(false);

  if (genericLabel) {
    return (
      <span className="oracle-provider-generic" aria-hidden="true">
        {genericLabel}
      </span>
    );
  }

  if (!imageFailed) {
    return (
      <img
        className="oracle-provider-image"
        src={`/providers/${resolvedName}.svg`}
        alt=""
        onError={() => setImageFailed(true)}
      />
    );
  }

  return (
    <span className="oracle-provider-fallback" aria-hidden="true">
      {resolvedName.slice(0, 2).toUpperCase()}
    </span>
  );
}

export function OracleAdaptersInfo({
  chainId,
  adapters,
  resolvedVaults,
  metadataMap,
  tokenSymbolMap,
  addressLabels,
}: OracleAdaptersInfoProps) {
  const [open, setOpen] = useState(false);
  const list = adapters ?? [];
  const resolvedList = resolvedVaults ?? [];
  const merged = useMemo(
    () =>
      list.map((adapter) => ({
        adapter,
        metadata: metadataMap?.[adapter.oracle.toLowerCase()],
      })),
    [list, metadataMap]
  );
  if (list.length === 0 && resolvedList.length === 0) return null;

  const openModal = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setOpen(true);
  };

  const closeModal = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        className="oracle-adapters-trigger"
        onClick={openModal}
        title="Show oracle sequence details"
        aria-label="Show oracle sequence details"
      >
        {resolvedList.map((resolvedVault, index) => {
          const label = resolvedVaultLabel(resolvedVault);
          return (
            <span
              key={`${resolvedVault.vault}-${index}`}
              className="oracle-provider-pill oracle-provider-pill-resolved"
              title={label}
              aria-label={label}
            >
              <span className="oracle-provider-generic" aria-hidden="true">
                RV
              </span>
            </span>
          );
        })}
        {merged.map(({ adapter, metadata }, index) => {
          const label = providerLabel(adapter, metadata);
          return (
          <span
            key={`${adapter.oracle}-${index}`}
            className="oracle-provider-pill"
            title={label}
            aria-label={label}
          >
            <ProviderIcon provider={label} />
          </span>
          );
        })}
      </button>
      {open && (
        <div className="error-tooltip-backdrop" onClick={closeModal}>
          <div
            className="error-tooltip-dialog"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
          >
            <div className="error-tooltip-header">
              <strong>Oracle Sequence</strong>
              <button
                type="button"
                className="error-tooltip-close"
                onClick={closeModal}
              >
                Close
              </button>
            </div>
            <div className="oracle-tooltip-list">
              {resolvedList.map((resolvedVault, index) => (
                <div
                  key={`${resolvedVault.vault}-${index}`}
                  className="oracle-tooltip-item"
                >
                  <div className="oracle-tooltip-row">
                    <span className="oracle-tooltip-label">Step</span>
                    <span className="oracle-tooltip-value">Resolved vault</span>
                  </div>
                  <div className="oracle-tooltip-row">
                    <span className="oracle-tooltip-label">Vault</span>
                    <span className="oracle-tooltip-value">
                      {symbolForAddress(
                        resolvedVault.vault,
                        tokenSymbolMap,
                        addressLabels
                      )}
                    </span>
                  </div>
                  <div className="oracle-tooltip-row">
                    <span className="oracle-tooltip-label">Asset</span>
                    <span className="oracle-tooltip-value">
                      {symbolForAddress(
                        resolvedVault.asset,
                        tokenSymbolMap,
                        addressLabels
                      )}
                    </span>
                  </div>
                  <div className="oracle-tooltip-row">
                    <span className="oracle-tooltip-label">Quote</span>
                    <span className="oracle-tooltip-value">
                      {symbolForAddress(
                        resolvedVault.quote,
                        tokenSymbolMap,
                        addressLabels
                      )}
                    </span>
                  </div>
                  <div className="oracle-tooltip-row">
                    <span className="oracle-tooltip-label">Resolved Assets</span>
                    <span className="oracle-tooltip-value">
                      {resolvedVault.resolvedAssets.length > 0
                        ? resolvedVault.resolvedAssets
                            .map((asset) =>
                              symbolForAddress(
                                asset,
                                tokenSymbolMap,
                                addressLabels
                              )
                            )
                            .join(" -> ")
                        : "N/A"}
                    </span>
                  </div>
                </div>
              ))}
              {merged.map(({ adapter, metadata }, index) => {
                const label = providerLabel(adapter, metadata);
                const failedChecks = (metadata?.checks ?? []).filter(
                  (check) => check.pass === false
                );

                return (
                  <div
                    key={`${adapter.oracle}-${index}`}
                    className="oracle-tooltip-item"
                  >
                    <div className="oracle-tooltip-row">
                      <span className="oracle-tooltip-label">Base / Quote</span>
                      <span className="oracle-tooltip-value">
                        {symbolForAddress(adapter.base, tokenSymbolMap, addressLabels)} /{" "}
                        {symbolForAddress(adapter.quote, tokenSymbolMap, addressLabels)}
                      </span>
                    </div>
                    <div className="oracle-tooltip-row">
                      <span className="oracle-tooltip-label">Provider</span>
                      <span className="oracle-tooltip-value oracle-tooltip-provider">
                        <ProviderIcon provider={label} />
                        <span>{label}</span>
                      </span>
                    </div>
                    <div className="oracle-tooltip-row">
                      <span className="oracle-tooltip-label">Methodology</span>
                      <span className="oracle-tooltip-value">
                        {metadata?.methodology ?? "Unknown"}
                      </span>
                    </div>
                    <div className="oracle-tooltip-row">
                      <span className="oracle-tooltip-label">Checks</span>
                      <span className="oracle-tooltip-value">
                        {checksSummary(metadata)}
                      </span>
                    </div>
                    {failedChecks.map((check, checkIndex) => (
                      <div
                        key={`${check.id ?? "check"}-${checkIndex}`}
                        className="oracle-tooltip-row oracle-tooltip-row-check"
                      >
                        <span className="oracle-tooltip-label">
                          {check.id ?? "check"}
                        </span>
                        <span className="oracle-tooltip-value">
                          {String(check.message ?? "failed")}
                        </span>
                      </div>
                    ))}
                    <div className="oracle-tooltip-row">
                      <span className="oracle-tooltip-label">Address</span>
                      <span className="oracle-tooltip-value">
                        {adapter.oracle}
                      </span>
                    </div>
                    <div className="oracle-tooltip-row">
                      <span className="oracle-tooltip-label">Info</span>
                      <a
                        href={`https://oracles.euler.finance/${chainId}/adapter/${adapter.oracle}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="oracle-tooltip-link"
                      >
                        Open oracle details
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
