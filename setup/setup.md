# workticket setup — Dependency Configuration

Checks every tool and integration that workticket needs for the current project. For each
missing or misconfigured dependency, walks the developer through setup.

## Trigger

- `workticket setup` — check dependencies and guide fixes
- `workticket setup reconfigure` — interactive walkthrough to update config.md

## Execution order

1. Migrate a legacy `.claude/alfred-code/` directory if one is present
2. Bootstrap `.claude/workticket/` if it doesn't exist
3. Update `.gitignore` to exclude workticket and graphify working files
4. Ensure CLAUDE.md exists — if missing, run `/init` before continuing
5. Read `.claude/workticket/config.md`
6. If `reconfigure` argument: run interactive config walkthrough, then continue to step 7
7. Run ALL dependency checks below (1 through 11) — do not skip any
8. Present dashboard
9. Walk through fixes for failed checks

IMPORTANT: You MUST run every numbered check below (1 through 11). Read the config file first,
then use its values in each check. Do not skip checks because a field is empty — report it as
"not configured".

IMPORTANT: Batch independent bash commands into single calls using `&&` and `echo` markers to
reduce the number of tool invocations. The checks below show the batched form.

---

## Step 0: Migrate legacy `.claude/alfred-code/`

The skill was previously named `alfred-code`. Projects set up under the old name keep their
plans, history, and lessons in `.claude/alfred-code/`. Migrate that data instead of starting
over — the accumulated lessons are the most valuable part of it.

```bash
echo "=== LEGACY ===" && test -d .claude/alfred-code && echo "EXISTS" || echo "NONE" && echo "=== CURRENT ===" && test -d .claude/workticket && echo "EXISTS" || echo "NONE" && echo "=== TRACKED ===" && git ls-files --error-unmatch .claude/alfred-code >/dev/null 2>&1 && echo "YES" || echo "NO"
```

Route on the two directory results:

| LEGACY | CURRENT | Action |
|---|---|---|
| NONE | any | Nothing to migrate — continue to Step 1 |
| EXISTS | NONE | Migrate (below) |
| EXISTS | EXISTS | **Stop and ask** — do not merge or overwrite |

### If LEGACY EXISTS and CURRENT is NONE

Move the directory. Use `git mv` when the legacy path is TRACKED, so history follows the
rename; plain `mv` otherwise (the working files are usually gitignored):

```bash
git mv .claude/alfred-code .claude/workticket
```

```bash
mv .claude/alfred-code .claude/workticket
```

Then rewrite stale paths *inside* the migrated files — old plans, history entries, and
`lessons.md` reference `.claude/alfred-code/` and `~/.claude/skills/alfred-code/`:

```bash
grep -rIil 'alfred-code' .claude/workticket 2>/dev/null | tr '\n' '\0' | xargs -0 -r sed -i '' -e 's|alfred-code|workticket|g' -e 's|Alfred-code|Workticket|g'
```

Report what moved:

```bash
echo "=== MIGRATED ===" && ls .claude/workticket && echo "=== COUNTS ===" && echo "plans: $(ls .claude/workticket/plans 2>/dev/null | wc -l | tr -d ' ')" && echo "history: $(ls .claude/workticket/history 2>/dev/null | wc -l | tr -d ' ')"
```

Tell the developer:

```
Migrated `.claude/alfred-code/` → `.claude/workticket/`
- config.md carried over (no re-setup needed)
- {N} plan files, {N} history entries, lessons.md preserved
- internal path references updated
```

Step 1 will then find the directory EXISTS and skip bootstrapping, and Step 2 replaces the
stale `.gitignore` entries.

### If BOTH exist

Do not merge automatically — the two directories may hold conflicting configs. Show what each
contains and ask the developer which to keep:

```bash
echo "=== LEGACY ===" && find .claude/alfred-code -type f | sort && echo "=== CURRENT ===" && find .claude/workticket -type f | sort
```

Ask: "Both `.claude/alfred-code/` and `.claude/workticket/` exist. Keep the new one and delete
the legacy directory, or copy specific files across first?" Wait for the answer. Never delete
the legacy directory without an explicit yes.

