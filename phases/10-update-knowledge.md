# Phase 10 — Update Knowledge Base `AUTO`

## graphify (if enabled)

If `{config.knowledge.graphify_enabled}` and source files changed, and
`{config.knowledge.graphify_rebuild}` is non-empty, run it:

```bash
{config.knowledge.graphify_rebuild}
```

If that field is empty, skip this step and say so — do not fall back to guessing a command.
`npx workticket init` fills it in with `graphify update .` when graphify is enabled.

## CLAUDE.md

If the change introduces a new pattern or convention, suggest an update to `{config.knowledge.claude_md_path}`. Don't force it.

## Report

```
### Knowledge Base Updates
- Graph: rebuilt / skipped
- CLAUDE.md: no update needed / suggested: {what}
```
