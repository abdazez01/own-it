<p align="center">
  <img src="docs/media/banner.jpg" alt="own-it: Your AI wrote it. Can you defend it?" width="100%">
</p>

<p align="center">
  <b>A Claude Code skill that turns your own codebase into games.</b><br>
  Play them to prove you can explain, trace and defend the code your AI wrote.
</p>

<p align="center">
  <img alt="Claude Code skill" src="https://img.shields.io/badge/Claude%20Code-skill-E8C26A?style=flat-square&labelColor=1A1B1F">
  <img alt="18 games" src="https://img.shields.io/badge/games-18-8FD3A8?style=flat-square&labelColor=1A1B1F">
  <img alt="Node 18+" src="https://img.shields.io/badge/node-%E2%89%A518-5A7BA8?style=flat-square&labelColor=1A1B1F">
  <img alt="MIT license" src="https://img.shields.io/badge/license-MIT-E8C26A?style=flat-square&labelColor=1A1B1F">
  <img alt="Zero dependencies" src="https://img.shields.io/badge/dependencies-0-F5F3EE?style=flat-square&labelColor=1A1B1F">
</p>

<p align="center">
  <a href="docs/media/own-it-promo.mp4">
    <img src="docs/media/own-it-preview.gif" alt="own-it in 20 seconds: split-flap hook, a quiz, a quest on a copied app screen, and the 18-game library" width="88%">
  </a>
  <br>
  <sub>▶ <a href="docs/media/own-it-promo.mp4">Watch the 20-second video with sound</a></sub>
</p>

---

## Why

AI writes a lot of our code now. It ships, it works, and a month later nobody can explain how. own-it is built on the "whiteboard defense" idea: you should be able to explain any system you shipped, defend the decisions behind it, and say where it fails.

You don't need to remember line numbers. You do need to answer:

- *Who is allowed to do this, and why?*
- *What happens when this service is down at 3am?*
- *Why this design and not the obvious alternative?*

own-it reads your repo, splits it into **zones** (Trips, Payments, Auth…), and builds games from what it finds: your app's own words, flows, roles and screens.

## How it plays

```
/own-it
```

1. **One check.** Claude asks once whether this is a fresh or forked session, because the game reads a lot of code.
2. **One notice.** Everything own-it creates goes in `.own-it/` inside your project. Delete that folder and it's all gone.
3. **Your dashboard opens.** It's a local page with games picked for *your* app. The page talks to Claude through a live link on your own machine (127.0.0.1 only).
4. **Pick a game, pick a level.** Claude builds the round and the page plays it. You get a score, XP and a debrief, and Claude grades anything you type.

<table>
  <tr>
    <td width="33%"><img src="docs/media/screen-quiz.jpg" alt="Quiz: who can approve a cancellation?"></td>
    <td width="33%"><img src="docs/media/screen-quest.jpg" alt="Quest on a rebuilt copy of the app's trip screen"></td>
    <td width="33%"><img src="docs/media/screen-games.jpg" alt="The 18-game library"></td>
  </tr>
  <tr>
    <td align="center"><sub><b>Quiz</b>: about your product, not code trivia</sub></td>
    <td align="center"><sub><b>Quests</b>: on copies of your own screens</sub></td>
    <td align="center"><sub><b>18 games</b>, built from your code</sub></td>
  </tr>
</table>

### Levels

Each time you open a game, you choose how deep it goes:

| Level | For you if… | Hints |
|---|---|---|
| **Easy** | you don't know the program at all | free |
| **Medium** | you know some parts | 15 XP |
| **Hard** | you know it inside out (starts in Exam mode) | 30 XP |
| **Impossible** | you want an all-out test of rare behaviour: retries, timeouts, partial failures | off, timer on |
| **Other** | you describe what you know, e.g. *"I built checkout, never touched admin"* | matched to the closest level |

**Practice** gives hints and debriefs. **Exam** gives a report card per zone: *defensible*, *shaky* or *blind spot*.

## The games

Each zone has a ladder: **Words → Map → Trace → Break → Boss**. Claim every rung to own the zone. When the code changes later, **fog** rolls back over it until you replay what changed.

