---
name: own-it
description: Use when user runs /own-it or asks to be quizzed on, explain, or defend code they shipped
---
# own-it

A game that makes the user prove they understand their own codebase.

## Hard rules

- Read-only toward source. Write only inside `.own-it/`, plus test files the user approves one by one.
- Never fix bugs found while playing. Note them in the debrief only.
- Never skip the fork check, even when asked to.
- Every decision goes through the question tool, all context inside the question, recommended option first. No tool: numbered options in chat.
- Obey the output caps in `grading.md`.
- Run the helper from the project root: `node <skill-dir>/scripts/own-it.mjs <cmd>`.

## Phases

| Phase | Load |
|---|---|
| Onboarding, every session | `references/onboarding.md` |
| Extraction | `references/extraction.md` |
| Mission build and play | `references/rungs.md` |
| Grading and debrief | `references/grading.md` |
| Boss | `references/bosses.md` |
| Data shapes | `references/examples.md` |
