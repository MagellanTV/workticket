# Phase 05 — Analyze Codebase `GATED + AGENTS`

Agent count scales with confidence. See `agents/explore-agents.md`.

## Before spawning agents

Read `{config.knowledge.claude_md_path}` (default `CLAUDE.md`). It holds the project's
conventions, build commands and architecture notes, and the agents cannot discover those by
grepping. Pass the conventions that bear on this ticket into each agent prompt — an agent that
does not know the project's patterns will report the wrong ones as "existing patterns to follow",
and Phase 06 will plan against them.

If the file is missing, say so once and continue; do not invent conventions.

| Score | Agents |
|---|---|
| HIGH | Agent 1 only (deep search) |
| MEDIUM | Agents 1 + 2 (search + patterns) |
| LOW | Agents 1 + 2 + 3 (+ root cause for bugs) |

## After agents return

1. Merge Phase 03 background agent results (if spawned)
2. Deduplicate file lists
3. Resolve contradictions

## Synthesis output

```
## Analysis Summary for {TICKET-ID}

### Files to change
- {path} — {reason}

### Existing patterns to follow
- {similar implementation}

### Risks
- {side effects}

### Dependencies
- {related components}
```

This feeds into Phase 06 (Plan).
