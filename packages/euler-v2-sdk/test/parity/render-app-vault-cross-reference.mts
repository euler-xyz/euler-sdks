import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

type Issue = {
	field: string;
	app: unknown;
	sdk: unknown;
	pctDiff?: number;
	kind?: string;
	display?: {
		app?: string;
		sdk?: string;
	};
};

type VaultRow = {
	chainId: number;
	address: string;
	status: "match" | "diff" | "missing_in_sdk";
	issues: Issue[];
};

type SummarySide = {
	appVaults: number;
	sdkMatches: number;
	missingInSdk: number;
	vaultsWithDiffs: number;
	fieldDiffs: Record<string, number>;
};

type Report = {
	generatedAt: string;
	adapterMode: string;
	classic: VaultRow[];
	earn: VaultRow[];
	summary: {
		classic: SummarySide;
		earn: SummarySide;
	};
};

const CHAIN_NAMES: Record<number, string> = {
	1: "Ethereum",
	56: "BNB Chain",
	130: "Unichain",
	143: "Monad",
	146: "Sonic",
	239: "TAC",
	1923: "Swell",
	8453: "Base",
	9745: "Plasma",
	42161: "Arbitrum",
	43114: "Avalanche",
	59144: "Linea",
	60808: "BOB",
	80094: "Berachain",
};

const ROOT = resolve(import.meta.dirname);

async function readReport(path: string): Promise<Report> {
	return JSON.parse(await readFile(path, "utf8")) as Report;
}

function formatDate(iso: string): string {
	return iso.slice(0, 10);
}

function formatValue(value: unknown): string {
	if (value === null || value === undefined) return "`null`";
	if (typeof value === "string") return `\`${value}\``;
	if (typeof value === "number") return `\`${value}\``;
	if (typeof value === "boolean") return `\`${String(value)}\``;
	return `\`${JSON.stringify(value)}\``;
}

function topFieldDiffs(summary: SummarySide, limit = 8): Array<[string, number]> {
	return Object.entries(summary.fieldDiffs)
		.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
		.slice(0, limit);
}

function byChain(rows: VaultRow[]): Array<{
	chainId: number;
	chainName: string;
		app: number;
	missing: number;
	diff: number;
}> {
	const map = new Map<number, { app: number; missing: number; diff: number }>();
	for (const row of rows) {
		const entry = map.get(row.chainId) ?? { app: 0, missing: 0, diff: 0 };
		entry.app += 1;
		if (row.status === "missing_in_sdk") entry.missing += 1;
		if (row.status === "diff") entry.diff += 1;
		map.set(row.chainId, entry);
	}

	return [...map.entries()]
		.map(([chainId, entry]) => ({
			chainId,
			chainName: CHAIN_NAMES[chainId] ?? String(chainId),
			...entry,
		}))
		.sort((a, b) => a.chainId - b.chainId);
}

function coverageTable(rows: VaultRow[]): string {
	const lines = [
		"| Chain | Chain ID | App vaults | Missing in SDK | Matched address but field diffs |",
		"| --- | ---: | ---: | ---: | ---: |",
	];

	for (const row of byChain(rows)) {
		lines.push(
			`| ${row.chainName} | ${row.chainId} | ${row.app} | ${row.missing} | ${row.diff} |`,
		);
	}

	return lines.join("\n");
}

function bulletList(entries: Array<[string, number]>): string {
	return entries.map(([field, count]) => `- \`${field}\`: \`${count}\``).join("\n");
}

function sampleMissing(rows: VaultRow[], limit = 5): string {
	const lines = rows
		.filter((row) => row.status === "missing_in_sdk")
		.slice(0, limit)
		.map(
			(row) =>
				`- ${CHAIN_NAMES[row.chainId] ?? row.chainId}: \`${row.address}\``,
		);
	return lines.length > 0 ? lines.join("\n") : "- none";
}

function sampleDiffs(rows: VaultRow[], limit = 5): string {
	const lines = rows
		.filter((row) => row.status === "diff" && row.issues.length > 0)
		.slice(0, limit)
		.map((row) => {
			const issue = row.issues[0]!;
			return `- \`${row.address}\` on ${CHAIN_NAMES[row.chainId] ?? row.chainId}: \`${issue.field}\` app ${formatValue(issue.app)} vs SDK ${formatValue(issue.sdk)}`;
		});
	return lines.length > 0 ? lines.join("\n") : "- none";
}

function reportHeader(title: string, report: Report): string {
	return `# ${title}

Generated on ${formatDate(report.generatedAt)} from \`${report.adapterMode}\` parity output.
`;
}

