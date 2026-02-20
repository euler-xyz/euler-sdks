import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { RPC_URLS, WAGMI_CHAINS } from "../config/chains.ts";

export const wagmiConfig = createConfig({
  chains: WAGMI_CHAINS,
  connectors: [injected()],
  transports: Object.fromEntries(
    WAGMI_CHAINS.map((chain) => [chain.id, http(RPC_URLS[chain.id])])
  ),
});
