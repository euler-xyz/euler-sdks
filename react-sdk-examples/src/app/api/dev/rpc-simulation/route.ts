import { type NextRequest, NextResponse } from "next/server";
import {
  getSimulateRpcErrorsEnabled,
  setSimulateRpcErrorsEnabled,
  toggleSimulateRpcErrorsEnabled,
} from "../../../server/simulateRpcErrorsFlag";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function jsonWithNoStore(payload: unknown) {
  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

export async function GET() {
  return jsonWithNoStore({
    enabled: getSimulateRpcErrorsEnabled(),
  });
}

export async function POST(request: NextRequest) {
  let nextEnabled: boolean;

  try {
    const body = (await request.json().catch(() => null)) as {
      enabled?: unknown;
    } | null;

    if (typeof body?.enabled === "boolean") {
      nextEnabled = setSimulateRpcErrorsEnabled(body.enabled);
    } else {
      nextEnabled = toggleSimulateRpcErrorsEnabled();
    }
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to update RPC simulation flag",
        details: String(error),
      },
      { status: 500 },
    );
  }

  return jsonWithNoStore({
    enabled: nextEnabled,
  });
}
