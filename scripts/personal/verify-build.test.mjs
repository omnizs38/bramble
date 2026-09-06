import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { verifyBuild, verifyManifest } from "./verify-build.mjs";
const original = JSON.parse(readFileSync(new URL("../../packages/manifests/chromium/manifest.json", import.meta.url)));
const clone = () => structuredClone(original);
test("current MV3 permissions and CSP are accepted", () => verifyManifest(clone()));
for (const [name, change] of [
	["new permission", m => m.permissions.push("debugger")],
	["permanent native messaging", m => m.permissions.push("nativeMessaging")],
	["remote scripts", m => m.content_security_policy.extension_pages += " https://example.invalid"],
	["exposed WASM", m => m.web_accessible_resources[0].resources.push("wasm/*")],
	["update endpoint", m => m.update_url = "https://example.invalid/update"],
	["Firefox background", m => m.background = { scripts: ["background.js"] }],
]) test(`rejects ${name}`, () => { const m = clone(); change(m); assert.throws(() => verifyManifest(m)); });
function fixture(fn) {
	const root = mkdtempSync(join(tmpdir(), "bramble-build-test-"));
	try {
		for (const file of ["background.js", "content-script.js", "popup.html", "options.html", "offscreen.html", "wasm/vault_crypto.js", "_locales/en/messages.json"]) {
			mkdirSync(dirname(join(root, file)), { recursive: true }); writeFileSync(join(root, file), "fixture");
		}
		writeFileSync(join(root, "manifest.json"), JSON.stringify(original));
		writeFileSync(join(root, "wasm/vault_crypto_bg.wasm"), Buffer.from([0,97,115,109,1,0,0,0]));
		fn(root);
	} finally { rmSync(root, { recursive: true, force: true }); }
}
test("reports file sizes and SHA-256 without machine paths", () => fixture(root => {
	const result = verifyBuild(root); assert.equal(result.target, "chromium");
	assert(result.files.every(f => /^[a-f0-9]{64}$/.test(f.sha256) && !f.path.includes(root)));
}));
test("missing WASM blocks the artifact", () => fixture(root => { rmSync(join(root,"wasm/vault_crypto_bg.wasm")); assert.throws(() => verifyBuild(root)); }));
test("invalid WASM blocks the artifact", () => fixture(root => { writeFileSync(join(root,"wasm/vault_crypto_bg.wasm"),"bad"); assert.throws(() => verifyBuild(root)); }));
test("private key files block the artifact", () => fixture(root => { writeFileSync(join(root,"secret.pem"),"fixture"); assert.throws(() => verifyBuild(root)); }));
test("source maps block the artifact", () => fixture(root => { writeFileSync(join(root,"background.js.map"),"fixture"); assert.throws(() => verifyBuild(root)); }));
