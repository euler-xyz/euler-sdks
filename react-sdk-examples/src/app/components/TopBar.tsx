"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useEffect } from "react"
import { isSupportedChainId } from "../config/chains"
import { useSDK } from "../context/SdkContext"
import { setClientSimulateRpcErrorsEnabled } from "../dev/simulateRpcErrors"

export function TopBar() {
  const { chainId, setChainId, chainNames } = useSDK()
  const queryClient = useQueryClient()
  const router = useRouter()
  const pathname = usePathname() ?? ""
  const searchParams = useSearchParams()

  useEffect(() => {
    if (!(pathname === "/" || pathname.startsWith("/vaults"))) return

    const rawChainId = searchParams.get("chainId")
    if (!rawChainId) return

    const parsedChainId = Number(rawChainId)
    if (!isSupportedChainId(parsedChainId)) return
    if (parsedChainId === chainId) return

    setChainId(parsedChainId)
  }, [pathname, searchParams, chainId, setChainId])

  const simulateRpcErrorsQuery = useQuery({
    queryKey: ["dev", "rpc-simulation"],
    queryFn: async () => {
      const response = await fetch("/api/dev/rpc-simulation", {
        method: "GET",
        cache: "no-store",
      })
      if (!response.ok) throw new Error(`Failed to read flag (${response.status})`)
      const payload = (await response.json()) as { enabled?: boolean }
      return !!payload.enabled
    },
    refetchOnWindowFocus: false,
    retry: 1,
  })

  useEffect(() => {
    if (typeof simulateRpcErrorsQuery.data !== "boolean") return
    setClientSimulateRpcErrorsEnabled(simulateRpcErrorsQuery.data)
  }, [simulateRpcErrorsQuery.data])

  const pushVaults = () => {
    const params = new URLSearchParams(searchParams.toString())
    params.set("chainId", String(chainId))
    router.push(`/vaults?${params.toString()}`)
  }

  const isVaults =
    pathname === "/" || pathname.startsWith("/vaults") || pathname.startsWith("/vault/")
  const isPortfolio = pathname.startsWith("/portfolio")
  const simulateRpcErrors = simulateRpcErrorsQuery.data ?? false
  const simulateRpcErrorsReady = simulateRpcErrorsQuery.isFetched

  const toggleRpcSimulationMutation = useMutation({
    mutationFn: async (nextEnabled: boolean) => {
      const response = await fetch("/api/dev/rpc-simulation", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ enabled: nextEnabled }),
      })
      if (!response.ok) {
        throw new Error(`Failed to update flag (${response.status})`)
      }
      const payload = (await response.json()) as { enabled?: boolean }
      return !!payload.enabled
    },
    onSuccess: (nextEnabled) => {
      queryClient.setQueryData(["dev", "rpc-simulation"], nextEnabled)
      setClientSimulateRpcErrorsEnabled(nextEnabled)
      router.refresh()
    },
  })

  const toggleRpcSimulation = () => {
    if (!simulateRpcErrorsReady || toggleRpcSimulationMutation.isPending) return
    toggleRpcSimulationMutation.mutate(!simulateRpcErrors)
  }

  return (
    <div className="topbar">
      <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
        <button type="button" className="topbar-title" onClick={pushVaults}>
          Euler V2 Explorer
        </button>
        <nav className="topbar-nav">
          <button
            className={`nav-link ${isVaults ? "active" : ""}`}
            onClick={pushVaults}
            type="button"
          >
            Vaults
          </button>
          <button
            className={`nav-link ${isPortfolio ? "active" : ""}`}
            onClick={() => router.push("/portfolio")}
            type="button"
          >
            Portfolio
          </button>
        </nav>
      </div>
      <div className="topbar-right">
        <button
          className={`rpc-toggle ${simulateRpcErrors ? "active" : ""}`}
          onClick={toggleRpcSimulation}
          disabled={!simulateRpcErrorsReady || toggleRpcSimulationMutation.isPending}
          type="button"
        >
          {simulateRpcErrorsReady
            ? `Simulate RPC errors: ${simulateRpcErrors ? "ON" : "OFF"}`
            : "Simulate RPC errors: ..."}
        </button>
        <label>
          Chain:{" "}
          <select
            value={chainId}
            onChange={(e) => {
              const nextChainId = Number(e.target.value)
              setChainId(nextChainId)

              if (pathname === "/" || pathname.startsWith("/vaults")) {
                const params = new URLSearchParams(searchParams.toString())
                params.set("chainId", String(nextChainId))
                router.replace(`/vaults?${params.toString()}`)
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
  )
}
