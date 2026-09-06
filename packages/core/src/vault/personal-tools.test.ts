import { describe, expect, it } from "vitest";
import type { Entry, LoginEntry } from "../hooks/useVault";
import {
	entrySnapshot,
	findDuplicateGroups,
	makeSavedSearch,
	previewDuplicateMerge,
	readSavedSearch,
} from "./personal-tools";

const login = (id: string, over: Partial<LoginEntry> = {}): LoginEntry => ({
	id,
	type: "login",
	name: id,
	urls: ["https://example.com/login"],
	username: "Alice",
	password: "test-secret",
	...over,
});
const search = {
	q: "#work bank",
	type: "login" as const,
	sort: "recent-used" as const,
	archived: false,
};
describe("encrypted-note saved searches", () => {
	it("uses the existing note format and round-trips all search fields", () => {
		const note = makeSavedSearch("Work", search);
		expect(note.type).toBe("note");
		expect(readSavedSearch({ ...note, id: "s1" })).toEqual({ id: "s1", label: "Work", search });
	});
	it("rejects empty labels, long queries, and invalid filters", () => {
		expect(() => makeSavedSearch(" ", search)).toThrow();
		expect(() => makeSavedSearch("Work", { ...search, q: "x".repeat(257) })).toThrow();
		expect(() => makeSavedSearch("Work", { ...search, sort: "invalid" as never })).toThrow();
	});
	it("ignores malformed, oversized, archived and unrelated notes", () => {
		for (const notes of ["hello", "{", "x".repeat(5000), '{"format":"other"}'])
			expect(readSavedSearch({ id: "x", type: "note", name: "note", notes })).toBeNull();
		expect(
			readSavedSearch({ ...makeSavedSearch("Work", search), id: "x", archivedAt: 1 }),
		).toBeNull();
		expect(readSavedSearch(login("x"))).toBeNull();
	});
});
describe("duplicate candidates", () => {
	it("groups only active logins with matching origins and case-sensitive usernames", () => {
		const entries = [
			login("1"),
			login("2", { password: "different" }),
			login("3", { username: "alice" }),
			login("4", { archivedAt: 1 }),
			login("5", { urls: ["https://evil-example.com/"] }),
			login("6", { urls: ["http://example.com/login"] }),
			login("7", { urls: ["https://example.com:8443/"] }),
		];
		expect(findDuplicateGroups(entries).map((g) => g.entries.map((e) => e.id))).toEqual([
			["1", "2"],
		]);
	});
	it("does not guess for hostless, malformed, or non-web URLs", () => {
		for (const urls of [[], ["example.com"], ["file:///tmp/x"], ["javascript:alert(1)"]])
			expect(findDuplicateGroups([login("1", { urls }), login("2", { urls })])).toEqual([]);
	});
});
describe("conservative merge preview", () => {
	it("combines descriptions and tags while preserving credentials and input data", () => {
		const entries = [
			login("1", { name: "One", notes: "first", tags: ["Work"], createdAt: 1 }),
			login("2", {
				name: "Two",
				notes: "second",
				tags: ["work", "bank"],
				createdAt: 2,
				lastUsedAt: 10,
			}),
		];
		const before = structuredClone(entries),
			preview = previewDuplicateMerge(entries);
		expect(preview.ok).toBe(true);
		if (!preview.ok) throw new Error("expected preview");
		expect(preview.data).toMatchObject({
			password: "test-secret",
			createdAt: 1,
			lastUsedAt: 10,
			tags: ["Work", "bank"],
		});
		expect(preview.data.notes).toContain("first");
		expect(preview.data.notes).toContain("second");
		expect(entries).toEqual(before);
	});
	it.each([
		"password",
		"totp",
		"urls",
		"autofillEnabled",
		"autoSubmit",
		"subdomainMatch",
		"passwordChangelog",
		"passkeys",
		"futureSecret",
	])("blocks differences in %s without exposing values", (field) => {
		const changed = {
			...login("2"),
			[field]: field === "urls" ? ["https://example.com/other"] : "different-secret",
		} as unknown as Entry;
		const plan = previewDuplicateMerge([login("1"), changed]);
		expect(plan.ok).toBe(false);
		expect(JSON.stringify(plan)).not.toContain("different-secret");
	});
	it("rejects invalid selections and archived inputs", () => {
		for (const entries of [
			[],
			[login("1")],
			[login("1"), login("1")],
			[login("1"), login("2", { archivedAt: 1 })],
			Array.from({ length: 21 }, (_, i) => login(String(i))),
		])
			expect(previewDuplicateMerge(entries).ok).toBe(false);
	});
	it("object key order does not affect stale-preview checks, values still do", () => {
		expect(entrySnapshot({ b: 1, a: 2 })).toBe(entrySnapshot({ a: 2, b: 1 }));
		expect(entrySnapshot({ b: 1 })).not.toBe(entrySnapshot({ b: 2 }));
	});
});
