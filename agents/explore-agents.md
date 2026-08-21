# Explore Agents — Phase 05

Parallel agents for multi-angle codebase analysis. Count scales with confidence.

Every prompt below must include the project conventions Phase 05 read from
`{config.knowledge.claude_md_path}`. A subagent starts with no context: it cannot grep its way to
"we use constructor injection here", so without them it reports whatever pattern it happens to
find first as the one to follow.

Check for the graph file itself, not just the config flag. `graphify_enabled: true` means the
CLI is installed; building the graph is a separate opt-in step, so the flag can be true with no
`graphify-out/graph.json`. Telling an agent the graph exists when it does not sends it to run a
query against a missing file.

## Agent 1 — Deep search (always runs)

```
Search the {config.project.name} codebase for code related to:
"{ticket title + key terms}"

Project conventions that apply:
{relevant conventions from config.knowledge.claude_md_path, or "none documented"}

{IF config.knowledge.graphify_enabled AND graphify-out/graph.json exists:}
IMPORTANT: a dependency graph is available. Run `graphify query "<question>"` FIRST.
Then `graphify path "<A>" "<B>"` if the ticket involves a flow between concepts.
{ELSE:}
Use grep and find to locate relevant code. Search for function names, class names,
and key terms from the ticket description.
{ENDIF}

Read the top files identified.

Report:
- File paths with key functions
- Data flow summary
- Related components

Search breadth: medium.
```

## Agent 2 — Pattern check (MEDIUM/LOW)

```
In the {config.project.name} codebase, check for:

1. Existing patterns similar to "{ticket description}"
2. Files in the same module/directory that follow a common structure
3. Any shared utilities or base classes that should be reused

{IF config.knowledge.graphify_enabled AND graphify-out/graph.json exists:}
Run `graphify query` before grepping.
{ENDIF}

Report:
- Similar implementations found
- Patterns to follow
- Shared code to reuse
```

## Agent 3 — Root cause trace (LOW + bugs only)

```
Trace the root cause of this bug in the {config.project.name} codebase:

Symptom: "{bug description}"

{IF config.knowledge.graphify_enabled AND graphify-out/graph.json exists:}
Run `graphify query "<symptom>"` first.
{ENDIF}

1. Find the function that handles the described behavior
2. Trace backward to the failure point
3. Check if the same pattern exists elsewhere (regression risk)

Report:
- Probable root cause: file:function
- Control flow chain
- Regression risk areas
- Confidence: high/medium/low

Search breadth: very thorough.
```

## Synthesis (done by main loop, not an agent)

After all agents return:
1. Deduplicate file lists
2. Merge Phase 03 background agent results
3. If agents disagree on root cause or affected area, investigate both
4. Produce unified analysis for Phase 06
