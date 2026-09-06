# Personal Chromium branch

This is the fork-only development line for `omnizs38/bramble`.

- `personal/chromium`: personal work, based on `64ce489d99241601700cf23097540b97a02a4647`.
- `perf/chromium-pr`: upstream PR #91. Do not merge this personal branch into it.
- Import reviewed upstream fixes into the personal line deliberately. Do not force-push either line.
- Chromium-family browsers only for new build automation. No store publishing, updater changes,
  signing secrets, telemetry, or automatic dependency upgrades are configured here.

## Automatic build

Pushes to `personal/chromium` run **Personal Chromium** in GitHub Actions. The job is guarded
by both repository and branch, uses read-only repository permissions, does not persist Git
credentials, pins every action to a full commit SHA, and cancels superseded runs.

The pipeline installs the existing locked JS dependencies, audits them and the Rust crypto
lockfile, builds fresh WASM, verifies crypto behavior, builds Chromium, typechecks, lints,
runs Rust and JS unit tests, the Chromium extension E2E suite, and the document-bound
transport security test. Browser tests have retries disabled; failures block the build artifact.
No Firefox, mobile app, desktop app, or website is built by this workflow.

After success, download `bramble-personal-chromium-<commit>` from the run's **Artifacts**.
Reports include the commit, versions, and SHA-256 inventory of the extension files.
These are development artifacts, not signed releases or a security certification.
The existing development extension key is unchanged: use a separate test browser profile,
not a profile containing your real vault or the installed official Bramble extension.
A separate release identity and upgrade/migration strategy must be reviewed before personal releases.

## Windows / local build

Use Node 24, the `pnpm@10.33.0` pinned in `package.json`, Rust from `rust-toolchain.toml`, and
`wasm-pack 0.13.1`. No tool is silently installed by the local build command.

```powershell
git switch personal/chromium
git pull --ff-only origin personal/chromium
pnpm install --frozen-lockfile
pnpm run personal:check
pnpm run personal:build
```

`personal:build` does not need Bash. It builds WASM with a locked Cargo graph, verifies it,
builds Chromium even when `TARGET=firefox` was inherited, and checks the artifact's manifest,
CSP, permission set, required files, and WASM header. It stops on command errors.
This command alone does not run the complete CI test suite.

```powershell
pnpm run personal:audit
pnpm exec playwright install chromium
pnpm test:e2e --retries=0
```

No real credentials are required for the tests. Build metadata is not proof of byte-for-byte
reproducibility across platforms; it identifies what each particular run produced.

## Dependency review at the initial personal baseline

`pnpm install --frozen-lockfile` succeeded without dependency or lockfile changes.
The production npm audit reported no known advisories. The full workspace audit reported:

- `uuid` via `@capacitor/cli > xcode`: GHSA-w5hq-g745-h8pq, moderate.
- `image-size` via `web-ext > addons-linter`: GHSA-w3rx-r6r6-pgpr and
  GHSA-5p2g-fcmc-qvqq, high; the audit returned no patched version.

These are tool dependencies, not evidence of a Chromium runtime vulnerability. They remain
visible in the whole-workspace report; they are not suppressed or automatically overridden.
The CI production audit blocks on any known advisory, while tool advisories are reported as
warnings. Rust audit failures (including unsoundness warnings) and registry errors block the pipeline. The audit databases
change over time; zero advisories does not mean all vulnerabilities have been excluded.

## First changes and limits

The hostname matcher reuses the page's eTLD+1 within one scan instead of repeating it for
every entry. It retains full `tldts` behavior, does not cache credentials, and reads current
entry data. Tests cover policy equivalence, wildcard/exception suffixes, independent queries,
and one page-side PSL call for a 1,000-entry scan. This is an operation-count regression test,
not a claimed RAM reduction or end-to-end speedup.

WASM negative checks now use `assert.throws`: the old helper caught its own failure sentinel
and could pass when the expected operation did not throw. Crypto algorithms, parameters,
permissions, and the vault format are unchanged.

Each change needs its own green CI run; previous Chromium E2E results for `64ce489d` are
not results for this personal branch. The selected follow-up features and optimizations are
described below; benchmark results are separate from browser test results.

## Rust audit follow-up

The first CI run correctly blocked its artifact on five Rust advisories; local reproduction
also reported an unsoundness warning. The personal branch now updates only the affected
packages and required transitive dependencies:

- `quick-xml` 0.37.5 → 0.41.0 (RUSTSEC-2026-0194 / RUSTSEC-2026-0195).
- `rkyv` and `rkyv_derive` 0.8.16 → 0.8.18 (RUSTSEC-2026-0233 / 0234 / 0235).
- `anyhow` 1.0.102 → 1.0.104 (RUSTSEC-2026-0190).

