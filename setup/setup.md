# workticket setup — Dependency Configuration

Verifies that workticket is correctly set up for the current project, and walks the developer
through the parts that need judgement.

## What this file does NOT do

Creating directories, copying templates, editing `.gitignore`, merging permission rules,
writing credential files and migrating a legacy `.claude/alfred-code/` directory all belong to
the installer, not here:

```bash
npx workticket init
```

Those steps are deterministic, and doing them from inside Claude Code means a permission prompt
for every single file write — which is exactly what made this setup tedious. They were also
written as `sed -i ''` blocks, which is BSD-only and fails under GNU sed on Linux. The
installer does them in one portable, idempotent pass with a `--dry-run` and a backup.

What stays here is what a script cannot decide: which review skill to use, which of several
plausible commands is the real linter, how the branch naming should read, and whether a failing
check matters for this project.

## Trigger

- `workticket setup` — verify the setup and guide fixes
- `workticket setup reconfigure` — interactive walkthrough to update config.md

## Execution order

1. Confirm the installer has run (below). If not, tell the developer to run it and stop.
2. Read `.claude/workticket/config.md`
3. If `reconfigure` argument: run the interactive config walkthrough
4. Run ALL dependency checks below (1 through 11) — do not skip any
5. Present the dashboard
6. Walk through fixes for failed checks

IMPORTANT: You MUST run every numbered check below (1 through 11). Read the config file first,
then use its values in each check. Do not skip checks because a field is empty — report it as
"not configured".

IMPORTANT: Batch independent bash commands into single calls using `&&` and `echo` markers to
reduce the number of tool invocations. The checks below show the batched form.

---

## Step 0: Confirm the installer has run

```bash
echo "=== DATA_DIR ===" && test -d .claude/workticket && echo "EXISTS" || echo "MISSING" && echo "=== CONFIG ===" && test -f .claude/workticket/config.md && echo "EXISTS" || echo "MISSING" && echo "=== LEGACY ===" && test -d .claude/alfred-code && echo "EXISTS" || echo "NONE"
```

| Result | Action |
|---|---|
| CONFIG EXISTS | Continue to Step 1 |
| CONFIG MISSING, LEGACY NONE | Tell the developer: "Run `npx workticket init` first — it creates the config from what this repo actually contains." Stop. |
| LEGACY EXISTS | Tell the developer: "This project still uses the old `.claude/alfred-code/` layout. Run `npx workticket init` — it migrates the directory with `git mv` so file history follows, and preserves your plans, history and lessons." Stop. |

Do not create the directory or the config yourself. If the installer is unavailable for some
reason, the templates in `~/.claude/skills/workticket/templates/` can be copied by hand, but
say so explicitly rather than silently doing a partial setup.

## Step 1: Read config

Use the Read tool (not bash) to read `.claude/workticket/config.md`:

```
Read({ file_path: ".claude/workticket/config.md" })
```

Parse every YAML block to extract current values. You need these for all checks below.
Do NOT use `cat` or `Bash` to read this file — the Read tool does not require permission prompts.

## Step 2: Ensure CLAUDE.md exists

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

## Step 3: Interactive reconfigure (only with `reconfigure` argument)

Walk through each section of `.claude/workticket/config.md`. For each section:
- Show the current values
- Ask what to change (or skip to keep current)
- Write the updated values to the file

Sections in order:

### 3.1 Project basics
Show: name, language, framework, base_branch. For base_branch, run:
```bash
git branch -r | sed 's/  origin\///' | sort -u | head -20
```
Show the list and let the developer pick.

### 3.2 Branch naming
Show: pattern, type_mapping, username_format.

### 3.3 Ticket system
Show: provider, base_url, auth_method, env_vars.
Ask which provider (jira / github-issues). Jira is the default; an empty value means
tickets get pasted manually.

### 3.4 Code review skill
Show: skill_name, skill_path, review_references.
List available skills:
```bash
ls ~/.claude/skills/*/SKILL.md 2>/dev/null
ls .claude/skills/*/SKILL.md 2>/dev/null
```

