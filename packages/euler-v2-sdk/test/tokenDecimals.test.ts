import { describe, expect, it, vi } from "vitest";
import { erc20Abi, getAddress, type Address, type PublicClient } from "viem";
import { TokenlistService, type ITokenlistService } from "../src/services/tokenlistService/index.js";
import type { IProviderService } from "../src/services/providerService/index.js";
import { buildEulerSDK } from "../src/sdk/buildSDK.js";
import { createQueryCacheBuildQuery } from "../src/utils/buildQuery.js";

const asset = "0x00000000000000000000000000000000000000ab" as Address;

function setup(readContract = vi.fn().mockResolvedValue(6)) {
	const getProvider = vi.fn(() => ({ readContract }) as unknown as PublicClient);
	const providers: IProviderService = { getProvider, getSupportedChainIds: () => [1, 2] };
	const service = new TokenlistService(
		{ getTokenListUrl: () => { throw new Error("Must not load the token list"); } },
		createQueryCacheBuildQuery({ ttlMs: 60_000, failureTtlMs: 60_000 }),
		providers,
	);
	return { service, readContract, getProvider };
}

describe("on-demand token decimals", () => {
	it("keeps existing list-only service overrides valid", () => {
		const legacyOverride: ITokenlistService = {
			loadTokenlist: async () => [],
			getToken: () => undefined,
			isLoaded: () => false,
		};
		expect(legacyOverride.resolveTokenDecimals).toBeUndefined();
	});

	it("uses the SDK provider without list loading or construction-time reads", async () => {
		const { getProvider, readContract } = setup();
		const sdk = await buildEulerSDK({ servicesOverrides: {
			providerService: { getProvider, getSupportedChainIds: () => [1] },
			deploymentService: { getDeploymentChainIds: () => [], getDeployment: () => { throw new Error("unused"); }, addDeployment: () => {} },
		} });
		expect(readContract).not.toHaveBeenCalled();
		await expect(sdk.tokenlistService.resolveTokenDecimals(1, asset)).resolves.toBe(6);
	});
	it.each([0, 6, 18, 255])("reads valid decimals %i directly without loading a list", async (decimals) => {
		const { service, readContract, getProvider } = setup(vi.fn().mockResolvedValue(decimals));
		await expect(service.resolveTokenDecimals(1, asset)).resolves.toBe(decimals);
		expect(getProvider).toHaveBeenCalledWith(1);
		expect(readContract).toHaveBeenCalledExactlyOnceWith({ address: getAddress(asset), abi: erc20Abi, functionName: "decimals" });
		expect(service.isLoaded(1)).toBe(false);
	});

	it.each([undefined, null, "6", 6n, NaN, Infinity, -1, 256, 1.5])("rejects malformed decimals %s and allows immediate retry", async (value) => {
		const { service, readContract } = setup(vi.fn().mockResolvedValueOnce(value).mockResolvedValue(6));
		await expect(service.resolveTokenDecimals(1, asset)).rejects.toThrow("Invalid ERC20 decimals");
		await expect(service.resolveTokenDecimals(1, asset)).resolves.toBe(6);
		expect(readContract).toHaveBeenCalledTimes(2);
	});

	it("propagates read failure without a fallback and allows immediate retry", async () => {
		const error = new Error("RPC unavailable");
		const { service, readContract } = setup(vi.fn().mockRejectedValueOnce(error).mockResolvedValue(0));
		await expect(service.resolveTokenDecimals(1, asset)).rejects.toBe(error);
		await expect(service.resolveTokenDecimals(1, asset)).resolves.toBe(0);
		expect(readContract).toHaveBeenCalledTimes(2);
	});

	it("deduplicates pending reads by normalized chain/address, not across chains", async () => {
		let finish!: (value: number) => void;
		const { service, readContract } = setup(vi.fn().mockImplementation(() => new Promise<number>((resolve) => { finish = resolve; })));
		const first = service.resolveTokenDecimals(1, asset);
		const same = service.resolveTokenDecimals(1, getAddress(asset));
		await vi.waitFor(() => expect(readContract).toHaveBeenCalledTimes(1));
		const finishFirst = finish;
		const other = service.resolveTokenDecimals(2, asset);
		await vi.waitFor(() => expect(readContract).toHaveBeenCalledTimes(2));
		finishFirst(6);
		finish(18);
		expect(await Promise.all([first, same, other])).toEqual([6, 6, 18]);
	});

	it("reads again after completion even with the SDK query cache enabled", async () => {
		const { service, readContract } = setup(vi.fn().mockResolvedValueOnce(6).mockResolvedValue(8));
		await expect(service.resolveTokenDecimals(1, asset)).resolves.toBe(6);
		await expect(service.resolveTokenDecimals(1, asset)).resolves.toBe(8);
		expect(readContract).toHaveBeenCalledTimes(2);
	});

	it("fails closed when constructed without a provider", async () => {
		const service = new TokenlistService({ getTokenListUrl: () => "unused" });
		await expect(service.resolveTokenDecimals(1, asset)).rejects.toThrow("provider");
	});
});
