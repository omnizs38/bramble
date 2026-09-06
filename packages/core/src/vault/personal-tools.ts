import { z } from "zod";
import type { Entry, EntryData, LoginEntry, NoteEntryData } from "../hooks/useVault";
import { normalizeTags } from "./tags";

const SEARCH_MARKER = "bramble-personal-saved-search/v1";
export const savedSearchSchema = z.object({
	q: z.string().max(256),
	type: z.enum(["all", "login", "card", "note", "ssh-key"]),
	sort: z.enum(["name-asc", "name-desc", "recent-used", "recent-added", "recent-updated"]),
	archived: z.boolean(),
});
export type SavedSearchValue = z.infer<typeof savedSearchSchema>;
const savedNoteSchema = z.object({
	format: z.literal(SEARCH_MARKER),
	label: z.string().trim().min(1).max(80),
	search: savedSearchSchema,
});
/** Ordinary encrypted notes: key rotation, backups and sync use the existing vault format. */
export function makeSavedSearch(label: string, search: SavedSearchValue): NoteEntryData {
	const value = savedNoteSchema.parse({ format: SEARCH_MARKER, label, search });
	return {
		type: "note",
		name: `Saved search: ${value.label}`,
		notes: JSON.stringify(value),
		tags: ["saved-search"],
	};
}
export function readSavedSearch(entry: Entry) {
	if (
		entry.type !== "note" ||
		entry.archivedAt !== undefined ||
		!entry.notes ||
		entry.notes.length > 4096
	)
		return null;
	try {
		const value = savedNoteSchema.safeParse(JSON.parse(entry.notes));
		return value.success
			? { id: entry.id, label: value.data.label, search: value.data.search }
			: null;
	} catch {
		return null;
	}
}

/** Sort object keys only; array order and every unknown field still matter. Never log this. */
export function entrySnapshot(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(entrySnapshot).join(",")}]`;
	if (value !== null && typeof value === "object") {
		return `{${Object.keys(value)
			.sort()
			.filter((key) => (value as Record<string, unknown>)[key] !== undefined)
			.map(
				(key) => `${JSON.stringify(key)}:${entrySnapshot((value as Record<string, unknown>)[key])}`,
			)
			.join(",")}}`;
	}
	return JSON.stringify(value) ?? "undefined";
}
function origins(entry: LoginEntry): string[] {
	const values: string[] = [];
	for (const raw of entry.urls) {
		try {
			const url = new URL(raw);
			if (!["http:", "https:"].includes(url.protocol)) return [];
			values.push(url.origin);
		} catch {
			return [];
		}
	}
	return [...new Set(values)].sort();
}
export interface DuplicateGroup {
	entries: LoginEntry[];
	origins: string[];
}
/** Candidates only, not proof of equality. No passwords in map keys; no PSL approximation. */
export function findDuplicateGroups(entries: Entry[]): DuplicateGroup[] {
	const groups = new Map<string, DuplicateGroup>();
	for (const entry of entries) {
		if (entry.type !== "login" || entry.archivedAt !== undefined) continue;
		const sites = origins(entry);
		if (!sites.length) continue;
		const key = JSON.stringify([entry.username, sites]);
		const group = groups.get(key);
		if (group) group.entries.push(entry);
		else groups.set(key, { entries: [entry], origins: sites });
	}
	return [...groups.values()].filter((group) => group.entries.length > 1);
}
const DESCRIPTIVE = new Set([
	"id",
	"name",
	"notes",
	"tags",
	"createdAt",
	"updatedAt",
	"lastUsedAt",
]);
export type MergePreview =
	| { ok: true; data: EntryData; sourceIds: string[] }
	| { ok: false; conflicts: string[] };
/** Deliberately conservative: different secrets, URLs, policies, histories or unknown fields block. */
export function previewDuplicateMerge(entries: Entry[]): MergePreview {
	if (
		entries.length < 2 ||
		entries.length > 20 ||
		new Set(entries.map((e) => e.id)).size !== entries.length
	)
		return { ok: false, conflicts: ["selection"] };
	if (entries.some((e) => e.type !== "login" || e.archivedAt !== undefined))
		return { ok: false, conflicts: ["entry type or archive state"] };
	if (findDuplicateGroups(entries).length !== 1)
		return { ok: false, conflicts: ["site or username"] };
	const first = entries[0]!;
	const keys = new Set(
		entries.flatMap((e) => Object.keys(e)).filter((key) => !DESCRIPTIVE.has(key)),
	);
	const conflicts = [...keys].filter((key) =>
		entries.some(
			(e) =>
				entrySnapshot((e as unknown as Record<string, unknown>)[key]) !==
				entrySnapshot((first as unknown as Record<string, unknown>)[key]),
		),
	);
	if (conflicts.length) return { ok: false, conflicts };
	const { id: _id, ...data } = first;
	const notes = entries.map((e) => e.notes ?? "");
	const mergedNotes = notes.every((n) => n === notes[0])
		? first.notes
		: entries.map((e) => `${e.name}\n${e.notes ?? ""}`).join("\n\n---\n\n");
	const created = entries.flatMap((e) => (e.createdAt === undefined ? [] : [e.createdAt]));
	const used = entries.flatMap((e) => (e.lastUsedAt === undefined ? [] : [e.lastUsedAt]));
	return {
		ok: true,
		sourceIds: entries.map((e) => e.id),
		data: {
			...data,
			notes: mergedNotes,
			tags: normalizeTags(entries.flatMap((e) => e.tags ?? [])),
			createdAt: created.length ? Math.min(...created) : undefined,
			lastUsedAt: used.length ? Math.max(...used) : undefined,
		},
	};
}