| | Game | Rung | What you do |
|:-:|---|---|---|
| <img src="docs/media/games/quiz.svg" width="32"> | **Quiz** | Words | Answer five questions about the words your product uses. |
| <img src="docs/media/games/memory-match.svg" width="32"> | **Memory Match** | Words | Flip cards to pair each term with what it means in your app. |
| <img src="docs/media/games/spot-the-lie.svg" width="32"> | **Spot the Lie** | Words | Read five statements about a zone and find the false one. |
| <img src="docs/media/games/whiteboard.svg" width="32"> | **Whiteboard Map** | Map | Draw the arrows between the parts of your app from memory. |
| <img src="docs/media/games/screen-tour.svg" width="32"> | **Screen Tour** | Map | Pick what a screen does, where you find it, or who sees it. |
| <img src="docs/media/games/guess-the-screen.svg" width="32"> | **Guess the Screen** | Map | A screen blurs, then slowly sharpens. Name it before it clears. |
| <img src="docs/media/games/blast-radius.svg" width="32"> | **Blast Radius** | Map | Break one part, then click everything else that breaks with it. |
| <img src="docs/media/games/quests.svg" width="32"> | **Quests** | Trace | Walk a real flow across your screens and roles, one step at a time. |
| <img src="docs/media/games/chain-reaction.svg" width="32"> | **Chain Reaction** | Trace | Click each step in order before the fuse burns out. |
| <img src="docs/media/games/data-detective.svg" width="32"> | **Data Detective** | Trace | Stamp each status on a record's timeline and name who moved it. |
| <img src="docs/media/games/pipe-plumber.svg" width="32"> | **Pipe Plumber** | Trace | Rotate tiles until a button's request reaches the database. |
| <img src="docs/media/games/whos-allowed.svg" width="32"> | **Who's Allowed?** | Trace | Decide fast who may do each action, and build a streak. |
| <img src="docs/media/games/pager.svg" width="32"> | **3am Pager** | Break | An alarm goes off. Find the step that broke first, on the clock. |
| <img src="docs/media/games/what-if.svg" width="32"> | **What-If Dial** | Break | Turn up traffic or timeouts and predict what fails first. |
| <img src="docs/media/games/design-duel.svg" width="32"> | **Design Duel** | Break | Pick the design you'd ship and the real reason it beats the other. |
| <img src="docs/media/games/boss-battle.svg" width="32"> | **Boss Battle** | Boss | Answer well to hit the boss. Three wrong answers and you lose. |
| <img src="docs/media/games/escape-room.svg" width="32"> | **Escape Room** | Boss | Solve three puzzles about roles, flows and failures to open the door. |
| <img src="docs/media/games/teach-back.svg" width="32"> | **Teach-back** | Bonus | Explain one of your screens to a product manager in two sentences. |

Most games play from the keyboard, and the dashboard has sound effects, confetti and chill ambient music, which you can mute.

## Principles

- **Never edits your code.** own-it writes only inside `.own-it/`, even if you ask it to fix something mid-game. If it spots a bug, it tells you.
- **Screens are safe copies.** Quests run on sanitized rebuilds of your screens with fake data. They have no login, no backend and no scripts, and run in a locked-down frame.
- **Token-lean.** A zero-dependency Node helper does the mechanical work: scanning, validation, grading math and progress. Claude writes only the round data. Cheap jobs go to Haiku, extraction to Sonnet, with at most 2 helper agents at once.
- **Spoiler-safe.** Answers are hidden in the page data and only revealed when you act.

## Install

Requirements: [Claude Code](https://claude.com/claude-code), Node.js 18+, and a desktop browser. If Node is missing, the skill offers to install a pinned LTS version and checks its checksum first.

Clone the repo and copy the `own-it/` folder into your Claude Code skills directory:

```bash
git clone https://github.com/abdazez01/own-it.git
cp -r own-it/own-it ~/.claude/skills/own-it
```

Then, in any project, start a fresh or forked session and run `/own-it`, or just say *"quiz me on my code"*.

Progress lives in `.own-it/` in your project. It's gitignored by default, but you can commit it to share coverage with your team.

## Repository layout

```
own-it/                 the skill (this is what you install)
  SKILL.md              entry point
  references/           instructions Claude loads only when needed
  scripts/own-it.mjs    zero-dependency helper CLI
  assets/               dashboard, engine, 18 game templates, brand
tests/                  node:test suite (npm test)
fixtures/               sample app for end-to-end runs
docs/                   design specs, plans, run reports, media
```

## Development

```bash
npm test
```

No dependencies to install. The suite covers every helper command, the browser engine (on a fake DOM), all 18 games, security rules, layout and the docs' word budgets.

## License

[MIT](LICENSE) © abdazez01
