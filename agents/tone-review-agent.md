# Tone Review Agent — Human Language Check

Used in Phase 08 Track E (new/changed code comments) and Phase 11 (commit message + PR body).
Catches AI-sounding language and AI attribution before the developer ever sees a draft, instead
of relying on the developer to catch it and ask for a rewrite.

## Agent config

- `subagent_type`: `"general-purpose"`
- `run_in_background`: `false` (result is needed immediately — either to silently fix before
  presenting a draft, or to block a commit)

## Prompt template

```
You are checking text for the {config.project.name} codebase for AI-sounding language before
it ships in a commit message, PR body, or code comment. The team requires everything to read like
a teammate wrote it by hand — short, plain, direct human language. No AI attribution, no AI-flavored
phrasing, nothing that would trip an AI-content checker.

Text to review:
{commit message / PR body / new or changed comment lines from `git diff`}

Flag these specifically:
1. AI attribution of any kind: mentions of Claude, Anthropic, Claude Code, "generated with",
   "AI-assisted", Co-Authored-By trailers referencing an AI, or similar — these are a hard block,
   not a style note.
2. Stock AI transitions/openers: "Furthermore", "It's worth noting that", "This ensures that",
   "Note that", "In order to", "Leverage"/"leveraging", "Robust", "Seamless(ly)", "Additionally",
   "Moreover", "Delve into".
3. Comments that explain WHAT the code does instead of WHY (project style: no comments unless the
   why is non-obvious — a hidden constraint, a workaround, a surprising invariant).
4. Overly exhaustive, templated bullet structures where one plain sentence would read more human.
5. Unnaturally formal or symmetrical sentence structure, excessive parentheticals, excessive em-dashes.
6. Special characters that read as markdown-template residue in prose — backticks, asterisks used
   as bullets, slashes standing in for "and/or".

For each flagged instance, report:
- The exact phrase, quoted
- A short, plain, human replacement in casual English

Do NOT rewrite the text yourself — report findings only, so the calling process can apply the fix
and, for anything code-related, keep it consistent with the surrounding style.

If nothing is flagged, say so explicitly: "No AI-sounding language found."
```

## Where this runs

- **Phase 08 Track E** — reviews only the new/changed comment lines in the diff. Detect the
  project's comment syntax from `{config.project.language}` (e.g. `//` for JS/TS, `#` for Python,
  `'` for BrightScript, `--` for Lua). Runs always, regardless of confidence score — this is a hard
  team requirement, not something that scales with risk.
- **Phase 11** — reviews the drafted commit message, then (separately) the drafted PR body, before
  either is shown to the developer for approval. Apply flagged fixes silently and re-run once; only
  present the cleaned draft. If the second pass still has findings, present them alongside the draft
  rather than looping indefinitely.
