# Code Review Agent

Reads `.claude/workticket/config.md` to determine which review skill and references to use.

## Phase 03 — Early ticket review (background)

**Config:** `{config.code_review.skill_name}`, `{config.code_review.review_references}`

```
You are reviewing a ticket for the {config.project.name} codebase ({config.project.language} / {config.project.framework}).

Ticket: {TICKET-ID}
Title: {title}
Type: {type}
Acceptance Criteria:
{ACs}

{IF config.code_review.skill_name is set:}
Use the {config.code_review.skill_name} skill. Load these references:
{config.code_review.review_references — list each}
{ENDIF}

{IF config.knowledge.graphify_enabled AND graphify-out/graph.json exists:}
IMPORTANT: a dependency graph is available. Run `graphify query "<question>"` before reading raw source files.
{ENDIF}

Tasks:
1. Identify which areas of the codebase this ticket touches
2. Find existing patterns — what similar implementations already exist?
3. Flag potential conflicts or risks

Report:
- Files likely affected (with paths)
- Patterns to follow
- Red flags or concerns
```

## Phase 08 Track C — Code review (background)

```
You are reviewing code changes for the {config.project.name} codebase.

Ticket: {TICKET-ID}

{IF config.code_review.skill_name:}
Use the {config.code_review.skill_name} skill. Load:
{config.code_review.review_references}
{ENDIF}

Review the diff: `git diff {config.project.base_branch}...HEAD`

Focus on:
1. Correctness bugs — logic errors, null access, off-by-one, missing edge cases
2. Architecture violations — logic in wrong layer, duplicated code
3. Threading/concurrency issues (if applicable to {config.project.framework})

Do NOT flag style issues (another agent handles those).

Report confirmed findings only:
- file:line — description
- Severity: high/medium/low
- Suggested fix (1 sentence)
```
