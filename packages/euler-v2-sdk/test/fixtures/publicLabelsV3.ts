import type { PublicLabelsSource } from "../../src/services/eulerLabelsService/publicLabelsV3Types.js";

export const PUBLIC_LABELS_FIXTURE_VERSION = "v20260804151305236";
export const KPK = "kpk";
export const SECURITIZE = "securitize";
export const KPK_VAULT = "0x2Ff596321782FE034102f55af5ad707A4Ce0d6a7";
export const ASSESSMENT_ONLY_EVK =
	"0x00000000000000000000000000000000000000A1";
export const NEUTRAL_ESCROW =
	"0x00000000000000000000000000000000000000E5";
export const KPK_GOVERNOR =
	"0x1572063377a9a4f8065BD7bA0D7fa135cd13051F";

export const publicLabelsFixture: PublicLabelsSource = {
	products: [
		{
			id: "kpk-securitize",
			chainId: 1,
			entityId: KPK,
			coBrandEntityIds: [SECURITIZE],
			name: "KPK x Securitize RWA Markets",
			logo: null,
			description: "Curated by KPK and co-branded with Securitize.",
			url: "https://kpk.io/vaults",
			portfolioNotice: null,
			isDeprecated: false,
			deprecationReason: null,
			governanceMode: "unknown",
			createdAt: "2026-08-04T13:25:58.430Z",
			updatedAt: "2026-08-04T13:25:58.430Z",
		},
	],
	vaults: [
		{
			chainId: 1,
			address: KPK_VAULT,
			vaultType: "evk",
			productId: "kpk-securitize",
			entityId: KPK,
			name: "KPK VBILL/USDC Lend",
			description: "USDC lending vault for the KPK VBILL market.",
			portfolioNotice: null,
			isDeprecated: false,
			deprecationReason: null,
			tags: ["recently added", "suppress high utilisation warning"],
			campaigns: [
				{
					name: "KPK RWA points",
					logo: "https://token-images.euler.finance/labels/kpk",
					type: "deposit",
				},
			],
			createdAt: "2026-07-31T14:48:35.257Z",
			updatedAt: "2026-08-04T13:25:58.430Z",
		},
		{
			chainId: 1,
			address: ASSESSMENT_ONLY_EVK,
			vaultType: "evk",
			productId: null,
			entityId: null,
			name: null,
			description: null,
			portfolioNotice: null,
			isDeprecated: false,
			deprecationReason: null,
			tags: [],
			campaigns: null,
			createdAt: "2026-07-31T14:48:35.257Z",
			updatedAt: "2026-07-31T14:48:35.257Z",
		},
		{
			chainId: 1,
			address: NEUTRAL_ESCROW,
			vaultType: "escrow",
			productId: null,
			entityId: null,
			name: null,
			description: null,
			portfolioNotice: null,
			isDeprecated: false,
			deprecationReason: null,
			tags: [],
			campaigns: null,
			createdAt: "2026-07-31T14:48:35.257Z",
			updatedAt: "2026-08-04T13:25:58.430Z",
		},
	],
	entities: [
		{
			id: KPK,
			name: "KPK",
			logo: "https://token-images.euler.finance/labels/kpk",
			description: "KPK is a third-party curator.",
			url: "https://kpk.io/",
			socialTwitter: "https://x.com/kpk_io",
			socialYoutube: null,
			socialDiscord: null,
			socialTelegram: null,
			socialGithub: "https://github.com/karpatkey",
			socialDefillama: null,
			legalEntityName: null,
			riskMethodology: null,
			security: null,
			termsOfService: null,
			licenses: null,
			disclaimers: null,
			createdAt: "2026-08-04T13:25:58.430Z",
			updatedAt: "2026-08-04T13:25:58.430Z",
		},
		{
			id: SECURITIZE,
			name: "Securitize",
			logo: "https://token-images.euler.finance/labels/securitize",
			description: "Securitize is a tokenisation platform.",
			url: "https://securitize.io/",
			socialTwitter: "https://x.com/Securitize",
			socialYoutube: null,
			socialDiscord: null,
			socialTelegram: null,
			socialGithub: null,
			socialDefillama: null,
			legalEntityName: null,
			riskMethodology: null,
			security: null,
			termsOfService: null,
			licenses: null,
			disclaimers: null,
			createdAt: "2026-08-04T13:25:58.430Z",
			updatedAt: "2026-08-04T13:25:58.430Z",
		},
	],
	entityAddresses: [
		{
			entityId: KPK,
			chainId: 1,
			address: KPK_GOVERNOR,
			label: "KPK Euler RWA Curation Safe",
		},
	],
	geoPolicies: [
		{
			id: "raw-kpk-policy",
			chainId: 1,
			productId: "kpk-securitize",
			vaultAddress: null,
			assetAddress: null,
			countries: ["DE"],
			policyType: "block",
			reason: "Raw fixture policy",
			createdAt: "2026-08-04T13:25:58.430Z",
		},
	],
};
