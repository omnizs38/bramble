/** @vitest-environment happy-dom */
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Entry } from "../../hooks/useVault";
import { messages } from "../../locales/en/messages";
import { makeSavedSearch } from "../../vault/personal-tools";
import PersonalVaultTools from "./PersonalVaultTools";
import { DEFAULT_SEARCH } from "./VaultHome/vault-search";

const vault = vi.hoisted(() => ({
	entries: [] as Entry[],
	ready: true,
	isLocked: false,
	addEntry: vi.fn(async () => {}),
	setEntriesArchived: vi.fn(async () => {}),
	mergeDuplicateEntries: vi.fn(async () => {}),
}));
vi.mock("../../hooks/useVault", () => ({ useVault: () => vault }));
beforeAll(() => {
	i18n.load("en", messages);
	i18n.activate("en");
});
beforeEach(() => {
	vault.entries = [];
	vault.isLocked = false;
	vault.ready = true;
	vi.clearAllMocks();
});
afterEach(cleanup);
const entry = (id: string, password = "test-secret"): Entry => ({
	id,
	name: `Login ${id}`,
	type: "login",
	username: "alice",
	password,
	urls: ["https://example.com"],
});
function setup() {
	const onApply = vi.fn(),
		onClose = vi.fn();
	const ui = () => (
		<I18nProvider i18n={i18n}>
			<PersonalVaultTools
				search={{ ...DEFAULT_SEARCH, q: "#work account" }}
				onApply={onApply}
				onClose={onClose}
			/>
		</I18nProvider>
	);
	const view = render(ui());
	return { onApply, onClose, redraw: () => view.rerender(ui()) };
}
const click = (name: string) => fireEvent.click(screen.getByRole("button", { name }));
describe("Chromium personal vault tools", () => {
	it("saves current search as a note, not plaintext preferences", async () => {
		setup();
		fireEvent.change(screen.getByLabelText("Saved search name"), { target: { value: "Work" } });
		click("Save current search");
		await waitFor(() => expect(vault.addEntry).toHaveBeenCalledOnce());
		expect(vault.addEntry).toHaveBeenCalledWith(
			makeSavedSearch("Work", { ...DEFAULT_SEARCH, q: "#work account" }),
		);
	});
	it("restores the complete filter state and closes the panel", () => {
		const search = { ...DEFAULT_SEARCH, q: "#bank", archived: true, sort: "recent-used" as const };
		vault.entries = [{ ...makeSavedSearch("Bank archive", search), id: "saved" }];
		const h = setup();
		click("Bank archive");
		expect(h.onApply).toHaveBeenCalledWith(search);
		expect(h.onClose).toHaveBeenCalledOnce();
	});
	it("does not overwrite a saved search with the same label", async () => {
		vault.entries = [{ ...makeSavedSearch("Work", DEFAULT_SEARCH), id: "saved" }];
		setup();
		fireEvent.change(screen.getByLabelText("Saved search name"), { target: { value: "work" } });
		click("Save current search");
		await waitFor(() =>
			expect(screen.getByRole("alert").textContent).toContain("different saved search name"),
		);
		expect(vault.addEntry).not.toHaveBeenCalled();
	});
	it("requires confirmation to archive a saved search", async () => {
		vault.entries = [{ ...makeSavedSearch("Work", DEFAULT_SEARCH), id: "saved" }];
		setup();
		click("Archive saved search");
		expect(vault.setEntriesArchived).not.toHaveBeenCalled();
		click("Confirm archive");
		await waitFor(() => expect(vault.setEntriesArchived).toHaveBeenCalledWith(["saved"], true));
	});
	it("never merges on scan or preview; secrets are not displayed", async () => {
		vault.entries = [entry("1"), entry("2")];
		setup();
		click("Find duplicates");
		click("Preview merge");
		expect(vault.mergeDuplicateEntries).not.toHaveBeenCalled();
		expect(screen.queryByText("test-secret")).toBeNull();
		click("Confirm merge and archive originals");
		await waitFor(() => expect(vault.mergeDuplicateEntries).toHaveBeenCalledWith(vault.entries));
	});
	it("blocks different credentials instead of selecting a password silently", () => {
		vault.entries = [entry("1"), entry("2", "other-secret")];
		setup();
		click("Find duplicates");
		click("Preview merge");
		expect(
			screen.queryByRole("button", { name: "Confirm merge and archive originals" }),
		).toBeNull();
		expect(screen.getByRole("status").textContent).toContain("password");
		expect(screen.queryByText("other-secret")).toBeNull();
	});
	it("retains the preview and displays a generic error when the write fails", async () => {
		vault.mergeDuplicateEntries.mockRejectedValueOnce(
			new Error("private-value-must-not-be-rendered"),
		);
		vault.entries = [entry("1"), entry("2")];
		setup();
		click("Find duplicates");
		click("Preview merge");
		click("Confirm merge and archive originals");
		await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
		expect(screen.queryByText("private-value-must-not-be-rendered")).toBeNull();
		expect(screen.getByText("Review duplicate merge")).toBeTruthy();
	});
	it("hides all decrypted content after locking", () => {
		vault.entries = [entry("1"), entry("2")];
		const h = setup();
		click("Find duplicates");
		click("Preview merge");
		vault.isLocked = true;
		h.redraw();
		expect(screen.queryByRole("dialog")).toBeNull();
	});
});
