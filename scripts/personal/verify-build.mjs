import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstatSync, readdirSync, readFileSync } from "node:fs";
import { resolve, relative, join } from "node:path";
import { fileURLToPath } from "node:url";

const permissions = ["storage", "unlimitedStorage", "alarms", "idle", "offscreen", "clipboardWrite", "webAuthenticationProxy", "identity"];
export function verifyManifest(manifest) {
	assert.equal(manifest.manifest_version, 3, "MV3 is required");
	assert.deepEqual(manifest.background, { service_worker: "background.js", type: "module" });
	assert.deepEqual([...manifest.permissions].sort(), [...permissions].sort(), "Review any permission change");
	assert.deepEqual(manifest.optional_permissions, ["nativeMessaging"]);
	assert.deepEqual(manifest.host_permissions, ["<all_urls>"]);
	assert.deepEqual(manifest.content_security_policy, { extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'" });
	assert.deepEqual(manifest.web_accessible_resources, [{ resources: ["autofill-ui.html", "autofill-ui.js"], matches: ["<all_urls>"], use_dynamic_url: true }]);
	assert.equal(manifest.update_url, undefined, "No automatic update endpoint in development artifacts");
}

export function verifyBuild(directory) {
	const root = resolve(directory);
	const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));
	verifyManifest(manifest);
	for (const name of ["background.js", "content-script.js", "popup.html", "options.html", "offscreen.html", "wasm/vault_crypto.js", "wasm/vault_crypto_bg.wasm", "_locales/en/messages.json"]) {
		assert(lstatSync(join(root, name)).isFile(), `Missing build file: ${name}`);
		assert(readFileSync(join(root, name)).length > 0, `Empty build file: ${name}`);
	}
	assert.deepEqual([...readFileSync(join(root, "wasm/vault_crypto_bg.wasm")).subarray(0, 8)], [0, 97, 115, 109, 1, 0, 0, 0], "Invalid WASM header");
	const files = [];
	function walk(dir) {
		for (const name of readdirSync(dir).sort()) {
			const full = join(dir, name);
			const stat = lstatSync(full);
			assert(!stat.isSymbolicLink(), `Symlink in build: ${name}`);
			assert(!/^\.env(?:\.|$)|\.(?:pem|key|keystore|map)$/i.test(name), `Unexpected sensitive/debug file: ${name}`);
			if (stat.isDirectory()) walk(full);
			else {
				assert(stat.isFile(), `Unexpected file type: ${name}`);
				const bytes = readFileSync(full);
				files.push({ path: relative(root, full).split("\\").join("/"), bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") });
			}
		}
	}
	walk(root);
	return { format: 1, target: "chromium", files };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	console.log(JSON.stringify(verifyBuild(process.argv[2] || "packages/platform-extension/dist-chromium"), null, 2));
}
