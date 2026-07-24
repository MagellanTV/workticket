# Phase 03 — Present + Early Review `GATED`

## Confidence routing

| Score | Behavior |
|---|---|
| HIGH | Show summary, auto-confirm, skip review agent |
| MEDIUM | Show summary, wait for "OK" |
| LOW | Show summary + questions, spawn review agent (background) |

## Present summary

```
## {TICKET-ID}: {Title}
Type: {type}
Priority: {priority}
Milestone: {milestone}

### Description
{condensed}

### Acceptance Criteria
- [ ] AC 1
- [ ] AC 2

### Linked Issues
- {list or "None"}
```

Ask: "Does this match your understanding? Any additional context?"

## Review agent (MEDIUM/LOW only)

Spawn background agent — see `agents/review-agent.md` Phase 03 section. Results feed into Phase 05.

## Output

- Developer confirmation (or additional context they provide)
- Background agent task ID (read results in Phase 05)
