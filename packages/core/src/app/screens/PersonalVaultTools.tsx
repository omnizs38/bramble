import { Trans, useLingui } from "@lingui/react/macro";
import { useMemo, useState } from "react";
import { type Entry, useVault } from "../../hooks/useVault";
import {
	findDuplicateGroups,
	makeSavedSearch,
	previewDuplicateMerge,
	readSavedSearch,
} from "../../vault/personal-tools";
import { Button } from "../components/ui/button";
import { Modal } from "../components/ui/modal";
import type { VaultSearch } from "./VaultHome/vault-search";

export default function PersonalVaultTools({
	search,
	onApply,
	onClose,
}: {
	search: VaultSearch;
	onApply: (value: VaultSearch) => void;
	onClose: () => void;
}) {
	const { t } = useLingui();
	const { entries, isLocked, ready, addEntry, setEntriesArchived, mergeDuplicateEntries } =
		useVault();
	const [tab, setTab] = useState<"searches" | "duplicates">("searches");
	const [label, setLabel] = useState("");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [message, setMessage] = useState<string | null>(null);
	const [reviewed, setReviewed] = useState<Entry[] | null>(null);
	const [archiveId, setArchiveId] = useState<string | null>(null);
	const [limit, setLimit] = useState(20);
	const searches = useMemo(
		() => entries.map(readSavedSearch).filter((value) => value !== null),
		[entries],
	);
	// Never scan duplicates during normal popup opening, typing, or in the background.
	const groups = useMemo(
		() => (tab === "duplicates" ? findDuplicateGroups(entries) : []),
		[entries, tab],
	);
	const preview = reviewed ? previewDuplicateMerge(reviewed) : null;
	const run = async (action: () => Promise<void>) => {
		if (busy || isLocked) return;
		setBusy(true);
		setError(null);
		setMessage(null);
		try {
			await action();
		} catch {
			setError(
				t`Could not complete this action. If the vault changed, open a new preview and try again.`,
			);
		} finally {
			setBusy(false);
		}
	};
	if (!ready || isLocked) return null;
	return (
		<Modal open onClose={() => !busy && onClose()} dismissable={!busy}>
			<div className="p-5 space-y-4">
				<h2 className="text-lg">
					<Trans>Vault tools</Trans>
				</h2>
				{error && (
					<p role="alert" className="text-sm text-destructive">
						{error}
					</p>
				)}
				{message && (
					<p role="status" className="text-sm">
						{message}
					</p>
				)}
				{reviewed && preview ? (
					<>
						<h3>
							<Trans>Review duplicate merge</Trans>
						</h3>
						<ul className="text-sm list-disc pl-5">
							{reviewed.map((entry) => (
								<li key={entry.id}>{entry.name}</li>
							))}
						</ul>
						{preview.ok ? (
							<>
								<p className="text-sm">
									<Trans>
										A new merged login will be created. Originals will be archived, not deleted, in
										the same vault write. Restore them from Archive if needed.
									</Trans>
								</p>
								<dl className="text-sm break-words space-y-2">
									<dt>
										<Trans>Name</Trans>
									</dt>
									<dd>{preview.data.name}</dd>
									<dt>
										<Trans>Tags</Trans>
									</dt>
									<dd>{preview.data.tags?.join(", ") || "—"}</dd>
									<dt>
										<Trans>Notes</Trans>
									</dt>
									<dd className="max-h-32 overflow-auto whitespace-pre-wrap">
										{preview.data.notes || "—"}
									</dd>
								</dl>
								<p className="text-xs text-muted-foreground">
									<Trans>
										Passwords, TOTP, URLs, policies and all other non-description fields are
										identical. Their values are not shown here.
									</Trans>
								</p>
								<Button
									disabled={busy}
									onClick={() =>
										void run(async () => {
											await mergeDuplicateEntries(reviewed);
											setReviewed(null);
											setMessage(t`Merged copy created. Originals are in Archive.`);
										})
									}
								>
									<Trans>Confirm merge and archive originals</Trans>
								</Button>
							</>
						) : (
							<p role="status" className="text-sm">
								<Trans>
									Automatic merging is blocked because these fields differ or need manual review:
								</Trans>{" "}
								{preview.conflicts.join(", ")}
							</p>
						)}
						<Button variant="secondary" disabled={busy} onClick={() => setReviewed(null)}>
							<Trans>Back without changes</Trans>
						</Button>
					</>
				) : archiveId ? (
					<>
						<p>
							<Trans>Archive this saved search? You can restore its note from Archive.</Trans>
						</p>
						<Button
							disabled={busy}
							onClick={() =>
								void run(async () => {
									await setEntriesArchived([archiveId], true);
									setArchiveId(null);
								})
							}
						>
							<Trans>Confirm archive</Trans>
						</Button>
						<Button variant="secondary" disabled={busy} onClick={() => setArchiveId(null)}>
							<Trans>Cancel</Trans>
						</Button>
					</>
				) : (
					<>
						<div className="flex gap-2">
							<Button
								variant={tab === "searches" ? "primary" : "secondary"}
								disabled={busy}
								onClick={() => setTab("searches")}
							>
								<Trans>Saved searches</Trans>
							</Button>
							<Button
								variant={tab === "duplicates" ? "primary" : "secondary"}
								disabled={busy}
								onClick={() => setTab("duplicates")}
							>
								<Trans>Find duplicates</Trans>
							</Button>
						</div>
						{tab === "searches" ? (
							<>
								<p className="text-xs text-muted-foreground">
									<Trans>
										Saved searches are encrypted notes inside this vault. They follow its backups,
										sync and key changes; nothing is saved in plaintext preferences.
									</Trans>
								</p>
								<label className="block text-sm">
									<Trans>Saved search name</Trans>
									<input
										className="mt-1 w-full p-2 rounded border border-border bg-background"
										maxLength={80}
										value={label}
										disabled={busy}
										onChange={(event) => setLabel(event.target.value)}
									/>
								</label>
								<p className="text-xs break-words">
									{search.q || "—"} · {search.type} · {search.sort} ·{" "}
									{search.archived ? t`Archive` : t`Active`}
								</p>
								<Button
									disabled={busy || !label.trim() || searches.length >= 30 || search.q.length > 256}
									onClick={() =>
										void run(async () => {
											if (
												searches.some((s) => s.label.toLowerCase() === label.trim().toLowerCase())
											) {
												setError(t`Choose a different saved search name.`);
												return;
											}
											await addEntry(makeSavedSearch(label, search));
											setLabel("");
											setMessage(t`Search saved in this vault.`);
										})
									}
								>
									<Trans>Save current search</Trans>
								</Button>
								<p className="text-xs text-muted-foreground">
									<Trans>Up to 30 active saved searches; query length up to 256 characters.</Trans>
								</p>
								<ul className="space-y-2">
									{searches.map((saved) => (
										<li key={saved.id} className="flex items-center gap-2 text-sm">
											<Button
												variant="secondary"
												disabled={busy}
												onClick={() => {
													onApply(saved.search);
													onClose();
												}}
											>
												{saved.label}
											</Button>
											<button type="button" disabled={busy} onClick={() => setArchiveId(saved.id)}>
												<Trans>Archive saved search</Trans>
											</button>
										</li>
									))}
								</ul>
							</>
						) : (
							<>
								<p className="text-xs text-muted-foreground">
									<Trans>
										On-demand scan of active logins with the same username and exact site origins.
										The scan runs locally without sending data to external services. Different
										credentials are never combined automatically.
									</Trans>
								</p>
								{groups.length === 0 && (
									<p role="status">
										<Trans>No duplicate candidates found.</Trans>
									</p>
								)}
								{groups.slice(0, limit).map((group) => (
									<div
										key={group.entries[0]!.id}
										className="border border-border rounded p-3 space-y-2 text-sm"
									>
										<p className="break-words">{group.origins.join(", ")}</p>
										<p>
											{group.entries.length} <Trans>candidate logins</Trans>
										</p>
										<Button
											disabled={busy || group.entries.length > 20}
											variant="secondary"
											onClick={() => setReviewed(structuredClone(group.entries))}
										>
											<Trans>Preview merge</Trans>
										</Button>
									</div>
								))}
								{groups.length > limit && (
									<Button variant="secondary" onClick={() => setLimit((n) => n + 20)}>
										<Trans>Show more groups</Trans>
									</Button>
								)}
								<p className="text-xs text-muted-foreground">
									<Trans>
										Merge up to 20 logins at once. Cards, notes, SSH keys and archived entries are
										excluded.
									</Trans>
								</p>
							</>
						)}
					</>
				)}
				<Button variant="secondary" disabled={busy} onClick={onClose}>
					<Trans>Close tools</Trans>
				</Button>
			</div>
		</Modal>
	);
}
