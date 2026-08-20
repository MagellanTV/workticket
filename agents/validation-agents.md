# Validation Agents — Phase 08

Parallel agents for code validation + sequential test verification + human tone check.
Track count scales with confidence. All read commands from `.claude/workticket/config.md`.

## Track A — Linter

Only if `{config.linter.command}` is configured.

**Agent config:**
- `subagent_type`: not specified (default)
- `run_in_background`: `true`

```
Run the project linter:
  {config.linter.command}

Report ONLY errors (not warnings), with file:line for each.
If the command fails, report the error output.
```

## Track B — Style checks

Only if `{config.linter.style_checks}` has entries.

**Agent config:**
- `subagent_type`: not specified (default)
- `run_in_background`: `true`

```
Run these style checks on the git diff against {config.project.base_branch}:

IMPORTANT: if changes are NOT committed yet (normal case — Phase 08 runs before Phase 11
commits), `git diff {base}...HEAD` is EMPTY. Use plain `git diff` (working tree) instead;
only use `{base}...HEAD` when validating after a commit exists.

{for each check in config.linter.style_checks:}
{N}. {check.name}:
   {check.command}
{endfor}

Report all violations with exact line content.
If no violations: "All style checks passed".
```

## Track C — Code review

See `agents/review-agent.md` Phase 08 section. Uses `{config.code_review.skill_name}` if configured.

## Track D — Tests (sequential, after fix cycle)

Not an agent — runs directly in the main loop after Tracks A-C are resolved.

Based on `{config.build_test.test_type}`:

### local
```bash
{config.build_test.test_command}
```
Report pass/fail with failure details.

### device
```bash
{config.build_test.sideload_command}
# wait, then:
{config.build_test.health_check}
```
Report build + deploy + health results.
If no device available or deploy fails: report as warning, don't block.

### none
Skip, note in report.

## Track E — Human tone check

See `agents/tone-review-agent.md`. Always runs, regardless of confidence score.

**Agent config:**
- `subagent_type`: `"general-purpose"`
- `run_in_background`: `false`

Scope: new/changed comment lines only, not the full diff. Detect comment syntax from
`{config.project.language}` (e.g. `//` for JS/TS, `#` for Python, `'` for BrightScript).

Any AI attribution found is a hard block — fix immediately, don't just warn. Style-only findings
(stock AI phrasing, WHAT-not-WHY comments) get fixed in place same as a lint finding.
