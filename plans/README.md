# Plans — Template

This file is a template. In actual use, plan files live in `.claude/workticket/plans/` per project.

## File naming

```
{TICKET-ID}-v{N}.md
```

## Plan file format

```markdown
# {TICKET-ID} — Plan v{N}

**Status**: approved / rejected / superseded
**Confidence**: HIGH / MEDIUM / LOW
**Created**: {YYYY-MM-DD}
**Reason for rejection** (if rejected): {dev feedback or validation finding}
**Superseded by**: v{N+1} (if superseded)

## Approach
{1-2 sentence summary}

## Steps
1. [File: {path}] — {what changes and why}

## Files to modify
- {path} — {reason}

## Risks
- {identified risks}

## Rejected alternatives
- {approach and why it was dropped}
```

## Usage

- **Phase 06** writes new plan files
- **Phase 06 re-entry** reads previous plans for context
- **Phase 12** counts plan iterations as a quality metric
- Plans are never deleted — rejected plans are valuable context
