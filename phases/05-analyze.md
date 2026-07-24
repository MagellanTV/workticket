# Phase 05 — Analyze Codebase `GATED + AGENTS`

Agent count scales with confidence. See `agents/explore-agents.md`.

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
