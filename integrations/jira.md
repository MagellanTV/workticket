# Jira Integration

## API access

Requires env vars (names from `.claude/workticket/config.md`):
- `{config.ticket_system.env_vars.url}` — Jira instance URL
- `{config.ticket_system.env_vars.email}` — Atlassian email
- `{config.ticket_system.env_vars.token}` — API token

### Reading a ticket

```bash
curl -s -u "$EMAIL:$TOKEN" \
  -H "Content-Type: application/json" \
  "$BASE_URL/rest/api/3/issue/{TICKET-ID}?fields=summary,description,issuetype,priority,status,fixVersions,issuelinks,attachment,comment"
```

Key fields to extract:

| JSON Path | What it contains |
|---|---|
| `fields.summary` | Ticket title |
| `fields.issuetype.name` | Bug, Story, Task, etc. |
| `fields.description` | ADF (Atlassian Document Format) — parse recursively |
| `fields.priority.name` | Priority level |
| `fields.fixVersions[].name` | Target milestone |
| `fields.issuelinks[]` | Linked issues |
| `fields.attachment[]` | Attached files |
| `fields.status.name` | Current status |
| `fields.comment.comments[]` | Discussion thread |

### Parsing ADF (Atlassian Document Format)

The `description` field uses ADF, not plain text:

```python
import json, sys

def adf_to_text(node, depth=0):
    if isinstance(node, str): return node
    if not isinstance(node, dict): return ""
    text = ""
    if node.get("type") == "text": text = node.get("text", "")
    if node.get("type") == "heading":
        text = "\n" + "#" * node.get("attrs", {}).get("level", 1) + " "
    if node.get("type") == "bulletList": text = "\n"
    if node.get("type") == "listItem": text = "- "
    if node.get("type") == "paragraph": text = "\n"
    for child in node.get("content", []):
        text += adf_to_text(child, depth + 1)
    return text

data = json.load(sys.stdin)
desc = data.get("fields", {}).get("description", {})
if desc: print(adf_to_text(desc))
```

### Connectivity check

```bash
curl -s -o /dev/null -w "%{http_code}" -u "$EMAIL:$TOKEN" "$BASE_URL/rest/api/3/myself"
```

## Fallback

If API unavailable: ask dev to paste ticket content manually.
