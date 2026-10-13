# own-it

**A Claude Code skill that turns understanding your own codebase into a whiteboard game.**

AI writes a lot of our code now. It ships, it works, and a month later nobody on the team can explain how. `own-it` is built around the "whiteboard defense" idea: you should be able to explain any system you shipped, defend the decisions behind it, and say where it fails. You don't need to remember line numbers. You do need to know:

- "Why did you do X instead of Y?"
- "What happens if this actor behaves maliciously?"
- "What data structure did you use here, and why?"
- "Where does this fail?"

`own-it` reads your repo, splits it into **zones** (Auth, Trips, Payments…), and has you climb a ladder in each one:

| Rung | You… |
|---|---|
| 0 · Words | Learn the domain and UI vocabulary ("what is a *cable* on this lock, and why is it called that?") |
| 1 · Map it | Place every screen, route, and command in the zone and connect them |
| 2 · Trace it | Follow one action end to end across actors and apps, and defend its design decisions |
| 3 · Break it | Threat tokens land on the board (malicious user, double request, service down…). Mark where it breaks |
| 4 · Defend it | Boss: draw the zone from memory on a blank board, then answer a cross-examination |

You play on a local HTML **whiteboard** (drag cards, draw arrows, drop cards into swimlanes). Submit, and the page grades your board instantly: green for right, red ghosts for what you missed, crossed out for what's wrong. Every card links to the real `file:line` if you want to look. Claude narrates, asks the hard questions, and grades your written answers.

When code changes after you've claimed a zone, **fog** rolls back over it. A short refresh mission on what changed clears it.

## Principles

- **Read-only.** `own-it` never edits your source. It only writes inside `.own-it/`. If it spots a bug while you play, it tells you; it doesn't fix it.
- **Token-lean.** A zero-dependency Node helper does all the mechanical work (scanning, hashing, grading math, progress). Code reading is capped and cached per file. On the sample project, extracting a zone took about 7k tokens and a 5-mission climb about 7k.
- **Curiosity over shortcuts.** Hints cost XP. Asking "why?" after you answer earns XP.
- **Practice or Exam.** Practice gives hints and debriefs. Exam gives a report card per zone: *defensible*, *shaky*, or *blind spot*.

## Install

Copy the `own-it/` folder into your Claude Code skills directory:

```bash
cp -r own-it ~/.claude/skills/own-it
```

Requirements:

- Node.js 18 or newer. If it's missing, the skill offers to install a pinned LTS version from nodejs.org and verifies its checksum first.
- A desktop browser (Chrome, Edge, Firefox, Safari) for the whiteboard. Without one, the Words and Map rungs still run in chat.
- Git is optional. Without it, fog is turned off.

## Play

In any project, start a fresh or forked Claude Code session and run:

```
/own-it
```

or just ask "quiz me on my code". Claude will:

1. Check you're in a fresh session (the game adds a lot of context).
2. Scan the repo and propose zones for you to confirm.
3. Start you on the Words rung, then open the whiteboard for board missions.

Submitted answers download as `own-it-<mission>.json`; type **done** in chat and Claude picks them up from your Downloads folder.

Progress lives in `.own-it/` in your project. By default it's ignored by git; you can choose to commit it to share understanding coverage with your team.

## Repository layout

```
own-it/                 the skill (this is what you install)
  SKILL.md              entry point
  references/           phase-by-phase instructions Claude loads on demand
  scripts/own-it.mjs    helper CLI (init, scan, check-refs, fog, build-missions, collect, apply, open)
  assets/               game.html, core.js (shared grading), patterns.json (scan patterns)
  runtime.json          pinned Node version and installer checksums
tests/                  node:test suite for the helper and docs (npm test)
fixtures/trip-app/      sample app used for end-to-end runs
docs/superpowers/       design spec, implementation plan, and the Phase 1 run report
```

## Development

```bash
npm test
```

No dependencies to install. The suite covers every helper command, the grading engine, and the docs' word budgets.

## Status

Phase 1: component map and swimlane boards, the full game loop, fog, XP and badges.

Next:

- State machine and role matrix boards.
- The final whole-app boss.
- Multi-repo lanes.
