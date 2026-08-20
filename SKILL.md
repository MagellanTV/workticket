---
name: workticket
description: >
  End-to-end development workflow: reads a ticket, plans the implementation,
  writes code following project standards, validates, and creates a draft PR.
  Trigger: workticket TICKET-ID (e.g. workticket PROJ-123).
  Use workticket setup to configure dependencies for a new project.
---

# /workticket — Ticket-to-PR Development Workflow

Orchestrates the full development cycle from reading a ticket to creating a draft PR. Uses confidence-gated routing to decide when to auto-proceed vs. ask the developer, and a Plan-Approve-Build loop that re-plans when validation or review reveals the approach was wrong.

## Argument routing

Parse the first argument to decide which mode to run:

| Argument | Mode | Action |
|---|---|---|
| `setup` | Setup mode | Read and follow `setup/setup.md` |
| `setup reconfigure` | Reconfigure mode | Read and follow `setup/setup.md` with reconfigure flag |
| `TICKET-ID` (anything else) | Workflow mode | Run the 12-phase ticket-to-PR workflow below |

---

## Workflow mode: `workticket <TICKET-ID>`

**First time?** If Phase 01 (preflight) detects missing dependencies or `.claude/workticket/config.md` does not exist, run setup mode automatically before proceeding.

## File Layout

The skill separates **engine** (global, shared across projects) from **project data** (per-project, lives in the repo).

```
~/.claude/skills/workticket/           <- GLOBAL (this skill)
├── SKILL.md                          <- you are here
├── setup/
│   └── setup.md                      <- setup & dependency checks
├── agents/                           <- agent prompt templates
│   ├── explore-agents.md             <- Phase 05 parallel Explore agents
│   ├── plan-agent.md                 <- Phase 06 Plan agent
│   ├── review-agent.md               <- Phase 03 + 08C code review
│   ├── validation-agents.md          <- Phase 08 linter, style, device
│   ├── tone-review-agent.md          <- Phase 08E + 11 human tone check
│   └── retro-agent.md                <- Phase 12 retro analysis
├── phases/                           <- phase instructions
│   ├── 01-preflight.md ... 12-retro.md
├── integrations/                     <- ticket system adapters
│   ├── jira.md
│   ├── linear.md
│   └── github-issues.md
└── templates/                        <- bootstrap files for new projects
    ├── config.md                     <- config template
    ├── plans-README.md
    ├── history-README.md
    └── lessons.md

.claude/workticket/                    <- PER-PROJECT (created per repo)
├── config.md                         <- project-specific configuration
├── plans/                            <- approved plans per ticket
│   └── README.md
├── review/                           <- lessons learned from retros
│   └── lessons.md
└── history/                          <- execution log per ticket
    └── README.md
```

**On first run in a project**: if `.claude/workticket/config.md` does not exist, run setup mode automatically. Do not ask — just run it.

**Migrating from `alfred-code`**: this skill was previously named `alfred-code`. If a project has
`.claude/alfred-code/` and no `.claude/workticket/`, Phase 01 renames it in place (with `git mv`
when tracked) and rewrites stale paths inside the migrated files — config, plans, history, and
lessons all carry over, and setup is NOT re-run. If both directories exist, the workflow stops and
asks which to keep. See `phases/01-preflight.md` step 1 and `setup/setup.md` Step 0.

Load files lazily — read phase/agent files only when you reach that step.

---

## Configuration

All project-specific values come from `.claude/workticket/config.md`. Read it at the start of every session. Key fields:

| Config field | Used in | Example |
|---|---|---|
| `project.base_branch` | Phase 04 (branch from), Phase 08 (diff base) | `main` |
| `branch_naming.pattern` | Phase 04 | `{type}/{username}/{ticket}/{description}` |
| `ticket_system.provider` | Phase 02 (which adapter to use) | `jira` |
| `code_review.skill_name` | Phase 03, 08 (which skill for review) | `my-review-skill` |
| `linter.command` | Phase 08 Track A | `npm run lint` |
| `build_test.test_command` | Phase 08 Track D | `npm test` |
| `pr_template.template_path` | Phase 11 | `.github/pull_request_template.md` |
| `changelog.enabled` | Phase 11 | `true` |
| `changelog.file` | Phase 11 | `CHANGELOG.md` |
| `changelog.version_source` | Phase 11 | `auto` |
| `git.commit_format` | Phase 11 | `[{ticket}] - {description}` |

If a config field is empty, that feature is skipped (e.g., no linter command = skip Track A).

---

## Confidence-Gated Routing

Every phase scores its result before deciding what to do next.

### Scoring rules

| Score | Criteria | Action |
|---|---|---|
| **HIGH** | Single file, clear pattern, no conflicts, obvious fix, clear ACs | **Auto-proceed** |
| **MEDIUM** | Multiple files, pattern needs adaptation, no architectural risk | **Summarize + quick confirm** |
| **LOW** | New pattern, cross-module impact, architectural decision, ambiguous ACs | **Stop + escalate** |

### Scoring signals

```
Files affected:    1 = +HIGH    2-4 = +MEDIUM    5+ = +LOW
Pattern exists:    exact match = +HIGH    similar = +MEDIUM    none = +LOW
Cross-module risk: none = +HIGH    one module = +MEDIUM    multiple = +LOW
AC clarity:        explicit + testable = +HIGH    implicit = +MEDIUM    ambiguous = +LOW
Ticket type:       typo/config = +HIGH    bug = +MEDIUM    feature/refactor = +LOW
```