## Step 1: Bootstrap project directory

```bash
test -d .claude/workticket && echo "EXISTS" || echo "MISSING"
```

If MISSING:
1. Create directories:
   ```bash
   mkdir -p .claude/workticket/plans .claude/workticket/review .claude/workticket/history
   ```
2. Copy templates:
   ```bash
   cp ~/.claude/skills/workticket/templates/config.md .claude/workticket/config.md
   cp ~/.claude/skills/workticket/templates/plans-README.md .claude/workticket/plans/README.md
   cp ~/.claude/skills/workticket/templates/history-README.md .claude/workticket/history/README.md
   cp ~/.claude/skills/workticket/templates/lessons.md .claude/workticket/review/lessons.md
   ```
3. Tell the developer: "Created `.claude/workticket/`. Please fill in `config.md` or run `workticket setup reconfigure`."

## Step 2: Update .gitignore

Ensure the project's `.gitignore` excludes workticket working files and graphify output.
These are local workflow artifacts that should not be committed to the repository.

Required entries:

```
# workticket workflow data
.claude/workticket/plans/
.claude/workticket/history/
.claude/workticket/review/

# graphify output
graphify-out/
```

Note: `.claude/workticket/config.md` is NOT ignored — it should be committed so the whole
team shares the same workflow configuration.

If the project was migrated in Step 0, `.gitignore` still carries the legacy entries. Replace
them in place rather than appending duplicates:

```bash
grep -n 'alfred-code' .gitignore 2>/dev/null || echo "NO_LEGACY_ENTRIES"
```

If any are found, rewrite them:

```bash
sed -i '' -e 's|\.claude/alfred-code/|.claude/workticket/|g' -e 's|# alfred-code workflow data|# workticket workflow data|' .gitignore
```

Then run the presence check below — the rewritten entries will already read FOUND.

Check which entries are already present and only add the missing ones:

```bash
test -f .gitignore && echo "EXISTS" || echo "MISSING"
```

If `.gitignore` is MISSING, create it with the entries above.

If `.gitignore` EXISTS, check each entry:

```bash
echo "=== PLANS ===" && grep -qF '.claude/workticket/plans/' .gitignore 2>/dev/null && echo "FOUND" || echo "MISSING" && echo "=== HISTORY ===" && grep -qF '.claude/workticket/history/' .gitignore 2>/dev/null && echo "FOUND" || echo "MISSING" && echo "=== REVIEW ===" && grep -qF '.claude/workticket/review/' .gitignore 2>/dev/null && echo "FOUND" || echo "MISSING" && echo "=== GRAPHIFY ===" && grep -qF 'graphify-out/' .gitignore 2>/dev/null && echo "FOUND" || echo "MISSING"
```

For each MISSING entry, append it to `.gitignore`. Group new entries under their comment
header. Do NOT duplicate entries that already exist.

After updating, report: "Updated `.gitignore` to exclude workflow artifacts."

## Step 3: Ensure CLAUDE.md exists

Check if a CLAUDE.md file exists in the project root:

```bash
test -f CLAUDE.md && echo "EXISTS" || echo "MISSING"
```

If MISSING: invoke the built-in `/init` skill immediately using the Skill tool:

```
Skill({ skill: "init" })
```

This runs the codebase analysis and creates CLAUDE.md with project-specific documentation
(build commands, architecture, conventions). Wait for `/init` to complete before proceeding —
the generated CLAUDE.md provides context that improves the rest of the setup.

Do NOT skip this step. Do NOT ask the developer whether to run it — just run it.
If CLAUDE.md already exists, continue to Step 4.

## Step 4: Read config

Use the Read tool (not bash) to read `.claude/workticket/config.md`:

```
Read({ file_path: ".claude/workticket/config.md" })
```

Parse every YAML block to extract current values. You need these for all checks below.
Do NOT use `cat` or `Bash` to read this file — the Read tool does not require permission prompts.

## Step 5: Interactive reconfigure (only with `reconfigure` argument)

Walk through each section of `.claude/workticket/config.md`. For each section:
- Show the current values
- Ask what to change (or skip to keep current)
- Write the updated values to the file

