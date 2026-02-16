import { NextResponse } from "next/server"
import { getVaultsSnapshotCronStatus } from "../../../server/vaultsData"

export const dynamic = "force-dynamic"
export const revalidate = 0
export const runtime = "nodejs"

function jsonWithNoStore(payload: unknown) {
  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": "no-store",
    },
  })
}

export async function GET() {
  try {
    return jsonWithNoStore(getVaultsSnapshotCronStatus())
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to read vaults cron status",
        details: String(error),
      },
      { status: 500 },
    )
  }
}
