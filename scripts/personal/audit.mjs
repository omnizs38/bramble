import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
// Audit the installed lockfile; never use --fix, suppress advisories, or ignore registry errors.
const pnpm = process.env.npm_execpath;
assert(pnpm && /pnpm/i.test(pnpm), "Run through pnpm run personal:audit");
mkdirSync("personal-reports", { recursive: true });
for (const prod of [false, true]) {
	const args = ["audit", "--json", ...(prod ? ["--prod"] : [])];
	const result = spawnSync(/\.exe$/i.test(pnpm) ? pnpm : process.execPath, /\.exe$/i.test(pnpm) ? args : [pnpm, ...args], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
	if (result.error) throw result.error;
	assert(result.status === 0 || result.status === 1, `Audit process failed: ${result.stderr}`);
	const data = JSON.parse(result.stdout);
	assert(!data.error && data.metadata?.vulnerabilities, `Registry audit failed: ${result.stdout}`);
	writeFileSync(resolve("personal-reports", prod ? "npm-production.json" : "npm-workspace.json"), JSON.stringify(data, null, 2));
	const v = data.metadata.vulnerabilities;
	console.log(`${prod ? "Production" : "Whole workspace (including tools)"}: ${JSON.stringify(v)}`);
	if (prod && Object.values(v).some(n => n > 0)) throw new Error("Known production dependency advisory: build blocked. Review npm-production.json.");
	if (!prod && Object.values(v).some(n => n > 0)) console.warn("Workspace tool advisories remain. See npm-workspace.json; no exceptions or fixes were applied.");
}
