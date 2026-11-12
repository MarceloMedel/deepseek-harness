---
name: ast-grep
description: Find and rewrite code by syntax shape instead of text with the ast-grep CLI installed in this deployment. Use when a change must match a code structure (a call, a member access, nested nodes) across many files, when a regex would also match comments, strings or different identifiers, when the same edit has to be applied at scale, or when you need the exported symbols and imports of a directory without reading every file.
---

# ast-grep

`/usr/local/bin/ast-grep` (0.51.2) parses the file with a real grammar, so `$A`
placeholders bind syntax nodes and a comment or string with the same characters
never matches. Prefer it over the `grep` tool whenever the thing you are looking
for is a *shape* rather than a literal.

## Find a shape

```sh
ast-grep run -p 'assertNever($A)' --lang ts packages
ast-grep run -p 'if ($COND) { return $X }' --lang ts apps
ast-grep run -p 'console.log($$$ARGS)' --lang ts .        # $$$ARGS matches any argument list
ast-grep run -k call_expression --lang ts packages        # match by AST kind
ast-grep run -p '$A.$B($$$)' --lang ts --json=stream src  # one JSON object per match
```

`-p` is a pattern written in the target language; `-k` matches a node kind
directly; `--selector` narrows a pattern to one sub-node. `--lang` is required
whenever the pattern is language-specific. `--json=stream` gives `file`, `range`
and `text` per match, which is what a script consumes.

## Rewrite at scale

```sh
ast-grep run -p 'assertNever($A)' -r 'assertUnreachable($A)' --lang ts packages --update-all
ast-grep run -p 'foo($A)' -r 'bar($A)' --lang ts src --interactive   # confirm each match
```

`-r` with `-U/--update-all` writes every match; `--interactive` asks per match.
`-r` cannot combine with `--json` or `--update-all` alternatives in one call.
Review the diff afterwards — the rewrite is structural, not semantic, and the
type checker still decides whether the result compiles.

## Reusable rules

For a rule that must be reviewed and reused, `ast-grep scan` reads an
`sgconfig.yml` with YAML rules under a `ruleDirs` entry: each rule is an `id`,
a `language`, a `rule` object, and optionally `fix`. `ast-grep test` runs the
rule against its declared `valid`/`invalid` snippets. Use the YAML project when
the rule will outlive one session; use `run -p` for a one-off.

## Structure without reading files

```sh
ast-grep outline --lang ts packages/core            # exports, imports, members per file
```

`outline` is a cheap substitute for reading a whole directory when the question
is only "what does this module export".

## Boundaries

- It does not resolve types, so it cannot tell `foo` on one class from `foo` on
  another; type-level questions belong to the type checker.
- Patterns match the node kind too: `$A()` will not match a method call written
  as `$A.$B()` unless the pattern says so.
- It rewrites text inside the matched node only. A rename that must also touch
  re-exports across packages is a repository-wide change, not an AST rewrite.
