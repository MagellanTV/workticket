# Phase 04 — Create Branch `AUTO`

## Branch naming

Read pattern from `{config.branch_naming.pattern}`.

Replace tokens:
- `{type}` — map from `{config.branch_naming.type_mapping}` using ticket type
- `{username}` — `git config user.name`, formatted per `{config.branch_naming.username_format}`
- `{ticket}` — ticket ID as-is
- `{description}` — 3-5 key words from title, kebab-case

## Username formatting

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
