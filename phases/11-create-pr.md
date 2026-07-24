# Phase 11 — Create Draft PR `SEQUENTIAL GATES`

All values from `.claude/alfred-code/config.md`.

Follow these steps IN ORDER. Each GATE step requires developer approval before continuing.
Do NOT skip steps. Do NOT reorder steps. Do NOT combine gates.

Before drafting ANY text in this phase, skim `.claude/alfred-code/review/lessons.md` for
PR-writing-style entries.

---

## Step 1: Stage changes

```bash
git status
```

List changed files explicitly — never `git add -A`.

If an approved plan exists at `.claude/alfred-code/plans/{TICKET-ID}-v{N}.md`, diff the file list
against that plan's expected files. Call out anything unexpected and ask whether it belongs.

Do NOT run `git add` yet — just identify what will be committed.

---

## Step 2: Update changelog

Read `changelog.enabled` from config.

**If `changelog.enabled` is `true` (or missing/empty — default is true):** execute steps 2a-2e.
**If `changelog.enabled` is explicitly `false`:** skip to Step 3.

Do NOT skip this step unless the config explicitly says `enabled: false`.

### Step 2a — Detect project version

Read `changelog.version_source` from config, then:

| version_source | How to get version |
|---|---|
| `auto` | Try each in order until one works: `package.json` → `pom.xml` → `build.gradle` / `build.gradle.kts` → `pyproject.toml` → `manifest` → `VERSION` file → `version.txt` → git tag (`git describe --tags --abbrev=0`) |
| `package.json` | `node -p "require('./package.json').version"` |
| `pom.xml` | `grep -m1 '<version>' pom.xml \| sed 's/.*<version>\(.*\)<\/version>.*/\1/'` |
| `build.gradle` | `grep -m1 "version" build.gradle \| sed "s/.*version[= ]*['\"]\\(.*\\)['\"].*/\\1/"` |
| `manifest` | `grep -m1 'major_version\|version=' manifest` |
| `pyproject.toml` | `grep -m1 'version' pyproject.toml \| sed 's/.*= *"\(.*\)".*/\1/'` |
| `custom` | Run `{config.changelog.version_command}` |

If no version found, use `Unreleased` as the version header.

### Step 2b — Read or create changelog file

```bash
test -f {config.changelog.file} && echo "EXISTS" || echo "MISSING"
```

If MISSING, create the file with this header:
```markdown
# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/).

```

### Step 2c — Build the changelog entry

Based on the ticket info and changes made:

- Classify each change as: Added, Changed, Fixed, or Removed
- Use the ticket ID and description as context
- Write short, plain, human language (same tone rules as commit/PR text)
- Run tone review on the entry before inserting

Format depends on `changelog.format`:

**keep-a-changelog:**
```markdown
## [{version}] - {YYYY-MM-DD}

### Added
- {description} ({TICKET-ID})

### Changed
- {description} ({TICKET-ID})

### Fixed
- {description} ({TICKET-ID})

### Removed
- {description} ({TICKET-ID})
```
Only include sections that have entries. If the version header already exists in the file, append
entries under it instead of creating a duplicate.

**simple:**
```markdown
## [{version}] - {YYYY-MM-DD}

- {description} ({TICKET-ID})
```

### Step 2d — Insert the entry

Add it after the file header (after the first `# Changelog` line and any preamble), before any
existing version entries. Do not overwrite existing entries.

### Step 2e — Confirm changelog was written

Read the changelog file to verify the entry was correctly inserted. Report to the developer:
"Changelog updated: {changelog.file}"

---

## Step 3: Draft commit message

Format from `{config.git.commit_format}`:
- Replace `{ticket}` with ticket ID
- Replace `{description}` with brief imperative summary

Run the tone check (`agents/tone-review-agent.md`) on the draft. Fix flagged items silently and
re-check once. Only proceed with the cleaned version.

NEVER include any Claude / AI / Claude Code attribution: no Co-Authored-By trailers, no
"Generated with Claude Code" footers, no AI references.

Exception: add Co-Authored-By ONLY if `{config.git.co_author}` is explicitly `true`.

---

## ▶ GATE A: Commit message preview

**STOP.** Present the exact commit message to the developer and wait for explicit approval.

Show it formatted like this:

```
── Commit message preview ──────────────────────
{the exact commit message that will be used}
─────────────────────────────────────────────────
```

Ask: "Approve this commit message? (yes / edit / cancel)"

- **yes** → continue to Step 4
- **edit** → developer provides changes, re-draft, re-run tone check, present again
- **cancel** → stop the workflow

Do NOT run `git add` or `git commit` until the developer says yes.

---

## Step 4: Commit

Stage the specific files (including changelog if it was updated) and commit:

```bash
git add {file1} {file2} {changelog_file_if_updated} ...
git commit -m "{approved commit message}"
```

Never use `git add -A` or `git add .`.

---

## Step 5: Draft PR body

1. Read the PR template from `{config.pr_template.template_path}` if it exists
2. Draft the PR title and body following the writing style rules below
3. Run the tone check (`agents/tone-review-agent.md`) on the full PR body. Fix flagged items
   silently and re-check once
4. Write the cleaned PR body to `.claude/alfred-code/plans/{TICKET-ID}-PR.md`

### Writing style (applies to commit message, PR title, PR body, every comment)

Short, plain, direct human language:
- Description: 2 short paragraphs max — what was wrong, what the change does
- Complete natural sentences, like a teammate wrote them
- Minimal special characters: avoid parentheses, asterisks, slashes, backticks in prose
- Everything in the project's language (default: English)
- No AI attribution anywhere

---

## ▶ GATE B: PR preview

**STOP.** Present the full PR to the developer and wait for explicit approval.

Show it formatted like this:

```
── PR preview ──────────────────────────────────
Title: {PR title}

{full PR body}
─────────────────────────────────────────────────
```

Also mention: "Full preview saved to `.claude/alfred-code/plans/{TICKET-ID}-PR.md`"

Ask: "Approve this PR? (yes / edit / cancel)"

- **yes** → continue to Step 6
- **edit** → developer provides changes, re-draft, re-run tone check, present again
- **cancel** → stop the workflow (commit is already done, PR can be created later)

Do NOT push or create the PR until the developer says yes.

---

## Step 6: Push

```bash
git push -u origin {branch-name}
```

---

## Step 7: Create PR

```bash
gh pr create --draft --title "{approved PR title}" --body "$(cat <<'EOF'
{approved PR body}
EOF
)"
```

- Auto-check items in `{config.pr_template.checklist_auto_check}` by substring match
- All other checklist items remain unchecked

---

## Step 8: Labels

If `{config.pr_template.labels_mapping}` is configured, apply labels based on ticket type.
If `{config.pr_template.path_labels}` is configured, scan changed files and add matching labels.

```bash
gh pr edit --add-label "{labels}"
```

---

## Step 9: Report

Show the PR URL to the developer:

```
── PR created ──────────────────────────────────
{PR URL}
─────────────────────────────────────────────────
```
