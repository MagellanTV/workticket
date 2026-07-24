# Phase 10 — Update Knowledge Base `AUTO`

## graphify (if enabled)

If `{config.knowledge.graphify_enabled}` and source files changed:

```bash
{config.knowledge.graphify_rebuild}
```

## CLAUDE.md

If the change introduces a new pattern or convention, suggest an update to `{config.knowledge.claude_md_path}`. Don't force it.

## Report

```
### Knowledge Base Updates
- Graph: rebuilt / skipped
- CLAUDE.md: no update needed / suggested: {what}
```
