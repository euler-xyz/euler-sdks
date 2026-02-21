import { decodeErrorResult, isHex, parseAbiItem, type Hex } from "viem";
import { EULER_ERROR_SELECTOR_TO_SIGNATURE, EULER_ERROR_SIGNATURES } from "./eulerErrorSelectors.js";

const FOURBYTE_LOOKUP_URL = "https://api.4byte.sourcify.dev/signature-database/v1/lookup?function=";
const HEX_PATTERN = /0x[0-9a-fA-F]{8,}/g;
const SELECTOR_WITH_PAYLOAD_PATTERN = /0x([0-9a-fA-F]{8})\s*[:|-]?\s*([0-9a-fA-F]{64,})/g;
const SIGNATURE_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*\([^()]*\)$/;
const BUILTIN_SELECTOR_TO_SIGNATURE: Record<string, string> = {
  "0x08c379a0": "Error(string)",
  "0x4e487b71": "Panic(uint256)",
};

const signatureByName = new Map<string, string[]>();
const selectorBySignature = new Map<string, string>();
for (const signature of EULER_ERROR_SIGNATURES) {
  const openParen = signature.indexOf("(");
  if (openParen === -1) continue;
  const name = signature.slice(0, openParen);
  const list = signatureByName.get(name) ?? [];
  list.push(signature);
  signatureByName.set(name, list);
}
for (const [selector, signature] of Object.entries(EULER_ERROR_SELECTOR_TO_SIGNATURE)) {
  selectorBySignature.set(signature, selector);
}
for (const [selector, signature] of Object.entries(BUILTIN_SELECTOR_TO_SIGNATURE)) {
  selectorBySignature.set(signature, selector);
}

const lookupCache = new Map<string, Promise<string[]>>();

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const normalizeHex = (value: string): Hex | null => {
  if (!value.startsWith("0x")) return null;
  const clean = value.toLowerCase();
  if (!isHex(clean, { strict: false })) return null;
  return (clean.length % 2 === 0 ? clean : clean.slice(0, clean.length - 1)) as Hex;
};

const extractHexStrings = (value: string): Hex[] => {
  const out = new Set<Hex>();
  const directMatches = value.match(HEX_PATTERN) ?? [];

  directMatches
    .map(normalizeHex)
    .filter((entry): entry is Hex => entry !== null)
    .forEach((entry) => out.add(entry));

  for (const match of value.matchAll(SELECTOR_WITH_PAYLOAD_PATTERN)) {
    const selector = match[1];
    const payload = match[2];
    const rebuilt = normalizeHex(`0x${selector}${payload}`);
    if (rebuilt) out.add(rebuilt);
  }

  return [...out];
};

const extractSignaturesDeep = (value: unknown, out: Set<string>) => {
  if (typeof value === "string") {
    if (SIGNATURE_PATTERN.test(value)) out.add(value);
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((entry) => extractSignaturesDeep(entry, out));
    return;
  }

  if (!value || typeof value !== "object") return;

  for (const entry of Object.values(value as Record<string, unknown>)) {
    extractSignaturesDeep(entry, out);
  }
};

const fetchSignaturesBySelector = (selector: string, fetchTimeout: number): Promise<string[]> => {
  const normalizedSelector = selector.toLowerCase();
  const cacheKey = `${normalizedSelector}:${fetchTimeout}`;
  const cached = lookupCache.get(cacheKey);
  if (cached) return cached;

  const request = (async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), fetchTimeout);
    try {
      const response = await fetch(`${FOURBYTE_LOOKUP_URL}${normalizedSelector}`, { signal: controller.signal });
      if (!response.ok) return [];

      const payload = await response.json();
      const signatures = new Set<string>();
      extractSignaturesDeep(payload, signatures);
      return [...signatures];
    }
    catch {
      return [];
    }
    finally {
      clearTimeout(timeoutId);
    }
  })();

  lookupCache.set(cacheKey, request);
  return request;
};

