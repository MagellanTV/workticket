# Phase 07 — Implement Changes `AUTO`

Follow the approved plan from Phase 06.

## Before each file

1. Read the file first (never write blind)
2. Find the closest neighbor pattern in the codebase
3. If a code review skill is configured (`{config.code_review.skill_name}`), follow its coding standards
4. Read `{config.knowledge.claude_md_path}` (default `CLAUDE.md`) for conventions — use the
   configured path, not a hardcoded filename, or a project that keeps it elsewhere silently
   gets none of its own conventions applied

## Writing comments and text

Apply these rules to EVERY comment, string, or text you write in code. Do not defer this to Phase 08 — get it right the first time.

1. **No AI attribution anywhere**: no mentions of Claude, Anthropic, Claude Code, "generated with", "AI-assisted", Co-Authored-By referencing AI. This is a hard block.
2. **No AI-sounding language**: avoid "Furthermore", "It's worth noting", "This ensures that", "Note that", "In order to", "Leverage/leveraging", "Robust", "Seamless(ly)", "Additionally", "Moreover", "Delve into".
3. **Comments explain WHY, not WHAT**: no comments unless the reason is non-obvious (a hidden constraint, a workaround, a surprising invariant). If the code is self-explanatory, write no comment.
4. **Short, plain, direct human language**: write like a teammate, not a formal document. No overly exhaustive bullet structures where one sentence works.
5. **No markdown residue in code**: no backticks, asterisks-as-bullets, or slashes as "and/or" in comments.

These rules come from `agents/tone-review-agent.md`. Phase 08 Track E will verify compliance — violations found there mean wasted fix cycles.

## After all changes

List what was done:
```
### Changes made
- {file}: {what changed}
```