Sections in order:

### 5.1 Project basics
Show: name, language, framework, base_branch. For base_branch, run:
```bash
git branch -r | sed 's/  origin\///' | sort -u | head -20
```
Show the list and let the developer pick.

### 5.2 Branch naming
Show: pattern, type_mapping, username_format.

### 5.3 Ticket system
Show: provider, base_url, auth_method, env_vars.
Ask which provider (jira / linear / github-issues).

### 5.4 Code review skill
Show: skill_name, skill_path, review_references.
List available skills:
```bash
ls ~/.claude/skills/*/SKILL.md 2>/dev/null
ls .claude/skills/*/SKILL.md 2>/dev/null
```

### 5.5 Linter
Show: command, fix_command, style_checks.

### 5.6 Build & test
Show: build_command, test_command, test_type, device_verify.

### 5.7 PR template
Show: template_path, checklist_auto_check, labels_mapping, path_labels.

### 5.8 Knowledge base (graphify)
Show: graphify_enabled, graphify_rebuild, codebase_search, claude_md_path.

If developer sets `graphify_enabled: true`:
1. Check if graphify CLI is installed: `command -v graphify`
2. If not installed: guide installation (pip install graphify-cli)
3. After CLI is available, check if graph exists: `test -f graphify-out/graph.json`
4. If graph missing, ask: "Want me to build the graphify graph now?"
5. If yes, run: `graphify build` (or `/graphify` skill if available)
6. Ask what rebuild command to use and save it to config

### 5.9 Changelog
Show: enabled, file, version_source, version_command, format.

If enabled, auto-detect version source by checking which files exist:
```bash
ls package.json pom.xml build.gradle build.gradle.kts pyproject.toml manifest VERSION version.txt 2>/dev/null
```
Suggest the first match as `version_source`. If none found, suggest `auto` (will try git tags at runtime).

Ask which changelog format: keep-a-changelog (recommended) or simple.

### 5.10 Git preferences
Show: auto_commit, auto_push, commit_format, co_author.

After all sections: write the updated config.md, then continue to dependency checks.

---

## Dependency Checks

Run ALL of these. Do not skip any.

### Check 1: Git configuration

Run as a single batched command:
```bash
echo "=== USER_NAME ===" && git config user.name 2>/dev/null || echo "(not set)" && echo "=== USER_EMAIL ===" && git config user.email 2>/dev/null || echo "(not set)" && echo "=== REMOTE ===" && git remote get-url origin 2>/dev/null || echo "(not set)"
```

| Check | Pass | Fail action |
|---|---|---|
| `user.name` set | Has value | Ask: "What name should git use?" |
| `user.email` set | Has value | Ask: "What email?" |
| Remote `origin` exists | URL returned | "No git remote configured." |

### Check 2: Base branch

Read `base_branch` from config. Then run:
```bash
git rev-parse --verify "origin/{base_branch}" 2>/dev/null && echo "EXISTS" || echo "MISSING"
```

If MISSING:
```bash
git branch -r | sed 's/  origin\///' | sort -u | head -20
```
Show the list. Ask: "Which branch should workticket use as the base?" Update config.

### Check 3: GitHub CLI

Run as a single batched command:
```bash
echo "=== GH_INSTALLED ===" && (command -v gh && echo "INSTALLED" || echo "MISSING") && echo "=== GH_AUTH ===" && gh auth status 2>&1
```

| Check | Pass | Fail action |
|---|---|---|
| `gh` installed | "INSTALLED" | — |
| `gh` missing | "MISSING" | "Install: `brew install gh`" |
| `gh` authenticated | Shows logged in | "Run `gh auth login`" |

### Check 4: Ticket system

Read `provider` from config. Then:

**If provider is "jira":**

Source credentials and check all variables in a single batched call:
```bash
source ~/.claude/.jira-env 2>/dev/null && echo "JIRA_BASE_URL=${JIRA_BASE_URL:-(not set)}" && echo "JIRA_USER_EMAIL=${JIRA_USER_EMAIL:-(not set)}" && echo "JIRA_API_TOKEN=${JIRA_API_TOKEN:+(set)}"
```

