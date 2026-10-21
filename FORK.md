# Controlled manual-copy fork

This checkout is maintained from `laaaaaaaaaxxxx/clawgod`, based on upstream
commit `4038ca932c3539911dfc8b97fcce3ab788185f96`. The upstream installation
instructions in historical documentation do not apply to this fork.

## Explicit targets only

- Every install, extraction, post-process, patch and uninstall operation requires
  `--target` and `--output-dir`, both canonical absolute paths. Missing or unknown
  arguments fail; there is no environment, current-directory, PATH, version-scan,
  registry-download or backup-discovery fallback.
- Eligible paths must be inside a directory component named exactly
  `claude-bridge-tests` or `claude-bridge-kiro`. These names are allowlist boundaries,
  not directories that the tool searches. Official installation/configuration
  paths, symlinks/junctions, redirected parents and hard-linked files are rejected.
  There is no force switch. A byte-for-byte independent copy is allowed; a link
  to an official binary is not a copy.
- Installation reads the declared local copy without executing it, writes only
  a new independent output directory, and refuses an existing output. Failure
  removes that newly owned output. It does not download Claude, Bun or import
  tools, change PATH, replace a launcher, or write user configuration.
- Successful output contains runtime support but no extractor, patcher,
  repatcher or installer. Uninstall requires the original explicit target and
  output and validates the output-local copy manifest; it never restores or
  searches for a launcher.

## No automatic maintenance

The startup release check, update download/execute redirect, drift/repatch helper,
automatic source recovery, startup CLI probe, Lean settings migration and embedded
proxy startup have been removed. Update/upgrade commands refuse to run rather
than falling through to the native updater, and native auto-update disabling is
forced before loading copy source. A stale updater patch is fatal even with
`--tolerate-stale`.

Upstream Actions workflows, maintenance bot scripts and official-config hook
installers have been removed. This fork defines no Actions workflows or scheduled
jobs; source checks are explicit local commands using synthetic fixtures.

## Runtime boundary

The copy wrapper has no implicit launch mode. It requires explicit `--target`,
`--output-dir`, `--native-copy`, `--config-dir`, then `--` before copy arguments.
The runtime source and native copy must belong to that output; configuration must
be an existing independent copy directory with no linked members. There is no
automatic provider creation, official-config migration, importer or local proxy.

These are filesystem/entrypoint controls, not an operating-system sandbox for
arbitrary code inside a third-party bundle. No real Claude CLI was executed or
patched while verifying this change. This change does not authorize a real copy
installation, feature selection or deployment.

## Verification

`node build.js --check` verifies both generated offline installers. Synthetic
fixture coverage includes missing declarations, Windows/POSIX lexical paths,
link escapes, hard links, read-only input, failed-output cleanup, update refusal,
source backups, and removal of patch tools after success. The Windows embedded
JavaScript is exercised under Node; this is not a Windows PowerShell host test.
The existing Bun-only text-loader integration requires a separately available
Bun; the fork does not install dependencies automatically.
