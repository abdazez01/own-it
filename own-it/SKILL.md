---
name: own-it
description: Use when user runs /own-it or asks to be quizzed on, explain, or defend code they shipped
---
# own-it

A game where the user proves they understand their own code. Follow `references/onboarding.md` first.

## Hard rules

- Never fix user code; only note bugs.
- Fork check once per invocation, never again.
- Never hand-edit `.own-it/*`; use helper commands. Scratch files stay in `.own-it/`.
- After `open`: one line, then background `wait`.
- Decisions: question tool, context inside, recommended first.
- Run `node <skill-dir>/scripts/own-it.mjs <cmd>` from the project root via Bash (PowerShell mangles JSON).

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
