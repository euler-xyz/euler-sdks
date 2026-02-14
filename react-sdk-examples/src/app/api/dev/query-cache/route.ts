import { NextResponse } from "next/server";
import { getServerQueryClient } from "../../../server/queryClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

function toSerializable(
  value: unknown,
  seen = new WeakSet<object>(),
): JsonValue {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  if (typeof value === "number")
    return Number.isFinite(value) ? value : String(value);
  if (typeof value === "boolean") return value;
  if (typeof value === "bigint") return `bigint:${value.toString()}`;
  if (typeof value === "symbol") return String(value);
  if (typeof value === "function") return "[function]";

  if (value instanceof Date) return value.toISOString();

  if (Array.isArray(value)) {
    return value.map((item) => toSerializable(item, seen));
  }

  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (seen.has(obj)) return "[circular]";
    seen.add(obj);

    const out: Record<string, JsonValue> = {};
    for (const [key, nestedValue] of Object.entries(obj)) {
      out[key] = toSerializable(nestedValue, seen);
    }
    return out;
  }

  return String(value);
}

export async function GET() {
  const queryClient = getServerQueryClient();
  const queries = queryClient.getQueryCache().getAll();

  const payload = {
    count: queries.length,
    queries: queries.map((query) => ({
      queryKey: toSerializable(query.queryKey),
      queryHash: query.queryHash,
      state: {
        status: query.state.status,
        fetchStatus: query.state.fetchStatus,
        isInvalidated: query.state.isInvalidated,
        dataUpdateCount: query.state.dataUpdateCount,
        dataUpdatedAt: query.state.dataUpdatedAt,
        errorUpdateCount: query.state.errorUpdateCount,
        errorUpdatedAt: query.state.errorUpdatedAt,
      },
      data: toSerializable(query.state.data),
      error: toSerializable(query.state.error),
    })),
    generatedAt: new Date().toISOString(),
  };

  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
