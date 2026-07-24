# Phase 01 — Preflight Check `AUTO`

Read `.claude/alfred-code/config.md` first — all checks reference config values.

## Steps

### 1. Project data directory

Check if `.claude/alfred-code/` exists in the project root. If not:
1. Create it with subdirectories: `plans/`, `review/`, `history/`
2. Copy the config template from `~/.claude/skills/alfred-code/templates/config.md` to `.claude/alfred-code/config.md`
3. Copy boilerplate files from `templates/` (plans-README.md, history-README.md, lessons.md)
4. Tell the developer: "First time using alfred-code in this project. Please fill in `.claude/alfred-code/config.md` before continuing."
5. Stop and wait — do not proceed until config is filled.

### 2. Working tree + branch + fetch

Run as a single batched command to minimize tool invocations:

```bash
echo "=== GIT_STATUS ===" && git status --porcelain && echo "=== CURRENT_BRANCH ===" && git branch --show-current && echo "=== FETCH ===" && git fetch origin 2>&1
```

Parse the output by section markers:

- **GIT_STATUS**: If any output after marker → dirty tree. Ask: "You have uncommitted changes. Want me to stash them?" Wait for answer. If yes: `git stash push -u -m "alfred-code-preflight-{TICKET-ID}"`
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

If any required tool is missing, suggest: "Run `alfred-code setup` to configure."
