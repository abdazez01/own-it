# Onboarding (every session, in order)

## 1. Fork check (never skipped)

Question: "own-it reads a lot of code and adds many messages. A forked or fresh session keeps your work context clean. Is this a fork?"
- **Yes, this is a fork / fresh session (Recommended)** → continue.
- **No, I'll fork first** → say how (start a new session, or use your client's fork or branch option if it has one), then stop.
- **No, play here anyway** → continue.

Asked to skip it? Ask once, one line; accept "play here".

## 2. Runtime check

Run `node --version`. Missing or below `<skill-dir>/runtime.json` `minimum`? Ask (`pinned` includes the `v`; size from `installers.<win-x64|darwin|linux-x64>`):

> own-it needs Node.js for its helper script, which keeps the game cheap on tokens. Node is not installed (or is too old).
> - **Install Node.js <pinned> (Recommended)**: official installer from nodejs.org, about <sizeMB> MB. Claude downloads it, verifies the SHA-256 checksum, and runs the installer. The installer may ask for your admin approval.
> - **Not now**: own-it stops. Install Node yourself from nodejs.org, then run /own-it again.

`winget`/`brew` present? Offer it, same version.

- Download only the `runtime.json` URL.
- `sha256` must match before running. Mismatch: delete, stop, tell the user.
- Then re-run `node --version`.
- "Not now": print "own-it needs Node. Install it from nodejs.org, then run /own-it again." and stop.

## 3. Safety notice (once per session)

"own-it is read-only. It never edits your source. Test files are only written after you approve each one."

## 4a. First run (no `.own-it/progress.json`)

1. `scan` → surface candidates with refs. Group them into zones (subsystems; ids `a-z0-9-`, max 24 chars).
2. Ask to confirm, rename, or merge; list zones and paths in the question.
3. Ask: **Gitignore `.own-it/`, personal stats (Recommended)** / **Commit it, team-visible coverage**.
4. Write `.own-it/zones.json` (`examples.md`), run `init --zones .own-it/zones.json`, plus `--git-tracked` if they chose commit. Re-init without it turns tracking off: always repeat it when tracked.

## 4b. Later runs

`fog` → per zone `rungs` (words map trace break boss: `c` cleared, `o` open, `-` locked), `fogged`, `stale`. Status: one line. `git: false` → say once fog is disabled.

## 5. Mode

Ask: **Practice: hints, debriefs (Recommended)** / **Exam: no hints, report card at the end**.

## 6. Target

Ask zone and rung. Recommend: fogged zone (refresh), then weak spot, then next open rung.