Take the **lowest** signal as the overall score.

An initial LOW driven by ambiguous or absent ticket content can be revised once Phase 03/05
reconstructs concrete scope from another source (a linked PR's comment thread, developer
clarification). Record the original and revised score, and why, in the plan file.

### Phase routing table

| Phase | HIGH | MEDIUM | LOW |
|---|---|---|---|
| 03 | Auto-confirm, skip review agent | Wait for OK | Full questions + review agent |
| 05 | 1 search agent | 2 search agents | 3 agents + deep trace |
| 06 | Inline plan, quick OK | Plan agent, approval | Plan agent + options + iterate |
| 08 | Linter + tone (A+E) | Linter + style + tone (A+B+E) | Full: A+B+C+D+E |
| 09 | Stat-only diff | Per-file diff | Full walkthrough + AC mapping |

### Fast-track mode

When ALL phases score HIGH (simple ticket — typo fix, config change, string update):

- Phases 03-06 compress: present ticket + plan together, single approval
- Phase 08: linter + tone only
- Phase 09: stat-only diff, quick approve
- Total: ~4 developer interactions instead of ~6

---

## Plan-Approve-Build Loop

Phases 05-09 form a loop:

```
    ┌────────────────────────────────────────────┐
    │                                            │
    ▼                                            │
  PLAN (05-06) ──approve──▶ BUILD (07-08) ──▶ REVIEW (09)
    ▲                           │                │
    │         architectural     │                │
    └──────── issue found ──────┘                │
    ▲                                            │
    └──────── "wrong approach" ──────────────────┘
```

### Re-entry rules

| Trigger | Re-enter at | Context |
|---|---|---|
| Phase 08 lint/style | Stay in 08, fix + revalidate | Fix list |
| Phase 08 architectural issue | **Phase 06** | Findings as constraints |
| Phase 09 "fix this line" | Stay in 09, fix, revalidate 08 | Dev feedback |
| Phase 09 "wrong approach" | **Phase 05** | Dev reasoning |
| Phase 09 new requirements | **Phase 06** | Updated ACs |

### Plan persistence

Each plan iteration is saved to `.claude/workticket/plans/{TICKET-ID}-v{N}.md`. This serves three purposes:

1. **Loop context** — when re-entering Phase 06, the agent sees what was tried before and why it failed
2. **Decision record** — why approach A was chosen over B
3. **Retro input** — Phase 12 can see how many plan iterations were needed

---

## Agents Overview

| Phase | Agent File | Type | Gated? |
|---|---|---|---|
| 03 | `agents/review-agent.md` | `general-purpose` | MEDIUM/LOW only |
| 05 | `agents/explore-agents.md` | `Explore` (x1-3) | Count scales with confidence |
| 06 | `agents/plan-agent.md` | `Plan` | MEDIUM/LOW only |
| 08A-C | `agents/validation-agents.md` | Mixed (x1-3) | Track count scales |
| 08E | `agents/tone-review-agent.md` | `general-purpose` | Always |
| 11 | `agents/tone-review-agent.md` | `general-purpose` | Always (commit msg + PR body) |
| 12 | `agents/retro-agent.md` | `general-purpose` | Always |

All agent prompts include: ticket ID, ticket summary, config-driven project context.

---

## Phase Overview

### SETUP
| # | Phase | Routing | Phase File |
|---|---|---|---|
| 01 | Preflight Check | Always AUTO | `phases/01-preflight.md` |
| 02 | Read Ticket | Always AUTO | `phases/02-read-ticket.md` |
| 03 | Present + Early Review | Gated | `phases/03-present-and-review.md` |

### PLAN (loop entry)
| # | Phase | Routing | Phase File |
|---|---|---|---|
| 04 | Create Branch | AUTO (first pass) | `phases/04-create-branch.md` |
| 05 | Analyze Codebase | Gated (agent count) | `phases/05-analyze.md` |
| 06 | Implementation Plan | Gated | `phases/06-plan.md` |

### BUILD (loop body)
| # | Phase | Routing | Phase File |
|---|---|---|---|
| 07 | Implement Changes | Always AUTO | `phases/07-implement.md` |
| 08 | Validate & Test | Gated (track count) | `phases/08-validate.md` |
| 09 | Developer Review | Gated (detail level) | `phases/09-dev-review.md` |

### SHIP (after loop exits)
| # | Phase | Routing | Phase File |
|---|---|---|---|
| 10 | Update Knowledge | Always AUTO | `phases/10-update-knowledge.md` |
| 11 | Create Draft PR | Sequential gates (GATE A: commit, GATE B: PR) | `phases/11-create-pr.md` |
| 12 | Workflow Retro | Always runs | `phases/12-retro.md` |

---

## Error Handling

- **Ticket system unavailable**: Fall back to manual paste
- **Linter fails**: Fix + retry up to 3 times
- **Git conflicts**: Stop, ask developer
- **No test command configured**: Skip testing, warn
- **Agent fails**: Report, continue with manual fallback
- **Missing config**: Run setup mode automatically
- **Config field empty**: Skip that feature, warn

---

## Notes

- Use `workticket setup` to configure dependencies for a new project
- Use `workticket setup reconfigure` to update an existing config interactively
- Project data (plans, history, lessons) lives in `.claude/workticket/` per repo
- Projects still on `.claude/alfred-code/` are migrated automatically on the next run
- The workflow engine (this skill) is global and project-agnostic
- If a code review skill is configured, it handles all review (not generic /code-review)
