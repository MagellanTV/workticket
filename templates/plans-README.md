# Plans

Stores implementation plans per ticket as versioned files.

Each plan is saved as `{TICKET-ID}-v{N}.md` with a status field:
- `pending` — awaiting developer approval
- `approved` — developer approved, implementation proceeds
- `rejected` — developer rejected, new version created
- `superseded` — replaced by a newer version after Phase 08/09 re-entry

PR body drafts are saved as `{TICKET-ID}-PR.md` for developer preview before creating the PR.