The XML adapter handles the newer parser's separate entity-reference events without losing
text or decoding twice, and rejects duplicate `Protected` attributes. Regressions cover named
and numeric entities, key files, invalid references, and duplicate attributes. The Rust suite
passed locally: 78 passed, 2 ignored benchmarks. The updated crypto lockfile audit reports
zero known vulnerabilities and no warnings, with no advisory exceptions.

The new CI action versions for pnpm setup and artifact upload use Node 24 directly; their
full commit SHAs remain pinned. No npm versions or npm lockfile entries were changed.

Local verification after the Rust updates: the full `personal:build` command passed,
including fresh WASM, the crypto behavior verifier, the Chromium Vite build, and
artifact validation. This does not replace a green browser E2E run in CI.

## Saved searches and duplicate review (Chromium only)

Open **Vault tools** on the unlocked vault's home screen. The panel's UI is loaded on demand.
The capability is disabled for Firefox, mobile and desktop builds.

- **Saved searches** store query, type, sort and archive view in an ordinary encrypted note
  tagged `saved-search`. This intentionally reuses vault encryption, rotation, export, recovery
  and sync rather than introducing plaintext preferences or a separate key store. The notes
  remain visible in the normal vault; editing their JSON can invalidate the shortcut, but never
  silently deletes the note. Up to 30 active shortcuts, 80-character labels and 256-character queries.
- **Find duplicates** scans active logins only, on demand. Candidate grouping requires matching
  usernames (case-sensitive) and the same complete set of HTTP(S) origins. It never broadens to
  eTLD+1, guesses from bare hostnames, or sends credentials to a server.
- **Preview merge** shows descriptions and names of conflicting fields, never password/TOTP/
  private-key values. Different credentials, URLs, policies, passkeys, password histories or
  unknown fields block automatic merging. Notes/tags can be combined, and the first name is shown
  as the merged name. Review at most 20 logins per merge.
- **Confirm merge and archive originals** is a separate confirmation. It rejects a changed/deleted
  source snapshot, creates a merged copy and archives the exact originals in one vault write.
  Nothing is deleted or tombstoned; restore originals through Archive. Failure does not commit
  the new React state. This uses the existing storage/sync write path; it is not a new cross-device
  transaction protocol.

The panel disappears when the vault locks. All tests use synthetic entries.

## Further performance changes

- The vault home sorts when entries, sort order or current-site ranking change, not on each
  query keystroke. Filtering preserves the previous archive/type/tag semantics and stable ordering.
- Name sorting reuses an `Intl.Collator`; summary counts use one memoized pass.
- Chromium personal builds limit in-flight per-entry encryption calls to eight, preserving output
  order and stopping new work after an error. No ciphertext/key cache is introduced; `sealAll`
  still re-encrypts both layers during key rotation. This reduces queued work, not the number of
  entries that ultimately need encryption. Other platforms keep their previous concurrency.
- `pnpm run personal:bench` compares a fixed eight-query typing sequence over 10,000 synthetic
  entries, verifies result equivalence and records five alternating-order trials. CI includes the
  raw timings in its report artifact. There is no flaky timing threshold and no claim that this
  measures complete browser startup, autofill latency or process RAM.

The personal E2E suite additionally checks saved-search persistence with no plaintext local
preferences, and merge/Archive behavior using the real extension and WASM.

## Production UI regression guard

The first feature CI run exposed missing compiled messages: both new browser tests timed out
looking for the Vault tools button. The catalogs are now extracted and compiled for every
existing locale. New strings fall back to English until translated; existing translations are
preserved. CI re-extracts, recompiles and formats catalogs, then requires a clean catalog diff
before building, so stale checked-in production messages fail early. Browser selectors and
timeouts were not loosened. Machine-readable Chromium E2E and transport results are included
in the report artifact, including on failures.

## Chromium extension preload compatibility

Chromium can reject `chrome-extension://` modulepreload hints as cross-world resource
mismatches, then warn that the preloads were unused. The Chromium Vite build disables module
preload hints rather than suppressing browser diagnostics. Native ES module imports and Vite's
CSS loading remain enabled; Firefox keeps its previous preload configuration. No CSP,
permissions, or web-accessible resources were broadened.

The build validator rejects modulepreload links in generated HTML. The browser regression
creates a vault with real offscreen crypto, confirms the offscreen document exists without
preload hints, and opens the lazy tools UI with its stylesheet applied.

The preload change also exposed a startup ordering issue: `hasDocument()` may return true
while an in-flight `createDocument()` is still loading the module receiver. Concurrent callers
now join the creation promise before and after the asynchronous existence probe. Three
regressions reproduce the old early-send behavior and verify that failed creation propagates
without dispatching the waiting operation. Crypto operations are not retried or duplicated.
