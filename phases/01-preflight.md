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
| EXISTS | EXISTS | Stop — hand off to `setup/setup.md` Step 0, which asks which to keep |
| NONE | EXISTS | **Migrate** (below), then continue to step 2 |
| NONE | NONE | **First run** — bootstrap (below) |

**Migrate** — never re-run setup over a legacy project, the accumulated lessons are the point:

```bash
git ls-files --error-unmatch .claude/alfred-code >/dev/null 2>&1 && git mv .claude/alfred-code .claude/workticket || mv .claude/alfred-code .claude/workticket
```

Then rewrite stale paths inside the migrated files and the project `.gitignore`:

```bash
grep -rIil 'alfred-code' .claude/workticket .gitignore 2>/dev/null | tr '\n' '\0' | xargs -0 -r sed -i '' -e 's|alfred-code|workticket|g' -e 's|Alfred-code|Workticket|g'
```

Tell the developer: "Migrated `.claude/alfred-code/` → `.claude/workticket/` (config, plans,
history, and lessons preserved)." Then continue — do not stop for approval and do not run setup.

**Bootstrap** — first run in this project:
1. Create it with subdirectories: `plans/`, `review/`, `history/`
2. Copy the config template from `~/.claude/skills/workticket/templates/config.md` to `.claude/workticket/config.md`
3. Copy boilerplate files from `templates/` (plans-README.md, history-README.md, lessons.md)
4. Tell the developer: "First time using workticket in this project. Please fill in `.claude/workticket/config.md` before continuing."
5. Stop and wait — do not proceed until config is filled.

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

If any required tool is missing, suggest: "Run `workticket setup` to configure."
