import { getAddress } from "viem";
import {
	applyBuildQuery,
	type BuildQueryFn,
	normalizeQueryKeySet,
	serializeQueryArgs,
} from "../../utils/buildQuery.js";
import type {
	ActivityCapabilities,
	ActivityCapabilityUnavailableReason,
	ActivityEventsPage,
	ActivityScope,
	ActivityScopeSupport,
	ActivityServiceConfig,
	FetchAccountActivityEventsArgs,
	FetchVaultActivityEventsArgs,
	IActivityAdapter,
	IActivityService,
} from "./activityServiceTypes.js";
import { ActivityV3Adapter } from "./adapters/activityV3Adapter.js";

const isActivityAdapter = (
	value: IActivityAdapter | ActivityServiceConfig,
): value is IActivityAdapter =>
	"getCapabilities" in value &&
	typeof value.getCapabilities === "function" &&
	"getScopeSupport" in value &&
	typeof value.getScopeSupport === "function" &&
	"fetchAccountActivityEvents" in value &&
	typeof value.fetchAccountActivityEvents === "function" &&
	"fetchVaultActivityEvents" in value &&
	typeof value.fetchVaultActivityEvents === "function";

export class ActivityUnavailableError extends Error {
	readonly code = "ACTIVITY_UNAVAILABLE";

	constructor(readonly reason: ActivityCapabilityUnavailableReason) {
		super(`Activity is unavailable: ${reason}`);
		this.name = "ActivityUnavailableError";
	}
}

export class UnavailableActivityAdapter implements IActivityAdapter {
	constructor(private readonly reason: ActivityCapabilityUnavailableReason) {}

	getCapabilities(): ActivityCapabilities {
		return {
			configured: false,
			adapter: null,
			canQueryAccount: false,
			requestableVaultTypes: [],
			reason: this.reason,
		};
	}

	getScopeSupport(_scope: ActivityScope): ActivityScopeSupport {
		return "unsupported";
	}

	async fetchAccountActivityEvents(
		_args: FetchAccountActivityEventsArgs,
	): Promise<ActivityEventsPage> {
		throw new ActivityUnavailableError(this.reason);
	}

	async fetchVaultActivityEvents(
		_args: FetchVaultActivityEventsArgs,
	): Promise<ActivityEventsPage> {
		throw new ActivityUnavailableError(this.reason);
	}
}

export class ActivityService implements IActivityService {
	private adapter: IActivityAdapter;

	constructor(
		adapterOrConfig: IActivityAdapter | ActivityServiceConfig,
		buildQuery?: BuildQueryFn,
	) {
		this.adapter = isActivityAdapter(adapterOrConfig)
			? adapterOrConfig
			: new ActivityV3Adapter(adapterOrConfig);
		if (buildQuery) applyBuildQuery(this, buildQuery);
	}

	getCapabilities(): ActivityCapabilities {
		return this.adapter.getCapabilities();
	}

	getScopeSupport(scope: ActivityScope): ActivityScopeSupport {
		return this.adapter.getScopeSupport(scope);
	}

	queryAccountActivityEvents = async (
		args: FetchAccountActivityEventsArgs,
	): Promise<ActivityEventsPage> =>
		this.adapter.fetchAccountActivityEvents(args);

	getQueryKeyAccountActivityEvents(
		args: FetchAccountActivityEventsArgs,
	): string | null {
		const chainIds = Array.isArray(args.chainId)
			? [...args.chainId]
			: [args.chainId];
		return serializeQueryArgs([
			{
				...args,
				owner: getAddress(args.owner),
				chainId: normalizeQueryKeySet(chainIds),
				categories:
					args.categories === undefined
						? undefined
						: normalizeQueryKeySet([...args.categories]),
				eventTypes:
					args.eventTypes === undefined
						? undefined
						: normalizeQueryKeySet(
								args.eventTypes.map((eventType) =>
									eventType.trim().toLowerCase(),
								),
							),
			},
		]);
	}

	queryVaultActivityEvents = async (
		args: FetchVaultActivityEventsArgs,
	): Promise<ActivityEventsPage> => this.adapter.fetchVaultActivityEvents(args);

	getQueryKeyVaultActivityEvents(
		args: FetchVaultActivityEventsArgs,
	): string | null {
		return serializeQueryArgs([
			{
				...args,
				vault: getAddress(args.vault),
				categories:
					args.categories === undefined
						? undefined
						: normalizeQueryKeySet([...args.categories]),
				eventTypes:
					args.eventTypes === undefined
						? undefined
						: normalizeQueryKeySet(
								args.eventTypes.map((eventType) =>
									eventType.trim().toLowerCase(),
								),
							),
			},
		]);
	}

	async fetchAccountActivityEvents(
		args: FetchAccountActivityEventsArgs,
	): Promise<ActivityEventsPage> {
		return this.queryAccountActivityEvents(args);
	}

	async fetchVaultActivityEvents(
		args: FetchVaultActivityEventsArgs,
	): Promise<ActivityEventsPage> {
		return this.queryVaultActivityEvents(args);
	}
}
