# alfred-code

A Claude Code skill that automates the full development cycle: from reading a ticket to creating a Pull Request. It works as a 12-phase orchestrator with confidence-based routing, meaning it automatically decides when to proceed on its own and when to ask the developer for confirmation.

## Requirements

- **Claude Code** (CLI, desktop, or web)
- **Git** configured with user name and email
- **GitHub CLI** (`gh`) authenticated
- Ticket system: Jira, Linear, or GitHub Issues (optional)

## Installation

1. Clone or copy this directory to `~/.claude/skills/alfred-code/`
2. Register the skill in `~/.claude/CLAUDE.md`:
   ```markdown
   # alfred-code
   - **alfred-code** (`~/.claude/skills/alfred-code/SKILL.md`) — ticket to PR workflow. Trigger: `/alfred-code`
   ```
3. Run setup in any project:
   ```
   /alfred-code setup
   ```

## Usage

### Set up a new project

```
/alfred-code setup
```

Checks 11 dependencies (git, gh, ticket system, linter, tests, permissions, etc.), creates the `.claude/alfred-code/` directory in the project with the configuration file, and walks you through fixing anything that's missing.

To reconfigure interactively:

```
/alfred-code setup reconfigure
```

### Run the workflow

```
/alfred-code TICKET-ID
```

Where `TICKET-ID` is the ticket identifier (e.g. `PROJ-123`, `BUG-456`). If the project isn't configured yet, setup runs automatically.

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
| 06 | Plan | Generates the implementation plan and saves it to `.claude/alfred-code/plans/` |

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
~/.claude/skills/alfred-code/          # Global skill (shared across projects)
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

.claude/alfred-code/                   # Per-project data (inside the repo)
├── config.md                          # Project-specific configuration
├── plans/                             # Approved plans per ticket
├── review/
│   └── lessons.md                     # Lessons from previous retros
└── history/                           # Execution log per ticket
```

## Project Configuration

The file `.claude/alfred-code/config.md` holds all project-specific settings. It is created automatically during setup. The main sections are:

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

Setup (Check 11) verifies that `~/.claude/settings.json` has the permissions needed so the workflow doesn't prompt for authorization on every operation. The permissions cover:

- Common bash commands (git, gh, grep, find, curl, npm, node, python, etc.)
- Reading, editing, and writing project files and `~/.claude/` files
- Access to `~/.claude/` as an additional directory
- Dynamic project commands (linter, test runner) detected from the project config

If any permissions are missing, setup reports them and offers to add them automatically.

## Quick Reference

| Command | Action |
|---------|--------|
| `/alfred-code setup` | Configure a new project |
| `/alfred-code setup reconfigure` | Reconfigure interactively |
| `/alfred-code PROJ-123` | Run the full workflow for ticket PROJ-123 |
