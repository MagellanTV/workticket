# Phase 06 — Implementation Plan `GATED + LOOP`

Re-entry point for the Plan-Approve-Build loop.

## Confidence routing

| Score | Behavior |
|---|---|
| HIGH | Inline plan (no agent), quick OK |
| MEDIUM | Plan agent, present for approval |
| LOW | Plan agent + options + iterate |

## First pass

1. Score confidence from Phase 05
2. Generate plan (inline or via `agents/plan-agent.md`)
3. Save to `.claude/workticket/plans/{TICKET-ID}-v1.md`
4. Present, wait for approval

## Re-entry from Phase 08

1. Read previous plans from `.claude/workticket/plans/`
2. Add validation findings as constraints
3. Re-generate, save as v{N+1}
4. Mark previous as `superseded`

## Re-entry from Phase 09

1. Read previous plans
2. Add dev feedback
3. Re-generate, save as v{N+1}
4. Mark previous as `rejected`

## After approval

Update plan status to `approved`, proceed to Phase 07.
