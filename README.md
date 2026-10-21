# ClawGod — controlled manual-copy fork

Fork: [laaaaaaaaaxxxx/clawgod](https://github.com/laaaaaaaaaxxxx/clawgod).
Based on upstream commit `4038ca932c3539911dfc8b97fcce3ab788185f96`.

**Never install on, launch, patch, test against, or overwrite the official Claude CLI.**
Only explicitly declared independent bridge test/copy targets are eligible.
No automatic discovery, background update check, download, repatch, configuration
migration, PATH/global-launcher change or scheduled workflow is supported.

See [FORK.md](FORK.md) for the enforced boundary and verification limits, and
[src/README.md](src/README.md) for the source/build contracts. Documentation
under `docs/` and `web/` was inherited from upstream; its historical installation
instructions are not supported by this fork. Their automatic hook installers
have been removed.

Builds and synthetic fixtures do not authorize a real copy installation or a
runtime launch. Real target operations require a separate one-time human
authorization, explicit absolute paths and an independent output directory.

## Source checks

```sh
node build.js
node build.js --check
node --test src/shared/target-policy.test.mjs src/shared/manual-install.test.mjs src/shared/source-boundary.test.mjs
```

No Claude binary is required or executed by these checks. A completed copy
output contains runtime support only; patch tools are removed after success.
Upstream licensing is retained in `LICENSE`.
