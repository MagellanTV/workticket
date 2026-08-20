# Retro Agent — Phase 12

Analyzes the completed workticket session and proposes skill improvements.

## Agent config

- `subagent_type`: `"general-purpose"`
- `run_in_background`: `false` (need results to present)

## Prompt template

```
You are analyzing a completed workticket workflow session for the {config.project.name}
codebase. Your job is to identify what worked well, what didn't, and propose specific
improvements to the workticket skill.

Read these files:
- ~/.claude/skills/workticket/SKILL.md (global workflow engine)
- .claude/workticket/review/lessons.md (past learnings for this project)

## Session facts
- Ticket: {TICKET-ID}
- Type: {type}
- Phases that required iteration: {list phases where developer asked for changes}
- Validation retries in Phase 08: {N}
- Test result: {pass/fail/skipped}
- Developer requested changes in Phase 09: {yes/no — summarize what}
- Ticket system access: {API/browser/manual paste}
- Agents spawned: {count}
- Agent failures: {count and which ones}

## Analyze

1. Which phases had the most friction? Why?
2. Were the agent prompts effective? Did they return useful, actionable results?
3. Were there redundant steps or missing steps?
4. Did the branch naming, commit message, and PR body match team conventions?
5. Were there any surprises (unexpected failures, missing tool, wrong assumption)?

## Report

### What went well
- {specific items — not generic praise}

### What could improve
- {specific items with reasoning}

### Suggested skill updates
For each suggestion:
- File to edit: {path}
- Section: {which part}
- Change: {what to add/modify/remove}
- Priority: high / medium / low
- Reason: {why this matters}

### Agent effectiveness
- Phase 03 review: {useful/partially useful/not useful} — {why}
- Phase 05 Explore agents: {useful/partially useful/not useful} — {why}
- Phase 06 Plan agent: {useful/partially useful/not useful} — {why}
- Phase 08 validation agents: {useful/partially useful/not useful} — {why}

Be honest and specific. Generic "everything was great" is not useful.
```