### 3.5 Linter
Show: command, fix_command, style_checks.

### 3.6 Build & test
Show: build_command, test_command, test_type, device_verify.

### 3.7 PR template
Show: template_path, checklist_auto_check, labels_mapping, path_labels.

### 3.8 Knowledge base (graphify)
Show: graphify_enabled, graphify_rebuild, codebase_search, claude_md_path.

If developer sets `graphify_enabled: true`:
1. Check if the graphify CLI is installed: `command -v graphify`
2. If not installed, do not install it yourself — say: "Run `npx workticket install`, which
   offers to install it with whichever of uv, pipx or pip3 you have." The package is
   `graphifyy` on PyPI, not `graphify` or `graphify-cli`; neither of those exists.
3. After the CLI is available, check for the graph: `test -f graphify-out/graph.json`
4. If the graph is missing, ask: "Want me to build the graphify graph now?" It can take
   minutes on a large repo, so wait for a yes.
5. If yes, run: `graphify build` (or the `/graphify` skill if available)
6. Ask what rebuild command to use and save it to config

### 3.9 Changelog
Show: enabled, file, version_source, version_command, format.

If enabled, auto-detect version source by checking which files exist:
```bash
ls package.json pom.xml build.gradle build.gradle.kts pyproject.toml manifest VERSION version.txt 2>/dev/null
```
Suggest the first match as `version_source`. If none found, suggest `auto` (will try git tags at runtime).

Ask which changelog format: keep-a-changelog (recommended) or simple.

### 3.10 Git preferences
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

If `~/.claude/.jira-env` does not exist or variables are missing, hand it to the installer:

```
Run: npx workticket install --provider=jira

It links you to https://id.atlassian.com/manage-profile/security/api-tokens, prompts for the
token with the input hidden, verifies it against the API, and writes ~/.claude/.jira-env at
mode 600.
```

Never ask the developer to paste a token into this conversation, and never write the file
yourself — a token in the transcript is a leaked token. Do NOT suggest adding anything to
~/.zshrc either: an `export JIRA_API_TOKEN=...` there leaks the token into every process they
start. The workflow sources ~/.claude/.jira-env directly.

**If provider is "github-issues":** Already covered by Check 3.

**If provider is empty:** Report "Ticket system not configured — tickets pasted manually".
An empty provider is a deliberate choice, not a misconfiguration, so this is a WARN not an ERR.

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

