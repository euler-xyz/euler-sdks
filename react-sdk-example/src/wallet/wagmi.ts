import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import type { Chain } from "viem";
import { RPC_URLS, WAGMI_CHAINS } from "../config/chains.ts";

const chains = WAGMI_CHAINS as [Chain, ...Chain[]];

export const wagmiConfig = createConfig({
  chains,
  connectors: [injected({ target: "rabby", shimDisconnect: true })],
  transports: Object.fromEntries(
    chains.map((chain) => [chain.id, http(RPC_URLS[chain.id])])
  ),
});
