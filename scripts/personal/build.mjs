import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { verifyBuild } from "./verify-build.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
assert.equal(Number(process.versions.node.split(".")[0]), 24, "Use Node 24 for the personal build");
const pnpmPath = process.env.npm_execpath;
assert(pnpmPath && /pnpm/i.test(pnpmPath), "Run through pnpm run personal:build");
const version = process.env.npm_config_user_agent?.match(/^pnpm\/([^ ]+)/)?.[1];
assert.equal(`pnpm@${version}`, pkg.packageManager, `Use ${pkg.packageManager}, as pinned in package.json`);
function run(executable, args, options = {}) {
	const result = spawnSync(executable, args, { cwd: root, stdio: "inherit", ...options });
	if (result.error) throw result.error;
	assert.equal(result.status, 0, `${executable} failed (${result.status ?? result.signal})`);
	return result.stdout?.trim();
}
const capture = (exe, args) => run(exe, args, { stdio: ["ignore", "pipe", "inherit"], encoding: "utf8" });
const pnpm = (args) => /\.exe$/i.test(pnpmPath) ? run(pnpmPath, args) : run(process.execPath, [pnpmPath, ...args]);
assert.match(capture("wasm-pack", ["--version"]), /^wasm-pack 0\.13\.1$/, "Install wasm-pack 0.13.1 first");
const sysroot = capture("rustc", ["--print", "sysroot"]);
const commit = capture("rustc", ["--version", "--verbose"]).match(/^commit-hash: (\w+)$/m)?.[1];
assert(commit, "Could not read rustc commit");
const cargoHome = resolve(process.env.CARGO_HOME || join(homedir(), ".cargo"));
const flags = [
	`--remap-path-prefix=${root}=/bramble`,
	`--remap-path-prefix=${cargoHome}=/cargo`,
	`--remap-path-prefix=${join(sysroot, "lib/rustlib/src/rust")}=/rustc/${commit}`,
];
run("wasm-pack", ["build", "--target", "web", "--out-dir", "../platform-extension/public/wasm", "--", "--locked"], {
	cwd: join(root, "packages/core-rust"),
	env: { ...process.env, RUSTFLAGS: undefined, CARGO_ENCODED_RUSTFLAGS: flags.join("\x1f") },
});
pnpm(["run", "wasm:verify"]);
// Explicit environment prevents an inherited TARGET=firefox changing this build.
process.env.TARGET = "chromium";
pnpm(["run", "build"]);
const result = verifyBuild(join(root, "packages/platform-extension/dist-chromium"));
console.log(`Verified Chromium build: ${result.files.length} files. No release was published.`);
