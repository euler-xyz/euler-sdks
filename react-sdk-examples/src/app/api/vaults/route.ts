import { type NextRequest, NextResponse } from "next/server";
import { resolveChainId } from "../../config/chains";
import {
  getVaultTableData,
  parseVaultTableQuery,
} from "../../server/vaultsData";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const chainId = resolveChainId(
    request.nextUrl.searchParams.get("chainId") ?? undefined,
  );
  const query = parseVaultTableQuery({
    tab: request.nextUrl.searchParams.get("tab") ?? undefined,
    page: request.nextUrl.searchParams.get("page") ?? undefined,
    pageSize: request.nextUrl.searchParams.get("pageSize") ?? undefined,
    q: request.nextUrl.searchParams.get("q") ?? undefined,
    sortBy: request.nextUrl.searchParams.get("sortBy") ?? undefined,
    sortDir: request.nextUrl.searchParams.get("sortDir") ?? undefined,
  });

  try {
    const data = await getVaultTableData(chainId, query);
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
