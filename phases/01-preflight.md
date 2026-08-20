# Phase 01 — Preflight Check `AUTO`

Read `.claude/workticket/config.md` first — all checks reference config values.

## Steps

### 1. Project data directory

Check both the current and the legacy directory in one call — the skill was previously named
`alfred-code`, so projects set up under the old name still hold their config, plans, history,
and lessons in `.claude/alfred-code/`:

```bash
echo "=== CURRENT ===" && test -d .claude/workticket && echo "EXISTS" || echo "NONE" && echo "=== LEGACY ===" && test -d .claude/alfred-code && echo "EXISTS" || echo "NONE"
```

| CURRENT | LEGACY | Action |
|---|---|---|
| EXISTS | NONE | Continue to step 2 |
| EXISTS | EXISTS | Stop. Tell the developer to run `npx workticket init`, which shows both directories and asks which to keep. |
| NONE | EXISTS | Stop. Tell the developer: "This project uses the old `.claude/alfred-code/` layout. Run `npx workticket init` — it migrates with `git mv` so file history follows, and preserves your config, plans, history and lessons." |
| NONE | NONE | Stop. Tell the developer: "This project isn't set up yet. Run `npx workticket init`." |

Do not create, copy, or move any of these files yourself. The installer does it in one portable
pass with a backup and a `--dry-run`; doing it from here costs a permission prompt per write, and
the shell one-liners that used to live in this file relied on BSD `sed -i ''` and broke on Linux.

If the developer says the installer is not available, you may fall back to copying the templates
from `~/.claude/skills/workticket/templates/` by hand — but say plainly that you are doing a
partial setup, and never attempt the legacy migration this way: a half-moved data directory is
worse than an unmigrated one.

### 2. Working tree + branch + fetch

Run as a single batched command to minimize tool invocations:

```bash
echo "=== GIT_STATUS ===" && git status --porcelain && echo "=== CURRENT_BRANCH ===" && git branch --show-current && echo "=== FETCH ===" && git fetch origin 2>&1
```

Parse the output by section markers:

- **GIT_STATUS**: If any output after marker → dirty tree. Ask: "You have uncommitted changes. Want me to stash them?" Wait for answer. If yes: `git stash push -u -m "workticket-preflight-{TICKET-ID}"`
- **CURRENT_BRANCH**: If not `{config.project.base_branch}` → Ask: "You're on `{branch}`. Switch to `{base_branch}`?" Wait for answer. If yes: `git checkout {base_branch}`
- **FETCH**: Report if base branch is behind remote. Offer to pull.

Pre-existing dirty files are never a signal for what the new ticket touches, even if they look
related. They exist to be stashed and set aside.

### 5. Ticket system access

Based on `{config.ticket_system.provider}`:
- **jira**: See `integrations/jira.md` — check env vars and API connectivity
- **linear**: See `integrations/linear.md`
- **github-issues**: Check `gh` CLI is authenticated

### 6. Tool availability

Check each configured tool:
- `{config.linter.command}` — can the linter run?
- `{config.build_test.test_command}` — can tests run?
- `{config.code_review.skill_name}` — is the review skill installed?
- `{config.knowledge.graphify_enabled}` — does graph.json exist?
- `gh` CLI — authenticated?

### 7. Report

```
## Preflight Results

- Git: clean / stashed
- Branch: {base_branch} (up to date)
- Tickets: {provider} connected / fallback to manual
- Linter: {command} available / not configured
- Tests: {command} available / not configured
- Review skill: {name} installed / not configured
- Knowledge: graphify ready / grep fallback
```

If any required tool is missing, suggest: "Run `npx workticket doctor` to see everything at once."