const collectCandidateStrings = (input: unknown): string[] => {
  if (typeof input === "string") return [input];
  if (!input || typeof input !== "object") return [];

  const candidates = new Set<string>();
  const visited = new Set<object>();

  const walk = (value: unknown) => {
    if (!value) return;

    if (typeof value === "string") return;

    if (typeof value !== "object") return;
    if (visited.has(value)) return;
    visited.add(value);

    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }

    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      const lowerKey = key.toLowerCase();
      const keyMatches = lowerKey.includes("error") || lowerKey.includes("message") || lowerKey.includes("reason");

      if (typeof child === "string") {
        if (keyMatches) {
          candidates.add(child);
        }
      }
      else {
        walk(child);
      }
    }
  };

  walk(input);
  return [...candidates];
};

const addKnownErrorsFromCandidate = (candidate: string, output: Set<string>) => {
  const lowered = candidate.toLowerCase();

  for (const signature of EULER_ERROR_SIGNATURES) {
    if (lowered.includes(signature.toLowerCase())) {
      output.add(signature);
    }
  }

  for (const [name, signatures] of signatureByName.entries()) {
    const regex = new RegExp(`(^|[^A-Za-z0-9_])${escapeRegex(name)}(\\(|[^A-Za-z0-9_]|$)`, "i");
    if (regex.test(candidate) || lowered.includes(name.toLowerCase())) {
      signatures.forEach((signature) => output.add(signature));
    }
  }
};

const collectHexFromDecoded = (value: unknown, output: Set<Hex>) => {
  if (typeof value === "string") {
    extractHexStrings(value).forEach((hex) => output.add(hex));
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((entry) => collectHexFromDecoded(entry, output));
    return;
  }

  if (!value || typeof value !== "object") return;

  for (const entry of Object.values(value as Record<string, unknown>)) {
    collectHexFromDecoded(entry, output);
  }
};

const tryDecodeWithSignature = (data: Hex, signature: string): unknown | null => {
  try {
    const abiError = parseAbiItem(`error ${signature}`);
    const decoded = decodeErrorResult({ abi: [abiError], data });
    return decoded;
  }
  catch {
    return null;
  }
};

export type DecodedSmartContractError = {
  signature: string;
  selector: string | null;
  params: unknown[];
};

export type DecodeSmartContractErrorsOptions = {
  /**
   * Timeout in milliseconds for unknown-selector signature lookup (OpenChain/Sourcify API).
   * Defaults to 2000ms.
   */
  fetchTimeout?: number;
};

const normalizeForKey = (value: unknown): unknown => {
  if (typeof value === "bigint") return `bigint:${value.toString()}`;
  if (Array.isArray(value)) return value.map((entry) => normalizeForKey(entry));
  if (!value || typeof value !== "object") return value;

  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, entry]) => [key, normalizeForKey(entry)]);
  return Object.fromEntries(entries);
};

