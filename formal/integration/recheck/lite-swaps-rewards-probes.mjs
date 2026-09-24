// Offline probes against the installed SDK 3.3.0, whose JS was checked against
// the lockfile-integrity-verified published tarball by the parent review.
// Synthetic upstream/RPC responses; no wallet, browser, live API or transaction.
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const base = process.env.LITE_SDK_DIST ?? '/Users/kanv/Documents/euler/euler-lite/node_modules/@eulerxyz/euler-v2-sdk/dist/src';
const fromSdk = (path) => import(pathToFileURL(`${base}/${path}`));
const { MorphoPositionMigrationConnector } = await fromSdk('services/positionMigrationService/connectors/morpho/morphoConnector.js');
const { RewardsV3Adapter } = await fromSdk('services/rewardsService/adapters/rewardsV3Adapter/rewardsV3Adapter.js');
const { RewardsDirectAdapter } = await fromSdk('services/rewardsService/adapters/rewardsDirectAdapter/rewardsDirectAdapter.js');
const address = (n) => `0x${n.toString(16).padStart(40, '0')}`;
const results = [];
const connector = new MorphoPositionMigrationConnector({}, { getProvider: () => ({
  multicall: async () => [[0n, 500001n, 100n], [0n, 0n, 2n, 1000000n, 1n, 0n]],
}) }, {});
const position = await connector.getPosition({connectorId:'morpho', chainId:1, owner:address(1), positionRef:{loanToken:address(2), collateralToken:address(3), oracle:address(4), irm:address(5), lltv:800000000000000000n}});
assert.equal(position.debt.amount, 2n);
results.push({id:'S01', sdkDebt:String(position.debt.amount), canonicalMorphoDebt:'1', result:'published SDK arithmetic mismatch reproduced', liteCaveat:'Lite supplies its own borrowAmount from indexed debt, bypassing this default borrowing estimate.'});

const adapter = new RewardsV3Adapter({endpoint:'https://example.invalid'});
const offsets = [];
adapter.setQueryV3RewardsApyPage(async (_chain, offset) => {
  offsets.push(offset);
  if (offsets.length > 2) throw new Error('BOUNDED_REPEAT_SENTINEL');
  return { data:Array.from({length:100}, (_,i)=>({vault:address(i+10),campaigns:[]})), meta:{chainId:1} };
});
await assert.rejects(adapter.fetchChainRewards(1), /BOUNDED_REPEAT_SENTINEL/);
assert.deepEqual(offsets,[0,100,200]);
results.push({id:'S09', offsets, result:'published SDK repeats unpaginated 100-row response; probe stops third request', litePath:'server vault snapshot enables populateRewards, which uses chain-wide fetchChainRewards'});

const direct = new RewardsDirectAdapter({enableMerkl:false,enableBrevis:false,enableTurtle:false});
direct.setQueryFuulClaimableRewards(async () => [{user_address:address(1),currency_address:address(2),currency_chain_id:1,amount:'1000000',project_address:address(4),reason:1,token_id:0,deadline:'9999999999',proof:`0x${'01'.repeat(32)}`,signatures:[]}]);
const [reward] = await direct.fetchUserRewards(1,address(1));
assert.equal(reward.token.decimals,18);
assert.equal(reward.unclaimed,'1000000');
results.push({id:'S10', raw:reward.unclaimed, fabricatedDecimals:reward.token.decimals, displayIfTrusted:1e-12, actualTokensIfDecimals6:1, result:'published direct adapter fabricates 18 for missing metadata', liteCaveat:'Lite formatter trusts supplied decimals; tested adapter output, formatter consumption inspected in source, no actual live token asserted.'});
const output = {sdkVersion:'3.3.0', scope:'offline published-package regressions with synthetic responses, not browser or deployed incident reproduction', results};
await writeFile(new URL('./lite-swaps-rewards-probes.json',import.meta.url),JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify(output,null,2));
