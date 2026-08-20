# workticket

A Claude Code skill that automates the full development cycle: from reading a ticket to creating a Pull Request. It works as a 12-phase orchestrator with confidence-based routing, meaning it automatically decides when to proceed on its own and when to ask the developer for confirmation.

## Requirements

- **Claude Code** (CLI, desktop, or web)
- **Git** configured with user name and email
- **GitHub CLI** (`gh`) authenticated
- **Node 18+** — only to run the installer; the workflow itself never uses it
- Ticket system: Jira, Linear, or GitHub Issues (optional)

## Installation

```bash
npx workticket install
```

Run it once per machine. It installs the skill into `~/.claude/skills/workticket/`, registers it
in `~/.claude/CLAUDE.md`, adds a read-only `~/.claude` grant to your global Claude Code settings,
and — if you use Jira or Linear — prompts for an API token with the input hidden and writes it to
`~/.claude/.{provider}-env` at mode 600.

Then once per project:

```bash
npx workticket init
```

This creates `.claude/workticket/` with a `config.md` pre-filled from what the repo actually
contains (it reads `pom.xml`, `build.gradle`, `package.json`, `pyproject.toml`, `go.mod` or a Roku
`manifest` to work out the stack, linter, test command and version source), updates `.gitignore`,
migrates a legacy `.claude/alfred-code/` directory if it finds one, and scopes the workflow's
permissions to that repo.

Both commands are idempotent — re-running them reports "already present" and writes nothing. Add
`--dry-run` to see every change without making it, or `--yes` for non-interactive use.

To check a setup without changing anything:

```bash
npx workticket doctor
```

### Why an installer instead of doing it in Claude Code

The setup is almost entirely deterministic — create directories, copy templates, merge JSON,
append to `.gitignore` — and running it from inside Claude Code means a permission prompt for
every one of those writes. Worse, it is circular: the setup's whole job is to grant the
permissions that would let it run without prompting.

The installer breaks that loop, and it has no dependencies beyond Node 18, so `npx` needs no
install step. Node is only required to *set up* the skill; the workflow itself never touches it.

### How permissions are scoped

Two files, split by blast radius:

| File | Contents | Scope |
|---|---|---|
| `~/.claude/settings.json` | `Read(~/.claude/**)` and `additionalDirectories` | machine-wide, read-only |
| `.claude/settings.local.json` | the `Bash(...)`, `Read`, `Edit` and `Write` rules | that repo only |

Bare `Edit(**)` and `Write(**)` in the *global* file would disable the write-permission prompt
for every project on your machine, permanently. That is a defensible personal choice, but a bad
thing for an installer to do to everyone, so the broad grants are confined to the repository
where the workflow runs. `init` also adds the binaries your own commands need — `Bash(mvn:*)`,
`Bash(./gradlew:*)` and so on — derived from what it detected.

Before touching either file the installer prints the exact entries it would add, backs the file
up, and waits for a yes. It only ever appends: nothing already in the file is removed, reordered
or rewritten, and a file it cannot parse aborts the merge rather than being overwritten.

### Manual installation

If you would rather not use npm, copy this directory to `~/.claude/skills/workticket/` and add
the registration to `~/.claude/CLAUDE.md` by hand:

```markdown
# workticket
- **workticket** (`~/.claude/skills/workticket/SKILL.md`) — ticket to PR workflow. Trigger: `/workticket`
```

You will then need to add the permission rules yourself, or accept a prompt per file write.

### Upgrading from `alfred-code`

This skill was previously named `alfred-code`. If you have the old version installed:

1. Remove the old skill directory: `rm -rf ~/.claude/skills/alfred-code/`
2. Run `npx workticket install` to register the new one.

Your **projects need no manual work**. Run `npx workticket init` in each repo, or just start the
workflow — both paths detect a legacy `.claude/alfred-code/` directory and migrate it in place:
`git mv` when the directory is tracked (so file history follows the rename), plain `mv` otherwise.
The config, every plan, every history entry, and `lessons.md` are preserved, path references
inside those files are rewritten, and the stale `.gitignore` entries are replaced. A config you
already had is never overwritten.