If all three are set, test connectivity in one call:
```bash
source ~/.claude/.jira-env && curl -s -o /dev/null -w "%{http_code}" -u "$JIRA_USER_EMAIL:$JIRA_API_TOKEN" "$JIRA_BASE_URL/rest/api/3/myself"
```
200 = OK. 401 = bad credentials. 403 = permissions. Other = network issue.

If `~/.claude/.jira-env` does not exist or variables are missing, guide:
```
1. Go to https://id.atlassian.com/manage-profile/security/api-tokens
2. Click "Create API token", name it "dev-workflow"
3. Copy the token
4. Create ~/.claude/.jira-env with:
   export JIRA_BASE_URL="https://your-instance.atlassian.net"
   export JIRA_USER_EMAIL="your-email"
   export JIRA_API_TOKEN="your-token"
```
Do NOT ask the developer to add anything to ~/.zshrc. The setup sources ~/.claude/.jira-env directly.

**If provider is "linear":**

Source credentials and check in a single batched call:
```bash
source ~/.claude/.linear-env 2>/dev/null && echo "LINEAR_API_KEY=${LINEAR_API_KEY:+(set)}"
```
If set, test connectivity:
```bash
source ~/.claude/.linear-env && curl -s -o /dev/null -w "%{http_code}" -X POST https://api.linear.app/graphql -H "Authorization: $LINEAR_API_KEY" -d '{"query": "{ viewer { id } }"}'
```

**If provider is "github-issues":** Already covered by Check 3.

**If provider is empty:** Report "Ticket system not configured".

### Check 5: Linter

Read `linter.command` from config.

If command is set:
```bash
{linter_command} --help 2>&1 | head -3
```
If command not found: "Linter command `{command}` not found. Check installation or update config."

If command is empty: Report "Linter: not configured (optional)".

### Check 6: Test runner

Read `build_test.test_type` from config.

**If "local":** check `test_command` is runnable
**If "device":** check `sideload_command` is runnable
**If "none" or empty:** Report "Tests: not configured (optional)".

### Check 7: Code review skill

Read `code_review.skill_name` and `code_review.skill_path` from config.

If skill_name is set:
```bash
test -f {skill_path} && echo "INSTALLED" || echo "MISSING"
```
If MISSING: "Review skill '{skill_name}' not found at {skill_path}."

If skill_name is empty: Report "Code review skill: not configured (optional)".

### Check 8: Graphify

No conditions. No skipping. Run commands 1 and 2 as a single batched call:

```bash
echo "=== GRAPHIFY_CLI ===" && (command -v graphify 2>/dev/null && echo "FOUND" || echo "NOT_FOUND") && echo "=== GRAPHIFY_GRAPH ===" && (test -f graphify-out/graph.json && echo "FOUND" || echo "NOT_FOUND")
```

**Only if CLI is FOUND and graph is NOT_FOUND**, run:
```bash
graphify build && test -f graphify-out/graph.json && echo "BUILD_SUCCESS" || echo "BUILD_FAILED"
```

**Dashboard mapping:**
- CLI not found → ERR: "graphify not installed — run `pip install graphify-cli`"
- CLI found + graph found → OK
- CLI found + graph not found + build succeeded → OK (just built)
- CLI found + graph not found + build failed → ERR: "graphify build failed"

### Check 9: workticket skill

```bash
test -f ~/.claude/skills/workticket/SKILL.md && echo "INSTALLED" || echo "MISSING"
```

### Check 10: CLAUDE.md

Verify that CLAUDE.md exists in the project root (it should — Step 3 creates it if missing):

```bash
test -f CLAUDE.md && echo "EXISTS" || echo "MISSING"
```

If still MISSING at this point (e.g., `/init` failed or was skipped), report ERR and offer to
run `/init` again.

**Dashboard mapping:**
- EXISTS → OK
- MISSING → ERR: "Run `/init` to generate project documentation"

### Check 11: Claude Code permissions

Read `~/.claude/settings.json` using the Read tool (not bash). Verify these two things:

#### 11a — Required permission patterns

Check that `permissions.allow` contains ALL of these patterns:

```
Bash(git:*)
Bash(gh:*)
Bash(grep:*)
Bash(find:*)
Bash(ls:*)
Bash(echo:*)
Bash(cat:*)
Bash(sed:*)
Bash(sort:*)
Bash(head:*)
Bash(wc:*)
Bash(test -d:*)
Bash(test -f:*)
Bash(command -v:*)
Bash(mkdir -p:*)
Bash(cp:*)
Bash(source:*)
Bash(curl:*)
Bash(npm:*)
Bash(node:*)
Bash(python:*)
Bash(python3:*)
Bash(pip3:*)
Bash(graphify:*)
Bash(chmod:*)
Bash(bash:*)
Read(**)
Read(~/.claude/**)
Edit(**)
Edit(~/.claude/**)
Write(**)
Write(~/.claude/**)
```

#### 11b — additionalDirectories

Check that `permissions.additionalDirectories` includes `/Users/juanmanuel/.claude` (the full
`~/.claude` directory, not just the skills subdirectory). This allows workticket to read
`settings.json`, credential files, and other config without permission prompts.

#### 11c — Dynamic command permissions (project-specific)

Read the project's `.claude/workticket/config.md` and extract these commands if configured:
- `linter.command` (e.g., `npm run lint`)
- `linter.fix_command` (e.g., `npm run lint -- --fix`)
- `build_test.test_command` (e.g., `npm test`)
- `build_test.sideload_command`
- `changelog.version_command`

For each configured command, extract the first word (the binary name) and check if a matching
`Bash({binary}:*)` pattern exists in `permissions.allow`. For example:
- `npm run lint` → needs `Bash(npm:*)` (already in required list)
- `./gradlew test` → needs `Bash(./gradlew:*)`
- `mvn test` → needs `Bash(mvn:*)`

Report any dynamic commands whose binary prefix is NOT covered by existing patterns.

#### Fix action

**If any patterns from 11a are missing:** offer to add them to `~/.claude/settings.json`
by editing the `permissions.allow` array.

**If additionalDirectories is wrong (11b):** offer to fix it.

**If dynamic commands are uncovered (11c):** offer to add the missing `Bash({binary}:*)`
patterns. These are project-specific, so also suggest adding them to the project-level
`.claude/settings.json` if one exists.

**Dashboard mapping:**
- All checks pass → OK
- Any missing → ERR: list what's missing

---

## Dashboard

After ALL checks complete, present this table:

```
## workticket setup — Dependency Status

| #  | Dependency          | Status | Notes                          |
|----|---------------------|--------|--------------------------------|
| 1  | Git config          | OK/ERR | {user.name}, {user.email}      |
| 2  | Base branch         | OK/ERR | {base_branch}                  |
| 3  | GitHub CLI (gh)     | OK/ERR | {version or "missing"}         |
| 4  | Ticket system       | OK/ERR | {provider}: {status}           |
| 5  | Linter              | OK/N/A | {command or "not configured"}  |
| 6  | Test runner         | OK/N/A | {type}: {command}              |
| 7  | Code review skill   | OK/N/A | {skill_name or "not configured"} |
| 8  | Graphify            | OK/N/A | {status detail}                |
| 9  | workticket skill   | OK/ERR | {path}                         |
| 10 | CLAUDE.md           | OK/ERR | {exists or "created by /init"} |
| 11 | Claude permissions  | OK/ERR | {N} patterns OK / {M} missing  |
```

Legend: OK = ready, ERR = missing/broken, N/A = not configured (optional)

## Fix walkthrough

For each ERR item:
1. Explain what's missing and why it matters
2. Provide the exact commands
3. After fix: re-check that specific dependency
4. Update the dashboard line

**Never enter credentials, tokens, or passwords yourself.** Guide the developer.

## After setup

When all required dependencies pass:
"Setup complete! Run `workticket {TICKET-ID}` to start."

---

## Re-running

| Command | What it does |
|---|---|
| `workticket setup` | Run all checks, show dashboard, guide fixes |
| `workticket setup reconfigure` | Update config.md interactively, then run all checks |

Safe to run anytime — it only checks and guides, never modifies without asking.
