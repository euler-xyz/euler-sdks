import { type NextRequest, NextResponse } from "next/server";
import { resolveChainId } from "../../config/chains";
import { getVaultTableData } from "../../server/vaultsData";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const chainId = resolveChainId(
    request.nextUrl.searchParams.get("chainId") ?? undefined,
  );

  try {
    const data = await getVaultTableData(chainId);
    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to load vault table",
        details: String(error),
      },
      { status: 500 },
    );
  }
}
