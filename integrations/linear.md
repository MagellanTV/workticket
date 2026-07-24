# Linear Integration

## API access

Requires:
- `LINEAR_API_KEY` — from Linear Settings > API > Personal API keys

### Reading an issue

```bash
curl -s -X POST https://api.linear.app/graphql \
  -H "Content-Type: application/json" \
  -H "Authorization: $LINEAR_API_KEY" \
  -d '{
    "query": "{ issue(id: \"{ISSUE-ID}\") { title description state { name } priority priorityLabel labels { nodes { name } } team { name } cycle { name } comments { nodes { body } } } }"
  }'
```

### Field mapping

| Linear field | Alfred-code field |
|---|---|
| `title` | Title |
| `state.name` | Status |
| `priorityLabel` | Priority |
| `labels[].name` | Type (look for "bug", "feature", etc.) |
| `description` | Description (Markdown, not ADF) |
| `cycle.name` | Milestone |
| `comments[].body` | Comments |

### Connectivity check

```bash
curl -s -o /dev/null -w "%{http_code}" -X POST https://api.linear.app/graphql \
  -H "Authorization: $LINEAR_API_KEY" \
  -d '{"query": "{ viewer { id } }"}'
```

## Fallback

If API unavailable: ask dev to paste issue content.
