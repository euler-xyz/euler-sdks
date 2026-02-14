import { getAddress, isAddress } from "viem";
import { resolveChainId } from "../../../config/chains";
import { EulerEarnDetailPage } from "../../../pages/EulerEarnDetailPage";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{
    chainId: string;
    address: string;
  }>;
}

export default async function Page({ params }: PageProps) {
  const { chainId: rawChainId, address: rawAddress } = await params;
  const chainId = resolveChainId(rawChainId);

  if (!isAddress(rawAddress)) {
    return (
      <div className="error-message">Invalid vault address: {rawAddress}</div>
    );
  }

  const address = getAddress(rawAddress);
  return <EulerEarnDetailPage chainId={chainId} address={address} />;
}
