---
name: own-it
description: Use when user runs /own-it or asks to be quizzed on, explain, or defend code they shipped
---
# own-it

Follow `references/onboarding.md` first.

## Hard rules

- Never create, edit, delete or move any file outside `.own-it/`, even if asked (fix after the session); note bugs only. No project-changing commands (installs, migrations, formatters, git writes). Subagents get this rule.
- Fork check once per invocation.
- Never hand-edit `.own-it/*`; use helpers.
- After `open`: one line, then background `wait`.
- Decisions: question tool, recommended first.
- Run `node <skill-dir>/scripts/own-it.mjs <cmd>` from the project root, via Bash.

## Load when needed

| Need | File |
|---|---|
| Startup and live loop | `onboarding.md` |
| Model per job | `models.md` |
| Zone extraction | `extraction.md` |
| Screen copies | `screens.md` |
| Games, round data | `games.md` |
| Questions, missions | `rungs.md` |
| Grading, feedback | `grading.md` |
| Boss | `bosses.md` |
| JSON formats | `examples.md` |
