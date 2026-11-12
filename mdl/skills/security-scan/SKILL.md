---
name: security-scan
description: Run this deployment's secret and dependency scans before delivering changes with the gitleaks and osv-scanner binaries installed in the image. Use when a branch is about to be pushed or delivered, when a change touches credentials, environment files, CI configuration or dependency manifests, or when asked whether the repository or a diff leaks a secret or ships a vulnerable dependency.
---

# Security scans

Two static binaries, no credentials: `gitleaks` (8.30.1) for secrets in text and
`osv-scanner` (2.7.1) for known advisories in lockfiles. Both exit non-zero on
findings, so a failing scan is a failed gate and never a warning.

## Secrets: scope the scan to the change

The full history of this repository reports hundreds of entropy hits in test
fixtures and localized YAML — noise that hides a real leak. Scan the branch and
the working tree instead, and keep a baseline for what is already known.

```sh
# commits this branch adds on top of the trunk
base=$(git merge-base HEAD origin/main)
gitleaks git --log-opts="$base..HEAD" --redact --report-format json --report-path tmp/gitleaks.json

# files that are not committed yet, by path (dir mode does not honor .gitignore)
gitleaks dir packages apps mdl --redact --report-format json --report-path tmp/gitleaks.json
```

`--redact` keeps the value out of the report and out of your transcript; read
`RuleID`, `File` and `Line` and treat the match itself as already exposed. A
`dir` scan reports git-ignored local files — `mdl/docker/.env` here holds
`SEARXNG_SECRET` and is untracked on purpose — so either exclude that path or
record it once as a baseline:

```sh
gitleaks dir . --redact --report-path tmp/gitleaks-baseline.json   # once
gitleaks dir . --baseline-path tmp/gitleaks-baseline.json --redact  # after that
```

A finding in a fixture, a documentation example or a redacted test constant is a
false positive to baseline, never a reason to weaken the rule set globally.

## Dependencies: scan the lockfiles

```sh
osv-scanner scan source -r . --format table
osv-scanner scan source -L pnpm-lock.yaml --format json
osv-scanner scan source -L requirements.txt --format table
```

It queries the OSV database, so it needs network; without network it fails
loudly rather than reporting a clean result. Exit code `1` means advisories were
found — read the severity column and the fixed version before deciding, because
a transitive advisory with a patched version on both sides is informational while
a direct dependency with no fix is not.

## Reporting

Report the commands you ran, the scope of each scan, and the count of findings.
Never paste a matched value, and never write a credential into a report, a
commit, a test or a baseline file. When a gate cannot run — no network for
`osv-scanner`, a binary missing from the image — report it as not executed
rather than as passing.
