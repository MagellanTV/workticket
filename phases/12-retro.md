# Phase 12 — Workflow Retro `AGENT`

## 1. Spawn retro agent

See `agents/retro-agent.md`. Always runs regardless of confidence.

## 2. Present retro

```
## Workflow Retro for {TICKET-ID}

### Metrics
- Plan iterations: {N}
- Validation retries: {N}
- Test result: {pass/fail/skipped}
- Dev review iterations: {N}
- Confidence level: {HIGH/MEDIUM/LOW}

### What went well
- {items}

### What could improve
- {items}

### Suggested updates
- {changes with file references}
```

## 3. Developer feedback

Ask: "Any feedback? I'll update the skill for next time."

## 4. Apply

1. Update skill files if approved
2. Append to `.claude/alfred-code/review/lessons.md`
3. Create `.claude/alfred-code/history/{TICKET-ID}.md`
4. Save to memory if significant
