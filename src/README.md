# Controlled fork sources

The fork-specific contract is documented in `FORK.md` at the repository root.
No script in this fork may discover or select a Claude installation. Upstream
installation, automatic recovery, updater, launcher-replacement and scheduled
workflow behavior is intentionally unsupported.

## Build

Edit `src/shared/` and `src/templates/`, then run:

```sh
node build.js
node build.js --check
```

`install.sh` and `install.ps1` are committed generated artifacts. The shared
manual installer and target policy are embedded in both. The Windows output is
ASCII-only for PowerShell 5.1 and the build must be byte-for-byte reproducible.
`patch.mjs --dump-features` is metadata-only: it performs no target I/O and is
used by the build to weave feature-gate metadata.

## Entry contracts

- `manual-install.cjs` implements the offline copy-only install/uninstall flow.
  Both generated installers require explicit absolute `--target` and
  `--output-dir`. Installation requires a new output; uninstall also requires
  `--uninstall` and a matching output-local manifest. Neither starts a CLI.
- `extract-natives.mjs` requires the same two arguments, reads the declared
  independent native copy and writes extracted files only into the declared
  private output. It never downloads or starts the input.
- `post-process.mjs` requires `--target <output/cli.original.js>` and
  `--output-dir <output>`. `patch.mjs` requires the processed
  `--target <output/cli.original.cjs>` and `--output-dir <output>` for apply,
  dry-run, verify, revert and clean-source capture. Neither uses its own
  installation directory as an implicit target.
- `target-policy.cjs` is shared by every mutating entry. Only the two named
  bridge-copy roots are eligible; linked files/parents, official paths, path
  traversal and unknown/force arguments fail before target I/O.
- `cli.cjs` additionally requires explicit `--native-copy` and `--config-dir`,
  followed by `--` and copy arguments. It does not create or migrate settings,
  start a proxy, check releases or run patch tools. Update/upgrade refuse.

A completed copy output contains runtime support, not an installed patch tool.
No global launcher or PATH change is made. Applying a real copy remains a
separate human-authorized operation; building this source does not authorize it.

## Synthetic verification

```sh
node --test src/shared/target-policy.test.mjs src/shared/manual-install.test.mjs src/shared/source-boundary.test.mjs
node src/shared/ast-patches.test.mjs
node src/shared/patch.test.mjs
node src/shared/terminal-reply.test.mjs
node src/shared/source-backup.test.mjs
node src/shared/updater.test.mjs
node src/shared/provider.test.mjs
node src/shared/bun-ant-shim.test.mjs
node --test src/shared/openai-proxy.test.mjs
```

These fixtures do not start or inspect an installed Claude CLI. They construct
text files and fabricated ELF containers in temporary copy-scoped directories.
The installer fixture poisons PATH with a fake Claude command and checks that
neither discovery nor extracted-source execution occurs. The Windows embedded
JavaScript payload is tested under Node, not certified as a native PowerShell
host run.

`post-process.test.mjs` retains the upstream Bun text-loader integration using
synthetic graph files. It requires an already available Bun, or an explicit
`CLAWGOD_TEST_BUN` path. No dependency download/install is performed by this fork.
`openai-proxy.cjs` remains an uninstalled standalone library with isolated
protocol tests; it is not embedded, started or selected by the copy wrapper.