export async function decodeSmartContractErrors(
  input: unknown,
  options: DecodeSmartContractErrorsOptions = {},
): Promise<DecodedSmartContractError[]> {
  console.log('input: ', input);
  const fetchTimeout = typeof options.fetchTimeout === "number" && options.fetchTimeout >= 0
    ? options.fetchTimeout
    : 5000;
  const results: DecodedSmartContractError[] = [];
  const seenResults = new Set<string>();
  const seenStrings = new Set<string>();
  const seenHex = new Set<string>();

  const addResult = (signature: string, selector: string | null, params: unknown[] = []) => {
    const key = JSON.stringify([signature, selector, normalizeForKey(params)]);
    if (seenResults.has(key)) return;
    seenResults.add(key);
    results.push({ signature, selector, params });
  };

  const addKnownErrorsFromCandidateToResults = (candidate: string) => {
    const signatures = new Set<string>();
    addKnownErrorsFromCandidate(candidate, signatures);
    signatures.forEach((signature) => addResult(signature, selectorBySignature.get(signature) ?? null, []));
  };

  const processCandidateString = async (candidate: string): Promise<void> => {
    if (seenStrings.has(candidate)) return;
    seenStrings.add(candidate);

    addKnownErrorsFromCandidateToResults(candidate);

    const hexValues = extractHexStrings(candidate);
    for (const hexValue of hexValues) {
      await processHexValue(hexValue);
    }
  };

  const processHexValue = async (hexValue: Hex): Promise<void> => {
    const normalizedHex = normalizeHex(hexValue);
    if (!normalizedHex || normalizedHex.length < 10) return;
    if (seenHex.has(normalizedHex)) return;
    seenHex.add(normalizedHex);

    const selector = normalizedHex.slice(0, 10) as Hex;
    const signatures = new Set<string>();

    const knownSignature = EULER_ERROR_SELECTOR_TO_SIGNATURE[selector as keyof typeof EULER_ERROR_SELECTOR_TO_SIGNATURE];
    if (knownSignature) signatures.add(knownSignature);
    const builtinSignature = BUILTIN_SELECTOR_TO_SIGNATURE[selector.toLowerCase()];
    if (builtinSignature) signatures.add(builtinSignature);

    if (!knownSignature && !builtinSignature) {
      const fetched = await fetchSignaturesBySelector(selector, fetchTimeout);
      fetched.forEach((signature) => signatures.add(signature));
    }

    for (const signature of signatures) {
      if (normalizedHex.length <= 10) {
        addResult(signature, selector, []);
        continue;
      }

      const decoded = tryDecodeWithSignature(normalizedHex, signature);
      if (!decoded) {
        addResult(signature, selector, []);
        continue;
      }

      const args = (decoded as { args?: unknown[] }).args;
      addResult(signature, selector, Array.isArray(args) ? args : []);

      const nestedStrings = new Set<string>();
      const collectStrings = (value: unknown) => {
        if (typeof value === "string") {
          nestedStrings.add(value);
          return;
        }
        if (Array.isArray(value)) {
          value.forEach(collectStrings);
          return;
        }
        if (!value || typeof value !== "object") return;
        Object.values(value as Record<string, unknown>).forEach(collectStrings);
      };
      collectStrings(decoded);
      for (const nestedString of nestedStrings) {
        await processCandidateString(nestedString);
      }

      const nestedHex = new Set<Hex>();
      collectHexFromDecoded(decoded, nestedHex);

      for (const nested of nestedHex) {
        await processHexValue(nested);
      }

      for (const entry of Object.values(decoded as Record<string, unknown>)) {
        if (typeof entry === "string") {
          await processCandidateString(entry);
        }
      }
    }
  };

  if (typeof input === "string") {
    const normalized = normalizeHex(input);
    if (normalized && normalized.length <= 10) {
      const selector = normalized.slice(0, 10) as Hex;
      const signatures = new Set<string>();
      const knownSignature = EULER_ERROR_SELECTOR_TO_SIGNATURE[
        selector as keyof typeof EULER_ERROR_SELECTOR_TO_SIGNATURE
      ];
      if (knownSignature) signatures.add(knownSignature);
      const builtinSignature = BUILTIN_SELECTOR_TO_SIGNATURE[selector.toLowerCase()];
      if (builtinSignature) signatures.add(builtinSignature);
      if (!knownSignature && !builtinSignature) {
        const fetched = await fetchSignaturesBySelector(selector, fetchTimeout);
        fetched.forEach((signature) => signatures.add(signature));
      }
      signatures.forEach((signature) => addResult(signature, selector, []));
      return results;
    }
  }

  const initialCandidates = collectCandidateStrings(input);
  console.log('initialCandidates: ', initialCandidates);
  for (const candidate of initialCandidates) {
    await processCandidateString(candidate);
  }

  const entriesWithParams = new Set(
    results
      .filter((entry) => entry.params.length > 0)
      .map((entry) => JSON.stringify([entry.signature, entry.selector])),
  );

  return results.filter((entry) => {
    if (entry.params.length > 0) return true;
    return !entriesWithParams.has(JSON.stringify([entry.signature, entry.selector]));
  });
}
