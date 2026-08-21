# Phase 04 — Create Branch `AUTO`

## Branch naming

Read the pattern from `{config.branch_naming.pattern}`. The default is
`{type}/{ticket}-{description}`, which produces:

```
feature/VRT-6070-create-my-list-screen
fix/VRT-6780-error-parameter-custom-data-event
hotfix/VRT-6781-critical-login-bug
```

Everything after `type/` is a single segment: the ticket and the description are joined by a
hyphen, not a slash. `feature/VRT-6070/create-my-list-screen` is wrong.

Replace tokens:

| Token | Value |
|---|---|
| `{type}` | map the ticket type through `{config.branch_naming.type_mapping}` |
| `{ticket}` | ticket ID exactly as the tracker shows it, including case (`VRT-6070`) |
| `{description}` | 3-6 key words from the title, lowercase, hyphen-separated |
| `{username}` | `git config user.name`, formatted per `{config.branch_naming.username_format}` — only if the pattern uses it |

### Description rules

- **English only**, even when the ticket is written in another language. Translate the key
  terms rather than transliterating them.
- Lowercase, words separated by hyphens, no other punctuation.
- Describe the change, not the ticket's phrasing: drop filler like "implement", "add support
  for", "issue with".
- Keep the whole branch name under roughly 60 characters. If the title is long, cut words from
  the end of the description rather than abbreviating them into something unreadable.

### Type mapping

The default mapping collapses several ticket types onto `feature/`, which is intended — features,
stories, tasks and enhancements all use it. Only bug fixes get `fix/`.

`hotfix/` is for critical production fixes. Use it when the tracker's own type says hotfix, or
when the developer says this is one — never from the ticket type alone, since a bug that reads
as urgent is still a `fix/` unless someone confirms it is going straight to production. If a bug
looks like it might be a hotfix, ask.

### Release branches

`release/` branches are named for the version, not a ticket — `release/5.4`. They fall outside
the pattern entirely. If the ticket is release preparation, confirm the version with the
developer and use `release/{version}`; do not force a ticket ID into it.

## Username formatting

Only applies when `{username}` appears in the pattern, which the default does not.

| Config value | Input | Output |
|---|---|---|
| `camelCase` | "Juan Manuel" | "JuanManuel" |
| `kebab-case` | "Juan Manuel" | "juan-manuel" |
| `as-is` | "Juan Manuel" | "Juan Manuel" |

## Commands

```bash
git checkout {config.project.base_branch}
git pull origin {config.project.base_branch}
git checkout -b {branch-name}
```

Report the branch name to the developer.
