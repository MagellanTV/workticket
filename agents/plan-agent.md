# Plan Agent — Phase 06

Designs the implementation plan with full architecture context, isolated from exploration noise.

## Agent config

- `subagent_type`: `"Plan"`
- `run_in_background`: `false` (need results before presenting to developer)

## Prompt template

```
Design an implementation plan for this ticket.

## Project
- Name: {config.project.name}
- Language: {config.project.language}
- Framework: {config.project.framework}

## Ticket
- ID: {TICKET-ID}
- Title: {title}
- Type: {type}
- Acceptance Criteria:
  {ACs}

## Analysis (from codebase exploration)
{Synthesized analysis from Phase 05 — files, patterns, risks, dependencies}

## Constraints
{Any project-specific constraints from config, CLAUDE.md, or code review skill references}

## Design the plan

### Approach
{1-2 sentence summary of the implementation strategy}

### Steps
1. [File: {exact path}] — {what changes and why}
2. [File: {exact path}] — {what changes and why}
...

### Files to modify
- {path} — {brief reason}

### Files to create (if any)
- {path} — {what it contains}

### Risks
- {specific risks based on the analysis}

### Questions for dev
- {anything unclear that could change the approach}

Be specific with file paths. Reference existing patterns from the analysis.

{IF re-entry:}
## Previous plan context
Previous plan (v{N-1}) was {rejected/superseded} because: {reason}
Avoid repeating: {what didn't work}
New constraints: {findings from Phase 08 or dev feedback}
{ENDIF}
```