Optional — without it the analyze phase falls back to grep, so a missing CLI is a WARN, never
an ERR. The PyPI package is **`graphifyy`** (two y's) and it ships two binaries, `graphify` and
`graphify-mcp`.

No conditions. No skipping. Run commands 1 and 2 as a single batched call:

```bash
echo "=== GRAPHIFY_CLI ===" && (command -v graphify 2>/dev/null && echo "FOUND" || echo "NOT_FOUND") && echo "=== GRAPHIFY_GRAPH ===" && (test -f graphify-out/graph.json && echo "FOUND" || echo "NOT_FOUND")
```

**Only if CLI is FOUND and graph is NOT_FOUND**, run:
```bash
graphify build && test -f graphify-out/graph.json && echo "BUILD_SUCCESS" || echo "BUILD_FAILED"
```

**Dashboard mapping:**
- CLI not found → WARN: "graphify not installed — run `npx workticket install`, or
  `uv tool install graphifyy` directly". This is optional: the analyze phase falls back to
  grep, so it is never an ERR.
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

Permissions are split across two files by scope. Read both with the Read tool (not bash).

#### 11a — Global scope: `~/.claude/settings.json`

Only two things belong here, because this file applies to every project on the machine:

```
permissions.allow                 must contain  Read(~/.claude/**)
permissions.additionalDirectories must contain  <the developer's absolute ~/.claude path>
```

Resolve that path from `$HOME` at runtime — never hardcode one, since an absolute path from a
different machine silently fails this check everywhere else. This grant is read-only and
confined to `~/.claude`; it exists so the workflow can read `config.md` and the credential
files without a prompt.

If either is missing, the fix is `npx workticket install` — do not add broad patterns here.

#### 11b — Project scope: `.claude/settings.local.json`

The patterns that actually remove the per-edit prompts live in the project file, so they apply
only to this repository:

```
Bash(git:*)        Bash(gh:*)          Bash(grep:*)      Bash(find:*)
Bash(ls:*)         Bash(cat:*)         Bash(head:*)      Bash(tail:*)
Bash(wc:*)         Bash(sort:*)        Bash(echo:*)      Bash(sed:*)
Bash(awk:*)        Bash(test -d:*)     Bash(test -f:*)   Bash(command -v:*)
Bash(mkdir -p:*)   Bash(cp:*)          Bash(mv:*)        Bash(source:*)
Bash(curl:*)       Read(**)            Edit(**)          Write(**)
```

An entry already present in the global file also counts as satisfied — check both before
reporting something missing.

If any are absent, the fix is `npx workticket init`.

Why the split: bare `Edit(**)` and `Write(**)` in the *global* file disable the write-permission
prompt for every project on the machine, permanently. That is a reasonable personal choice but a
bad default to ship to everyone who installs the skill, so the broad grants are scoped to the
repo where the workflow actually runs.

#### 11c — Project command permissions

Read `.claude/workticket/config.md` and extract these commands if configured:
- `linter.command` (e.g. `npm run lint`)
- `linter.fix_command` (e.g. `npm run lint -- --fix`)
- `build_test.test_command` (e.g. `npm test`)
- `build_test.build_command`, `build_test.sideload_command`
- `changelog.version_command`

For each, take the first word (the binary) and check whether a matching `Bash({binary}:*)`
pattern exists in either file:
- `npm run lint` → needs `Bash(npm:*)`
- `./gradlew test` → needs `Bash(./gradlew:*)`
- `mvn test` → needs `Bash(mvn:*)`

`npx workticket init` derives these from the detected commands and adds them to the project
file. Report anything still uncovered — it usually means the config was edited by hand after
init ran.

#### Fix action

For all three: report what is missing and which command fixes it (`install` for 11a, `init` for
11b and 11c). Offer to edit the files directly only if the developer says the installer is not
an option — and if you do, add to `.claude/settings.local.json`, never broad patterns to the
global file.

**Dashboard mapping:**
- All three pass → OK
- Global missing → ERR: "run npx workticket install"
- Project or command patterns missing → ERR: list what is missing, "run npx workticket init"

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
| 11 | Claude permissions  | OK/ERR | global: {status}, project: {status} |
```

Legend: OK = ready, ERR = missing/broken, N/A = not configured (optional)

## Fix walkthrough

For each ERR item:
1. Explain what's missing and why it matters
2. Provide the exact commands
3. After fix: re-check that specific dependency
4. Update the dashboard line

**Never enter credentials, tokens, or passwords yourself.** For a missing token, point the
developer at `npx workticket install`, which prompts for it with the input hidden and writes
`~/.claude/.{provider}-env` at mode 600. Do not read, echo, or copy a token value.

## After setup

When all required dependencies pass:
"Setup complete! Run `workticket {TICKET-ID}` to start."

---

## Re-running

| Command | What it does | Writes? |
|---|---|---|
| `workticket setup` | Run all checks, show dashboard, guide fixes | only config.md, and only when asked |
| `workticket setup reconfigure` | Update config.md interactively, then run all checks | config.md |
| `npx workticket doctor` | Same checks from the terminal, no Claude Code needed | never |
| `npx workticket init` | Re-apply the deterministic project setup | yes, idempotently |

All are safe to run anytime. `setup` only checks and guides; it never modifies without asking.
`doctor` writes nothing at all, so reach for it first when something is broken.
