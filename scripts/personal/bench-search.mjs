import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { filterEntries, sortEntries } from "../../packages/core/src/app/screens/VaultHome/vault-search.ts";

// Synthetic data only. Measures list work for a typing sequence, not browser RAM or startup.
const items = Array.from({ length: 10000 }, (_, i) => ({
	id: String(i), name: `Account ${10000 - i}`, type: "login", searchText: `account ${i} work`, archived: false,
}));
const queries = ["a", "ac", "acc", "acco", "accou", "accoun", "account", "account 1"];
const request = q => ({ q, type: "all", sort: "name-asc", archived: false });
const oldTyping = () => queries.map(q => filterEntries(items, request(q)).sort((a,b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" })));
const newTyping = () => { const ordered = sortEntries(items, "name-asc"); return queries.map(q => filterEntries(ordered, request(q))); };
assert.deepEqual(newTyping().map(rows => rows.map(row => row.id)), oldTyping().map(rows => rows.map(row => row.id)));
const timings = { legacy_ms: [], personal_ms: [] };
for (let i = 0; i < 5; i++) {
	const cases = i % 2 ? [["personal_ms", newTyping], ["legacy_ms", oldTyping]] : [["legacy_ms", oldTyping], ["personal_ms", newTyping]];
	for (const [key, fn] of cases) { const start = performance.now(); fn(); timings[key].push(performance.now() - start); }
}
console.log(JSON.stringify({ benchmark: "synthetic vault list typing", rows: items.length, queries, trials: 5, node: process.version, platform: process.platform, timings, limitations: ["Not a browser startup, autofill, or RAM benchmark", "Includes initial personal sorting; later query changes reuse that ordering", "No actual credentials or vault data"] }, null, 2));
