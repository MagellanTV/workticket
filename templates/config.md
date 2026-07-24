# Alfred-code — Project Configuration

Fill this file when setting up alfred-code in a new project. The workflow reads all
project-specific values from here.

---

## Project

```yaml
name: ""                        # e.g. "My App", "Backend API"
language: ""                    # e.g. TypeScript, Python, BrightScript, Go
framework: ""                   # e.g. React, Next.js, Django, SceneGraph
repo_type: "single-package"     # monorepo | single-package
base_branch: "main"             # branch PRs target (main, develop, master)
```

## Branch naming

```yaml
pattern: "{type}/{username}/{ticket}/{description}"
# Available tokens: {type}, {username}, {ticket}, {description}
type_mapping:
  bug: "bugfix"
  story: "feature"
  task: "task"
  enhancement: "feature"
  default: "task"
username_format: "kebab-case"   # camelCase | kebab-case | as-is
```

## Ticket system

```yaml
provider: ""                    # jira | linear | github-issues
base_url: ""                    # e.g. https://mycompany.atlassian.net (Jira only)
auth_method: "api-token"        # api-token | browser | manual
env_vars:
  url: "JIRA_BASE_URL"          # Jira only
  email: "JIRA_USER_EMAIL"      # Jira only
  token: "JIRA_API_TOKEN"       # Jira: API token | Linear: LINEAR_API_KEY
```

## Code review skill

```yaml
skill_name: ""                  # e.g. "my-review-skill" — leave empty if none
skill_path: ""                  # e.g. "~/.claude/skills/my-review-skill/SKILL.md"
review_references: []           # files the review agent should load
#  - "references/standards.md"
#  - "references/architecture.md"
```

## Linter / static analysis

```yaml
command: ""                     # e.g. "npm run lint", "ruff check ."
fix_command: ""                 # e.g. "npm run lint --fix" — leave empty if no auto-fix
style_checks:                   # custom grep/awk checks to run on diff
  []
#  - name: "trailing whitespace"
#    command: "git diff | grep -nE '^\\+.*[ \\t]+$'"
```

## Build & test

```yaml
build_command: ""               # e.g. "npm run build"
test_command: ""                # e.g. "npm test", "pytest"
test_type: "local"              # local | device | none
device_verify:
  enabled: false                # true if testing requires a physical device
  sideload_command: ""          # e.g. "adb install app.apk"
  health_check: ""              # e.g. "curl http://localhost:8080/health"
```

## PR template

```yaml
template_path: ".github/pull_request_template.md"  # path relative to repo root
checklist_auto_check: []        # items to pre-check (by substring match)
labels_mapping:
  bug: ["bug"]
  feature: ["feature", "enhancement"]
path_labels: {}                 # auto-label based on file paths changed
#  "src/api/": ["api changes"]
#  "src/components/": ["frontend"]
draft_by_default: true
```

## Knowledge base

```yaml
graphify_enabled: false         # true if project uses graphify
graphify_rebuild: ""            # command to rebuild graph after code changes
codebase_search: "grep"         # graphify | grep — fallback search method
claude_md_path: "CLAUDE.md"     # path to project CLAUDE.md
```

## Changelog

```yaml
enabled: true                     # false to skip changelog generation
file: "CHANGELOG.md"              # path to changelog file (relative to repo root)
version_source: "auto"            # auto | package.json | pom.xml | build.gradle | manifest | pyproject.toml | custom
version_command: ""               # only if version_source is "custom" — e.g. "cat VERSION"
format: "keep-a-changelog"        # keep-a-changelog | simple | custom
# keep-a-changelog: groups by Added/Changed/Fixed/Removed under version header
# simple: flat list of changes under version header
# custom: freeform, just appends entry
```

## Git preferences

```yaml
auto_commit: false              # true = commit after dev review approval
auto_push: false                # true = push after commit
commit_format: "[{ticket}] - {description}"
co_author: false                # true = add Co-Authored-By trailer
```
