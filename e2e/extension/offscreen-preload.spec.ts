import { expect, test } from "./fixtures";
import { createVault, expectUnlocked, openPopup } from "./helpers";

test("offscreen crypto and lazy UI work without Chromium modulepreload hints", async ({
	context,
	extensionId,
}) => {
	const page = await context.newPage();
	// Real WASM encryption and recovery-code flow: removing hints must not remove imports.
	await createVault(page, extensionId);
	const offscreen = await page.evaluate(async () => {
		const contexts = await chrome.runtime.getContexts({
			contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
		});
		const url = chrome.runtime.getURL("offscreen.html");
		const response = await fetch(url);
		const html = new DOMParser().parseFromString(await response.text(), "text/html");
		return {
			contexts: contexts.map((c) => c.documentUrl),
			url,
			preloads: html.querySelectorAll('link[rel~="modulepreload"]').length,
			moduleScripts: html.querySelectorAll('script[type="module"][src]').length,
		};
	});
	expect(offscreen.contexts).toContain(offscreen.url);
	expect(offscreen.preloads).toBe(0);
	expect(offscreen.moduleScripts).toBeGreaterThan(0);
	await openPopup(page, extensionId);
	await expectUnlocked(page);
	await page.getByRole("button", { name: "Vault tools", exact: true }).click();
	await expect(page.getByRole("dialog")).toBeVisible();
	// CSS must still load along with the lazily imported UI.
	await expect(page.getByRole("dialog")).toHaveCSS("position", "relative");
	await expect(page.locator('link[rel~="modulepreload"]')).toHaveCount(0);
});
