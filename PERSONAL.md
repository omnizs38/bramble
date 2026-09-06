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

The new code needs its own green CI run; previous Chromium E2E results for `64ce489d` are
not results for this personal branch. Larger optimizations and user-facing features are
separate follow-up changes after choosing their scope and measuring a baseline.

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