If a project somehow ends up with *both* `.claude/alfred-code/` and `.claude/workticket/`, the
workflow stops and asks which to keep rather than merging them — nothing is deleted without your
explicit confirmation.

## Usage

### Set up a new project

```bash
npx workticket init
```

See [Installation](#installation) above for what it does. Once the project is set up, use the
skill from inside Claude Code to verify and refine the generated config:

```
/workticket setup
```

That runs the 11 dependency checks (git, gh, ticket system, linter, tests, permissions, ...) and
walks you through anything missing. It no longer creates or copies files — the installer owns
that, so you are not answering a permission prompt per write.

To walk through the config field by field:

```
/workticket setup reconfigure
```

### Run the workflow

```
/workticket TICKET-ID
```

Where `TICKET-ID` is the ticket identifier (e.g. `PROJ-123`, `BUG-456`). If the project isn't
configured yet, the workflow tells you to run `npx workticket init` first.

## The 12 Phases

The workflow is split into 4 stages:

### Setup (phases 1-3)

| Phase | Name | What it does |
|-------|------|--------------|
| 01 | Preflight | Verifies git, base branch, project config |
| 02 | Read Ticket | Reads the ticket from the configured system (Jira, Linear, GitHub Issues) |
| 03 | Present + Review | Presents the ticket to the developer, asks questions if anything is ambiguous |

### Plan (phases 4-6)

| Phase | Name | What it does |
|-------|------|--------------|
| 04 | Create Branch | Creates the branch following the configured naming pattern |
| 05 | Analyze | Explores the codebase with parallel agents to understand context |
| 06 | Plan | Generates the implementation plan and saves it to `.claude/workticket/plans/` |

### Build (phases 7-9) — loop

| Phase | Name | What it does |
|-------|------|--------------|
| 07 | Implement | Writes code according to the approved plan |
| 08 | Validate | Runs linter, style checks, code review, tests, and tone review |
| 09 | Dev Review | Presents the diff to the developer for review |

Phases 5-9 form a loop: if validation finds architectural issues, it goes back to the plan. If the developer asks for a different approach, it goes back to analysis.

### Ship (phases 10-12)

| Phase | Name | What it does |
|-------|------|--------------|
| 10 | Update Knowledge | Updates graphify and CLAUDE.md if applicable |
| 11 | Create PR | Changelog, commit (with preview), draft PR (with preview) |
| 12 | Retro | Analyzes the process and saves lessons learned |

## Confidence-Based Routing

Each phase evaluates the complexity of the change and decides how much to involve the developer:

| Level | Criteria | Behavior |
|-------|----------|----------|
| **HIGH** | 1 file, clear pattern, obvious fix | Proceeds automatically |
| **MEDIUM** | 2-4 files, no architectural risk | Summarizes and asks for quick confirmation |
| **LOW** | New pattern, cross-module impact, ambiguous ACs | Stops and escalates |

When everything scores HIGH (typo, config, string change), the workflow compresses to about 4 total interactions.

## File Structure

```
~/.claude/skills/workticket/           # Global skill (shared across projects)
├── SKILL.md                           # Skill entry point
├── README.md                          # This file
├── setup/
│   └── setup.md                       # Setup and dependency checks
├── phases/
│   ├── 01-preflight.md                # Initial verification
│   ├── 02-read-ticket.md              # Ticket reading
│   ├── 03-present-and-review.md       # Presentation and early review
│   ├── 04-create-branch.md            # Branch creation
│   ├── 05-analyze.md                  # Codebase analysis
│   ├── 06-plan.md                     # Implementation plan
│   ├── 07-implement.md                # Implementation
│   ├── 08-validate.md                 # Validation and tests
│   ├── 09-dev-review.md               # Developer review
│   ├── 10-update-knowledge.md         # Knowledge base update
│   ├── 11-create-pr.md                # Commit and PR with previews
│   └── 12-retro.md                    # Retrospective
├── agents/
│   ├── explore-agents.md              # Exploration agents (phase 05)
│   ├── plan-agent.md                  # Planning agent (phase 06)
│   ├── review-agent.md                # Code review agent (phases 03, 08)
│   ├── validation-agents.md           # Validation agents (phase 08)
│   ├── tone-review-agent.md           # Human tone agent (phases 08, 11)
│   └── retro-agent.md                 # Retrospective agent (phase 12)
├── integrations/
│   ├── jira.md                        # Jira adapter
│   ├── linear.md                      # Linear adapter
│   └── github-issues.md              # GitHub Issues adapter
└── templates/
    ├── config.md                      # Configuration template
    ├── plans-README.md                # Plans directory README
    ├── history-README.md              # History directory README
    └── lessons.md                     # Lessons learned template

.claude/workticket/                    # Per-project data (inside the repo)
├── config.md                          # Project-specific configuration
├── plans/                             # Approved plans per ticket
├── review/
│   └── lessons.md                     # Lessons from previous retros
└── history/                           # Execution log per ticket
```

## Project Configuration

The file `.claude/workticket/config.md` holds all project-specific settings. It is created automatically during setup. The main sections are:

| Section | What it configures | Example |
|---------|-------------------|---------|
| Project | Name, language, framework, base branch | `language: TypeScript`, `base_branch: main` |
| Branch naming | Branch name pattern | `{type}/{username}/{ticket}/{description}` |
| Ticket system | Provider and credentials | `provider: jira`, `base_url: https://...` |
| Code review | Custom review skill | `skill_name: my-review-skill` |
| Linter | Lint and auto-fix commands | `command: npm run lint` |
| Build & test | Build, test, and device deploy commands | `test_command: npm test` |
| PR template | Template, labels, checklist | `template_path: .github/pull_request_template.md` |
| Knowledge base | Graphify integration | `graphify_enabled: true` |
| Changelog | Format and version source | `format: keep-a-changelog` |
| Git | Commit format, auto-push | `commit_format: [{ticket}] - {description}` |

## Ticket Integrations

### Jira

Requires a `~/.claude/.jira-env` file with:

```bash
export JIRA_BASE_URL="https://your-instance.atlassian.net"
export JIRA_USER_EMAIL="your-email"
export JIRA_API_TOKEN="your-api-token"
```

### Linear

Requires a `~/.claude/.linear-env` file with:

```bash
export LINEAR_API_KEY="your-api-key"
```

### GitHub Issues

No extra configuration needed — uses the GitHub CLI (`gh`).

## Claude Code Permissions

`npx workticket install` and `npx workticket init` write these; `/workticket setup` (Check 11)
and `npx workticket doctor` verify them. See [How permissions are scoped](#how-permissions-are-scoped)
for the split and the reasoning.

| Scope | File | Contents |
|---|---|---|
| Machine | `~/.claude/settings.json` | `Read(~/.claude/**)`, `additionalDirectories: [~/.claude]` |
| Repo | `.claude/settings.local.json` | bash commands the phases run, plus `Read`/`Edit`/`Write` |
| Repo | `.claude/settings.local.json` | your project's own binaries, e.g. `Bash(mvn:*)`, `Bash(./gradlew:*)` |

If anything is missing, both `setup` and `doctor` name the exact command that fixes it.

## Quick Reference

| Command | Action |
|---------|--------|
| `npx workticket install` | Set up this machine (once) |
| `npx workticket init` | Set up a project (once per repo) |
| `npx workticket doctor` | Check everything; writes nothing |
| `/workticket setup` | Verify and refine the config from inside Claude Code |
| `/workticket setup reconfigure` | Reconfigure interactively |
| `/workticket PROJ-123` | Run the full workflow for ticket PROJ-123 |
