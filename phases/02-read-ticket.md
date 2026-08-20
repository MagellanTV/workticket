# Phase 02 — Read Ticket `AUTO`

Extract structured information from the ticket.

## Adapter selection

Based on `{config.ticket_system.provider}`:
- **jira**: See `integrations/jira.md` for the full curl command and ADF parsing
- **github-issues**: `gh issue view {ISSUE-NUMBER} --json title,body,labels,assignees,milestone,state`

## Fields to extract

| Field | Required | Notes |
|---|---|---|
| Title | Yes | |
| Type | Yes | bug/feature/task/enhancement |
| Description | Yes | Parse from ADF (Jira), Markdown (GitHub Issues) |
| Acceptance Criteria | Yes | Inside description, under "AC" heading or task lists |
| Priority | No | |
| Milestone / Fix Version | No | |
| Linked Issues | No | |
| Attachments | No | |
| Status | No | |
| Comments | No | May contain clarifications |

## Via manual paste (fallback)

If API is unavailable, tell the developer:

"I couldn't access the ticket system via API. Please paste the ticket content here — I need at minimum: title, type (bug/feature/task), and acceptance criteria."

Parse their pasted text to extract the same fields. Ask clarifying questions if title, type, or ACs are missing.

## Empty or placeholder-only description

The API can return `200` with a `description` field that parses but is empty or just a placeholder
heading. Treat this the same as API unavailable — ask the developer directly: "This ticket has no
real description. Is there a related PR, comment thread, or screenshot that has the actual scope?"

## Output

Store the extracted data as a structured object for use in subsequent phases.
