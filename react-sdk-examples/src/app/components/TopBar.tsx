"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { isSupportedChainId } from "../config/chains";
import { useSDK } from "../context/SdkContext";

export function TopBar() {
  const { chainId, setChainId, chainNames } = useSDK();
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!(pathname === "/" || pathname.startsWith("/vaults"))) return;

    const rawChainId = searchParams.get("chainId");
    if (!rawChainId) return;

    const parsedChainId = Number(rawChainId);
    if (!isSupportedChainId(parsedChainId)) return;
    if (parsedChainId === chainId) return;

    setChainId(parsedChainId);
  }, [pathname, searchParams, chainId, setChainId]);

  const pushVaults = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("chainId", String(chainId));
    router.push(`/vaults?${params.toString()}`);
  };

  const isVaults =
    pathname === "/" ||
    pathname.startsWith("/vaults") ||
    pathname.startsWith("/vault/");
  const isPortfolio = pathname.startsWith("/portfolio");

  return (
    <div className="topbar">
      <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
        <h1 style={{ cursor: "pointer" }} onClick={pushVaults}>
          Euler V2 Explorer
        </h1>
        <nav className="topbar-nav">
          <button
            className={`nav-link ${isVaults ? "active" : ""}`}
            onClick={pushVaults}
          >
            Vaults
          </button>
          <button
            className={`nav-link ${isPortfolio ? "active" : ""}`}
            onClick={() => router.push("/portfolio")}
          >
            Portfolio
          </button>
        </nav>
      </div>
      <div>
        <label>
          Chain:{" "}
          <select
            value={chainId}
            onChange={(e) => {
              const nextChainId = Number(e.target.value);
              setChainId(nextChainId);

              if (pathname === "/" || pathname.startsWith("/vaults")) {
                const params = new URLSearchParams(searchParams.toString());
                params.set("chainId", String(nextChainId));
                router.replace(`/vaults?${params.toString()}`);
              }
            }}
          >
            {Object.entries(chainNames).map(([id, name]) => (
              <option key={id} value={id}>
                {name} ({id})
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}
