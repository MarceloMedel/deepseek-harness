# Agent Note: Coerce string-wrapped object tool parameters at the tool boundary

Status: implemented

## Problem

One model route in current use (a GLM-family route served through the pi-ai adapter) serializes some nested tool parameters as escaped JSON strings while emitting sibling parameters at their declared types. In a recorded session, a `cordis_define` call that the model composed as `"plugin": {"kind": "existing", "pluginId": "catgif-1"}` reached the tool executor with `plugin` equal to the string `"{\"kind\": \"existing\", \"pluginId\": \"catgif-1\"}"`, while the `todos` array of an interleaved `todo_write` call arrived as real objects over the same connection. The session log faithfully stores the raw model arguments string (`SessionEventMap['tool/call'].arguments: string`), and replaying that recorded string through the repo's own validator reproduces the exact production failure: `validateJsonSchemaValue` on the declared `oneOf` schema rejects the collapsed field with `"plugin" must match exactly one oneOf branch (matched 0)`.

Every call whose declared-object parameter collapsed this way failed argument validation before execution, and `cordis_define` is unusable on that route (both of its object-typed parameters always collapse). The stringified parameters were indistinguishable from deliberately-quoted JSON data at the validation layer, so no error message could tell a model how to repair the call.

## Decision

`defineTool` recovers the collapse at the single seam every first-party tool flows through, before argument validation:

- A new pure function, `coerceStringifiedArguments(parameters, args)`, walks the compiled parameter schema one level deep. A property is a candidate only when its compiled schema node cannot accept a bare string: declared scalars (`string`, `number`, `integer`, `boolean`, `null`), unconstrained nodes (what the `json` author type compiles to), and `oneOf` nodes with any string-accepting branch never rewrite their value. For a candidate, a value that is a non-empty string is parsed with `JSON.parse`, and the parsed value replaces the string only when it validates against that property's own schema node. Clean arguments return by identity; non-object arguments return unchanged; unparseable strings and parse results with their own violations pass through, so the normal validation path keeps reporting them loudly.
- `defineTool` runs the coercion on the entry points that read raw model arguments: `execute` (before the hard validation), and `presentCall` / `presentResult` / `isConcurrencySafe` (before the soft validation).

The depth-one limit matches the observed mangling: the route collapses the top-level value itself, not nested content inside parsed parameters. Recovery happens inside the tool definition, so every transport into `ctx.tools.execute` — model dispatch, Code Mode nested dispatches, and replayed logged calls — takes the same path.

`dsh-tools/README.md` documents the behavior on the validation paragraph.

## Alternatives considered

**Normalize in the pi-ai adapter.** Rejected: the adapter re-stringifies pi-ai's parsed arguments for the harness vocabulary (`llm-pi-ai/src/stream.ts`), where the collapse already happened upstream, and the adapter has no per-tool schema to decide what the string should have been. Normalizing without a schema risks rewriting valid JSON data.

**Normalize in `parseArguments` in agent-loop.** Rejected: it is tool-agnostic; deciding that a string field should become an object requires the tool's declared schema, which only the tools layer can consult. A tool-agnostic heuristic would mangle legitimate string arguments.

**Ask the model to re-emit the call.** Rejected: the collapse is deterministic for the route on the affected parameter shapes, so re-prompting loops; the validation error also cannot explain the mismatch, because the collapsed string looks intentional.

**Accept the collapse and teach tool schemas to accept strings.** Rejected: every tool with object parameters would widen its schema to a string-or-object union, pushing per-tool repair code into each definition and leaving the `oneOf` inference unrepresentable.

## Consequences

- Declared-object tool parameters work on routes that double-encode them; `cordis_define` and any future object-parameter tool survive the collapsed form without per-tool handling.
- The trade-off is one JSON.parse plus one schema validation per string-typed value under a non-string-accepting declared property; arguments without any such property keep their exact prior behavior through the identity return.
- A model that deliberately stringifies JSON data under a declared-object parameter gets that data rewritten to the parsed object when it happens to satisfy the schema — the property's declared shape wins, which is what every consumer of the typed argument already promises.
- Raw-registered tools (registered without `defineTool`) do not receive the coercion and keep owning their own input validation, as before.
