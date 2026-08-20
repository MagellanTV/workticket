# GitHub Issues Integration

## Access

Uses the `gh` CLI (must be authenticated via `gh auth login`).

### Reading an issue

```bash
gh issue view {ISSUE-NUMBER} --json title,body,labels,assignees,milestone,state
```

### Field mapping

| GitHub field | Workticket field |
|---|---|
| `title` | Title |
| `labels[].name` | Type (look for "bug", "enhancement", etc.) |
| `body` | Description (Markdown) |
| `milestone.title` | Milestone |
| `state` | Status |
| `assignees[].login` | Assignee |

### Extracting ACs from body

GitHub issues don't have a structured AC field. Look for:
- A heading containing "acceptance criteria", "AC", "requirements"
- Task lists (`- [ ]`) in the body

### Connectivity check

```bash
gh auth status
```

## Fallback

If `gh` not authenticated: ask dev to paste issue content.
