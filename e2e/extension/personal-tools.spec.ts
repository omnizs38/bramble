import { expect, test } from "./fixtures";
import { createVault, expectUnlocked, lock, openPopup, unlock } from "./helpers";

test("saved searches survive lock/reopen without plaintext local preferences", async ({
	context,
	extensionId,
}) => {
	const page = await context.newPage();
	await createVault(page, extensionId);
	await openPopup(page, extensionId);
	await expectUnlocked(page);
	const query = "private-filter-f49b2";
	const label = "Private filter f49b2";
	await page.getByRole("textbox", { name: "Search vault" }).fill(query);
	await page.getByRole("button", { name: "Vault tools", exact: true }).click();
	await page.getByLabel("Saved search name").fill(label);
	await page.getByRole("button", { name: "Save current search", exact: true }).click();
	await expect(page.getByText("Search saved in this vault.", { exact: true })).toBeVisible();
	const stored = await page.evaluate(async () =>
		JSON.stringify(await chrome.storage.local.get(null)),
	);
	expect(stored).not.toContain(query);
	expect(stored).not.toContain(label);
	await page.getByRole("button", { name: "Close tools", exact: true }).click();
	await lock(page);
	await unlock(page);
	await page.getByRole("textbox", { name: "Search vault" }).fill("");
	await page.getByRole("button", { name: "Vault tools", exact: true }).click();
	await page.getByRole("button", { name: label, exact: true }).click();
	await expect(page.getByRole("textbox", { name: "Search vault" })).toHaveValue(query);
	await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("duplicate merge creates a live copy and keeps both originals archived", async ({
	context,
	extensionId,
}) => {
	const page = await context.newPage();
	await createVault(page, extensionId);
	await openPopup(page, extensionId);
	await expectUnlocked(page);
	for (const name of ["Duplicate One", "Duplicate Two"]) {
		await page.getByRole("button", { name: /Add New/i }).click();
		await page.getByRole("button", { name: /Add a new login/i }).click();
		await page.getByLabel("Name", { exact: true }).fill(name);
		await page.getByRole("button", { name: /Add URL/i }).click();
		await page.getByLabel("Website URL", { exact: true }).fill("https://example.com");
		await page.getByLabel("Username or email", { exact: true }).fill("personal-test@example.com");
		await page.getByLabel("Password", { exact: true }).fill("synthetic-duplicate-4S6");
		await page.getByRole("button", { name: "Save Login", exact: true }).click();
		await expect(page.getByText(name, { exact: true })).toBeVisible();
	}
	await page.getByRole("button", { name: "Vault tools", exact: true }).click();
	await page.getByRole("button", { name: "Find duplicates", exact: true }).click();
	await page.getByRole("button", { name: "Preview merge", exact: true }).click();
	await expect(page.getByText("Review duplicate merge", { exact: true })).toBeVisible();
	await expect(page.getByText("synthetic-duplicate-4S6", { exact: true })).toHaveCount(0);
	await page
		.getByRole("button", { name: "Confirm merge and archive originals", exact: true })
		.click();
	await expect(
		page.getByText("Merged copy created. Originals are in Archive.", { exact: true }),
	).toBeVisible();
	await expect(page.getByText("No duplicate candidates found.", { exact: true })).toBeVisible();
	await page.getByRole("button", { name: "Close tools", exact: true }).click();
	await expect(page.getByText("Items (1)", { exact: true })).toBeVisible();
	await page.getByRole("button", { name: "Show archived items", exact: true }).click();
	await expect(page.getByText("Items (2)", { exact: true })).toBeVisible();
	await expect(page.getByText("Duplicate One", { exact: true })).toBeVisible();
	await expect(page.getByText("Duplicate Two", { exact: true })).toBeVisible();
});