function renderCrossReference(title: string, report: Report): string {
	return `${reportHeader(title, report)}

## Coverage summary

### Classic / EVault

${coverageTable(report.classic)}

Classic totals:

- App-visible classic vaults: \`${report.summary.classic.appVaults}\`
- Missing in SDK \`fetchAllVaults\`: \`${report.summary.classic.missingInSdk}\`
- Address matches with >1% field diffs: \`${report.summary.classic.vaultsWithDiffs}\`

Top classic mismatch counts:

${bulletList(topFieldDiffs(report.summary.classic))}

Representative missing classic vaults:

${sampleMissing(report.classic)}

Representative classic diffs:

${sampleDiffs(report.classic)}

### Earn

${coverageTable(report.earn)}

Earn totals:

- App-visible earn vaults: \`${report.summary.earn.appVaults}\`
- Missing in SDK \`fetchAllVaults\`: \`${report.summary.earn.missingInSdk}\`
- Address matches with >1% field diffs: \`${report.summary.earn.vaultsWithDiffs}\`

Top earn mismatch counts:

${bulletList(topFieldDiffs(report.summary.earn))}

Representative missing earn vaults:

${sampleMissing(report.earn)}

Representative earn diffs:

${sampleDiffs(report.earn)}
`;
}

function renderOnchainCrossReference(report: Report, baseline: Report): string {
	return `${renderCrossReference("SDK vs App Vault Cross-Reference (Onchain Adapters)", report)}

## Comparison to V3

- Classic missing vaults: \`${baseline.summary.classic.missingInSdk}\` -> \`${report.summary.classic.missingInSdk}\`
- Earn missing vaults: \`${baseline.summary.earn.missingInSdk}\` -> \`${report.summary.earn.missingInSdk}\`
- Classic diff vaults: \`${baseline.summary.classic.vaultsWithDiffs}\` -> \`${report.summary.classic.vaultsWithDiffs}\`
- Earn diff vaults: \`${baseline.summary.earn.vaultsWithDiffs}\` -> \`${report.summary.earn.vaultsWithDiffs}\`
`;
}

function renderMainnetCrossReference(report: Report): string {
	return `${reportHeader(
		"SDK vs App Vault Cross-Reference (Onchain Adapters, Mainnet Only)",
		report,
	)}

## Coverage summary

### Classic / EVault

- App-visible vaults: \`${report.summary.classic.appVaults}\`
- SDK address matches: \`${report.summary.classic.sdkMatches}\`
- Missing in SDK \`fetchAllVaults\`: \`${report.summary.classic.missingInSdk}\`
- Address matches with >1% field diffs: \`${report.summary.classic.vaultsWithDiffs}\`

Top classic mismatch counts:

${bulletList(topFieldDiffs(report.summary.classic))}

Representative classic diffs:

${sampleDiffs(report.classic)}

### Earn

- App-visible vaults: \`${report.summary.earn.appVaults}\`
- SDK address matches: \`${report.summary.earn.sdkMatches}\`
- Missing in SDK \`fetchAllVaults\`: \`${report.summary.earn.missingInSdk}\`
- Address matches with >1% field diffs: \`${report.summary.earn.vaultsWithDiffs}\`

Top earn mismatch counts:

${bulletList(topFieldDiffs(report.summary.earn))}

Representative earn diffs:

${sampleDiffs(report.earn)}
`;
}

function renderMissingIntrinsic(report: Report): string {
	const rows = report.classic
		.filter(
			(row) =>
				row.chainId === 1 &&
				row.status === "diff" &&
				row.issues.some(
					(issue) => issue.field === "intrinsicApy" && issue.sdk === null,
				),
		)
		.map((row) => {
			const issue = row.issues.find((entry) => entry.field === "intrinsicApy")!;
			return { address: row.address, app: issue.app };
		});

	const lines = rows.map(
		(row) => `| \`${row.address}\` | \`${String(row.app)}\` |`,
	);

	return `# Mainnet Classic Vaults Missing SDK Intrinsic APY (V3 Adapter)

Generated on ${formatDate(report.generatedAt)} from the V3 parity run.

Total: \`${rows.length}\`

| Vault | App Intrinsic APY |
| --- | ---: |
${lines.join("\n")}
`;
}

async function main() {
	const v3 = await readReport("/tmp/euler-sdk-parity/v3.json");
	const onchain = await readReport("/tmp/euler-sdk-parity/onchain.json");
	const onchainMainnet = await readReport("/tmp/euler-sdk-parity/onchain-mainnet.json");

	await writeFile(
		resolve(ROOT, "app-vault-cross-reference.md"),
		renderCrossReference("SDK vs App Vault Cross-Reference", v3),
	);
	await writeFile(
		resolve(ROOT, "app-vault-cross-reference-onchain.md"),
		renderOnchainCrossReference(onchain, v3),
	);
	await writeFile(
		resolve(ROOT, "app-vault-cross-reference-onchain-mainnet.md"),
		renderMainnetCrossReference(onchainMainnet),
	);
	await writeFile(
		resolve(ROOT, "mainnet-missing-intrinsic-apys-v3.md"),
		renderMissingIntrinsic(v3),
	);
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
