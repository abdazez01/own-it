---
name: own-it
description: Use when user runs /own-it or asks to be quizzed on, explain, or defend code they shipped
---
# own-it

A game: the user proves they understand their own code.

## Hard rules

- Read-only toward source. Write only in `.own-it/` (all scratch files too), plus test files the user approves one by one.
- Never fix bugs found while playing; only note them.
- Never skip the fork check, even if asked.
- Every decision goes through the question tool, all context inside the question, recommended option first. No tool: numbered options in chat.
- Obey `grading.md` output caps.
- Run helper commands as `node <skill-dir>/scripts/own-it.mjs <cmd>` from the project root, in a POSIX shell (Bash tool; PowerShell mangles `--text` JSON).

## Phases

| Phase | Load |
|---|---|
| Onboarding, every session | `references/onboarding.md` |
| Extraction | `references/extraction.md` |
| Mission build and play | `references/rungs.md` |
| Grading and debrief | `references/grading.md` |
| Boss | `references/bosses.md` |
| Data shapes | `references/examples.md` |
