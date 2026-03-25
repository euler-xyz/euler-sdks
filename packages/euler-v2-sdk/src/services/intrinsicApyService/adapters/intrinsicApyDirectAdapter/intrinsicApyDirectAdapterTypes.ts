import type { IntrinsicApyInfo } from "../../intrinsicApyService.js";

export interface IntrinsicApyDirectAdapterConfig {
	defillamaYieldsUrl?: string;
	pendleApiUrl?: string;
	stablewatchPoolsUrl?: string;
	stablewatchSourceUrl?: string;
}

export interface DefiLlamaPool {
	pool?: string;
	project?: string;
	apy?: number | null;
	apyMean30d?: number | null;
}

export interface PendleMarketData {
	impliedApy?: number;
	timestamp?: string;
}

export interface StablewatchPool {
	metrics?: {
		apy?: {
			avg7d?: number | string;
		};
	};
	token?: {
		chains?: Record<string, string[]>;
	};
}

export interface StablewatchResponse {
	data?: StablewatchPool[];
}

export interface IntrinsicApyResult {
	address: string;
	info: IntrinsicApyInfo;
}
