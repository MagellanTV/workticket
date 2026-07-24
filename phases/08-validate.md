# Phase 08 — Validate & Test `GATED + AGENTS + LOOP`

Validation depth scales with confidence. Reads commands from `.claude/alfred-code/config.md`.

## Confidence routing

| Score | Tracks |
|---|---|
| HIGH | Track A + E (if configured) |
| MEDIUM | Tracks A + B + E |
| LOW | Tracks A + B + C + D + E |

Track E (human tone check) always runs, on every confidence level.

## Track A — Linter

Only runs if `{config.linter.command}` is set.

```bash
{config.linter.command}
```

If `{config.linter.fix_command}` exists, auto-fix before re-checking.

## Track B — Style checks

Runs each entry in `{config.linter.style_checks}`:

```bash
# For each check in config:
{check.command}  # with {base} replaced by config.project.base_branch
```

IMPORTANT: if changes are NOT committed yet (normal case — Phase 08 runs before Phase 11
commits), `git diff {base}...HEAD` is EMPTY. Use plain `git diff` (working tree) instead.

## Track C — Code review

If `{config.code_review.skill_name}` is configured:
- Spawn agent using `agents/review-agent.md`
- Agent loads the configured skill and its `{config.code_review.review_references}`
- Reviews `git diff {base_branch}...HEAD` for correctness, architecture, patterns

If no review skill configured:
- Use generic code review: check for obvious bugs, null access, logic errors

## Track D — Tests

Based on `{config.build_test.test_type}`:

### `local`
```bash
{config.build_test.test_command}
```

### `device`
```bash
{config.build_test.sideload_command}
# wait, then:
{config.build_test.health_check}
```

### `none`
Skip, warn in report.

## Track E — Human tone check

See `agents/tone-review-agent.md`. Always runs. Reviews ALL new/changed text: code comments,
inline strings, error messages, log messages, documentation.

1. Run the tone-review-agent on the full `git diff` output
2. If findings: fix each one directly in the code (apply the suggested replacement)
3. Re-run tone-review-agent on the fixed diff to verify — max 2 fix cycles
4. AI attribution is a hard block — do not proceed to Phase 09 until removed

## Fix cycle

1. Classify findings: lint/style -> fix in place; architectural -> trigger re-entry to Phase 06
2. Fix, re-run failed tracks (max 3 cycles)
3. Report consolidated results

## Loop re-entry

If Track C finds architectural issues:
1. Report to developer
2. Ask: "Re-plan (Phase 06) or fix in place?"
3. If re-plan: carry findings as constraints

## Consolidated report

```
## Validation Results (Confidence: {score})

### Linter (Track A): PASS/FAIL/SKIPPED
### Style (Track B): PASS/FAIL/SKIPPED
### Code Review (Track C): PASS/FAIL/SKIPPED
### Tests (Track D): PASS/FAIL/SKIPPED
### Human Tone Check (Track E): PASS/FAIL

### Fix iterations: {N}
### Loop re-entry triggered: yes/no
```
