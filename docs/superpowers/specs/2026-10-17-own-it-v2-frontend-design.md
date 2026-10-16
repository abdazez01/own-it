# own-it v2 — Frontend Design Spec

Date: 2026-10-17
Status: Draft, awaiting user approval
Parent spec: `2026-10-17-own-it-v2-design.md` (product, flow, games, data). This document owns everything the player sees and hears.
Reference mockup, the approved direction (not final UI): `docs/superpowers/mockups/2026-10-17-dashboard-direction.html` (artifact version 13).
Built with: `design-taste-frontend` and `frontend-design` guidance, applied at design time and again during the build.

---

## 0. Design read

**Reading this as:** a game dashboard and arcade for developers, played locally next to their own codebase. The visual language is a **live split-flap departures board seen through frosted glass**. It is dark only, calm but alive, with tactile sound on everything.

**Dials** (taste skill):

| Dial | Value | Why |
|---|---|---|
| `DESIGN_VARIANCE` | 6 | The board metaphor needs order (rows, columns). Variance lives in the recommended row, game layouts, and the glass. |
| `MOTION_INTENSITY` | 7 | The user explicitly wants flaps and glass animated, plus sound and music. Every motion has a job (section 2.7). |
| `VISUAL_DENSITY` | 5 | The dashboard is scanned, not read. It sits between daily app and cockpit. |

**The one bold thing:** the split-flap board, meaning the flipping tiles, the clack, and the departures-board rows. Everything else stays quiet so the board carries the identity. That includes the glass, the type, the cards, and the music.

**Honesty notes:**
- The glass is a web approximation of frosted or "liquid" glass (`backdrop-filter`, layered borders, highlights). It is not Apple's Liquid Glass.
- Monospace and uppercase appear **only inside flap tiles**, where they are the subject's real vernacular (departure boards are uppercase mono). Everywhere else the UI uses sentence case and a sans family. This avoids the generic "mono caps label" tell.

---

## 1. Principles

1. **The board is the brand.** Any number, status, title, or score that can change is shown on flap tiles and changes with a flip.
2. **Glass is the stage, not the actor.** Panels are frosted, quiet, and readable. Life behind them comes from the drifting tile field.
3. **Everything answers the hand.** Every press, hover, toggle, correct answer, and wrong answer gives visual and audio feedback within 16 ms.
4. **Developers live in the dark.** The UI is dark only, never pure black or pure white, and all text passes WCAG AA on its darkest backing.
5. **Calm by default, exciting on success.** Idle motion is slow and silent. Big moments (correct, clear, claim, quest done) get confetti, a fanfare, and flaps.
6. **Plain words.** UI copy uses sentence case, active voice, and no em dashes. Flap tiles may use uppercase.

---

## 2. Tokens

All tokens live in `assets/engine/tokens.css` as CSS custom properties on `:root`. The page sets `color-scheme: dark` and has no light theme. It ignores the host's light setting.

### 2.1 Color ("Graphite gold")

| Token | Hex / value | Role |
|---|---|---|
| `--night` | `#111214` | page background |
| `--tile` | `rgba(26,27,31,.86)` | flap tile face |
| `--tile-solid` | `#1A1B1F` | flap tile with no glass behind it (logo, favicon) |
| `--hinge` | `rgba(0,0,0,.65)` | flap hinge line |
| `--glass` | `rgba(240,240,245,.06)` | glass panel fill |
| `--glass-hi` | `rgba(240,240,245,.12)` | hovered or raised glass |
| `--glass-deep` | `rgba(10,11,13,.55)` | inset wells (rows, cards inside panels) |
| `--edge` | `rgba(235,235,240,.16)` | glass border |
| `--ink` | `#F5F3EE` | primary text, flap glyphs |
| `--ink-2` | `#CFCBC2` | secondary text (never darker than this) |
| `--gold` | `#E8C26A` | the single accent: focus, primary actions, recommended, flag |
| `--gold-ink` | `#1E1500` | text on gold |
| `--sage` | `#8FD3A8` | success: correct, cleared, claimed, "on time" |
| `--sage-ink` | `#0E2416` | text on sage |
| `--salmon` | `#F08A7A` | alert: wrong, fog, pager, errors |
| `--steel` | `#5A7BA8` | secondary tone for background tiles and charts only |
| `--navy` | `#3E5578` | background tiles only |

**Rules:**
- **One accent.** Gold is the only accent. Sage and salmon are semantic state colors, used only for state, never decoration.
- **Contrast pairs, which must pass on the darkest glass:**
  - `--ink` on `--glass-deep` is about 15:1.
  - `--ink-2` on `--glass-deep` is about 10:1.
  - `--gold-ink` on `--gold`, `--sage-ink` on `--sage`, and `--ink` on `--salmon` (bold labels only) are each ≥ 4.5:1.
  - The build verifies these with a script (section 12).
- No text is ever placed directly on the background tile field. Text always sits on a glass panel, glass-deep, or a tile.
- **Reduced transparency fallback** (`prefers-reduced-transparency: reduce`): glass becomes solid `#1B1C20`, and borders stay.

### 2.2 Type

| Token | Face | License | Use |
|---|---|---|---|
| `--f-flap` | IBM Plex Mono 500/600 | OFL | flap tiles only |
| `--f-ui` | Geist 400/500/600 | OFL | all UI text |
| `--f-code` | Geist Mono 400 | OFL | code refs (`file:line`) and peeks only |

- **Fonts are self-hosted.** WOFF2 files ship in `assets/fonts/` and are copied into `.own-it/fonts/`. There is no network access, `font-display: swap`, and there are system fallbacks (`ui-monospace, Menlo, Consolas`; `system-ui, Segoe UI, sans-serif`).
- **Scale** (px, rem in code): 12 · 13 · 15 (body) · 17 · 20 · 26 · 34 · 48.
  - Line height is 1.55 for body and 1.15 for display.
  - Body text measure is ≤ 65 ch.
- **Weights:** 400 body, 500 labels, 600 headings. No 700.
- **Tabular numbers** (`font-variant-numeric: tabular-nums`) for every number.

### 2.3 Spacing and layout

- The spacing base is 4 px. The scale is 4 · 8 · 12 · 16 · 20 · 24 · 32 · 48 · 64.
- The content width is `min(1180px, 100% - 32px)`, centered, with a 16 px minimum side gutter.
- **Fully responsive (user request, 2026-10-17).** Every surface and every game template works from 360 px phone width up to 2560 px ultrawide, with no horizontal page scroll.
  - Breakpoints: `sm` < 640, `md` 640–1023, `lg` 1024–1599, `xl` ≥ 1600.
  - **Wide (≥ 1600 px):** the content max-width grows to 1440 px. The library shows more columns, and boards use the extra room instead of stretching cards.
  - **Small (< 1024 px):** side panels (objectives, tokens, notes) move under the play area or into a bottom sheet. Recommended cards and the library go to 1–2 columns. The departures board scrolls inside its own panel.
  - **Phones (< 640 px):** the header collapses to the logo, XP, and a menu button holding the toggles. Quiz answers are a single column. Screen copies scale to fit the width with `transform: scale()`, and the hit areas scale with them.
  - **Touch is a first-class input.** Every drag has a tap-to-select, tap-to-place alternative. Hit targets are ≥ 44 px. Hover-only effects (tilt, hover tick) are skipped on `(hover: none)`.
  - **Boards:** the whiteboard and pipe grid lay out to the available width and re-run their auto-layout on resize. Swimlanes and timelines stack vertically under `md`.
  - Text stays ≥ 15 px body on every width. The flap size scales with `clamp()`.

### 2.4 Radius (one documented system)

| Element | Radius |
|---|---|
| Flap tile | 6 px (large tiles 10 px) |
| Inset rows, chips | 10 px |
| Cards, tiles, dialogs | 16 px |
| Glass panels | 22 px |
| Toggles, pills, segmented controls | full (999 px) |

### 2.5 Glass recipes

| Level | Fill | Blur | Border | Highlight | Shadow |
|---|---|---|---|---|---|
| `glass-1` panel | `--glass` | `blur(22px) saturate(140%)` | 1 px `--edge` | inset top 1 px `rgba(255,255,255,.12)` | none |
| `glass-2` raised (hover, dialogs) | `--glass-hi` | `blur(26px) saturate(150%)` | 1 px `--edge` | inset top 1 px `.18` | `0 18px 50px -20px rgba(0,0,0,.6)` |
| `glass-bubble` (liquid toggle thumb) | gradient `rgba(255,255,255,.22) → .06` | `blur(8px) saturate(160%)` | 1 px `--edge` | inset top `.35`, inset bottom dark | gold underglow `0 6px 18px -6px rgba(232,194,106,.45)` |

**Sheen:** a diagonal light band (`rgba(245,240,230,.08)`) sweeps across each `glass-1` panel every 9 s. Panels are offset by 3 s, and the sweep is disabled under reduced motion.

### 2.6 Elevation and z-index (`assets/engine/z.js` constants)

| Layer | z |
|---|---|
| background canvas | 0 |
| page content | 1 |
| sticky header | 10 |
| side panels / tray | 20 |
| popovers / hint | 30 |
| dialogs (quest pop-up, result card) | 40 |
| confetti layer | 50 |
| toasts / live region | 60 |

### 2.7 Motion tokens

| Token | Value | Use |
|---|---|---|
| `--ease-out` | `cubic-bezier(.16,1,.3,1)` | entrances, hovers |
| `--ease-spring` | `cubic-bezier(.34,1.56,.64,1)` | liquid toggle, tilt return |
| `--ease-flap` | `cubic-bezier(.3,.7,.4,1)` | flap rotate |
| `--t-press` | 60 ms | press scale |
| `--t-hover` | 200 ms | hover lift and glow |
| `--t-flap` | 70 ms per glyph step, 380 ms per flip | flaps |
| `--t-toggle` | 550 ms | liquid toggle |
| `--t-sheen` | 9 s | glass sheen |
| `--t-drift` | background tiles at 0.08–0.30 px/frame | background |

**Motivation rule:** every animation must name its job: feedback, state change, attention, or ambience (background only). Ambience is limited to three things: the tile field, the sheen, and the idle board shuffle.

**Animation targets:** only `transform` and `opacity`. One exception is the flap hinge shading, a `filter: brightness` during the flip.

**Reduced motion:**
- drift, sheen, tilt, idle shuffle, ripple, and confetti are off,
- flaps swap instantly,
- toggles jump,
- sound and music still play, because they are a separate setting.

### 2.8 Iconography

- **UI icons:** Tabler Icons (outline, MIT), vendored as an inline SVG sprite in `assets/engine/icons.svg` with stroke 1.75. No hand-drawn UI icons.
- **Game logos:** the user requested a logo per game, so each one is a custom mark (section 5.4). They are the only hand-made SVGs besides the brand mark.

---

## 3. Background: the tile field

- One full-viewport `<canvas>` (`position: fixed`, z 0, `pointer-events: none`, `aria-hidden`).
- **Tiles.**
  - Count: `min(26, round(viewportArea / 52 000))` tiles.
  - Each tile is a rounded rectangle (ratio 0.72) of 40–130 px, filled with one of `--gold`, `--steel`, `--sage`, `--navy`, or `#C9A24E`, at alpha 0.18–0.40.
  - Each tile has a hinge line and a dark glyph from `OI0-9A-Z/`.
- **Motion.**
  - Tiles drift upward slowly with slight horizontal drift and rotation, and wrap at the edges.
  - Each tile flips (scaleY collapse → glyph swap → reopen, 420 ms) every 2–11 s.
- **Render cost.**
  - The device pixel ratio is capped at 2.
  - The animation pauses when the tab is hidden (`visibilitychange`).
  - Under reduced motion, a single static frame is drawn.
- **Behind glass.** The panels' `backdrop-filter` blurs the tiles, which makes the glass visibly alive. This replaces the user-rejected "sun" glow blobs.
- **Pager alert mode (3am Pager game):** tiles tint toward `--salmon` for the length of the alarm.

---

## 4. Sound and music

### 4.1 Audio graph

`AudioContext` → master gain 0.45 → compressor (−24 dB, knee 12, 3:1, attack 3 ms, release 150 ms) → destination. A short reverb (convolver with a 0.35 s generated noise impulse, wet 0.08) sits on a send.

- **Unlock.** The context starts on the first `pointerdown` or `keydown` anywhere, as browser policy requires.
- **Settings** are stored in `.own-it` local storage keys `ownit-sfx`, `ownit-music`, and `ownit-volume`, and every access is wrapped in try/catch.
  - Sound effects default to **on**.
  - Music defaults to **on**. It starts at the first interaction.
  - `M` mutes everything, and pressing it again restores the previous state.

### 4.2 Sound-effect catalogue

All sounds are synthesized, with no files. Each one has pitch variation (±3%) and gain variation (±10%) and belongs to a choke group (retriggering fades the previous instance in 15 ms).

| Name | Trigger | Recipe | Length | Choke |
|---|---|---|---|---|
| `press` | press on any button | sine sweep 1.5×base→base + 8 ms hi-passed noise. Base pitch: card 330, tile 440, toggle 620, button 520 Hz | 90 ms | press |
| `hover` | pointer enters a card or tile | sine 1.4 kHz blip, gain 0.025 | 50 ms | none |
| `clack` | a flap flip the player caused | band-passed noise snap (2.6 kHz) + 140 Hz sine thump. Rate-limited to one per 55 ms. A multi-tile flip plays one clack per glyph step. | 45 ms | clack |
| `toggle` | liquid toggle moves | soft "bloop": sine 520→780 Hz glide + tiny reverb | 160 ms | toggle |
| `correct` | right answer, objective done | 3-note rising chime (E5–A5–E6), sine, wet | 380 ms | chime |
| `wrong` | wrong answer, wrong turn | sine 200→120 Hz "bonk" | 240 ms | bonk |
| `combo-n` | streak step n | `correct` transposed up n semitones, max +7 | 300 ms | chime |
| `streak-break` | a streak ends | gentle 2-note down-step | 260 ms | chime |
| `levelup` | rung cleared, badge, quest complete | triad arpeggio (C–E–G triangle) → sustained C–G–C sine chord + one sparkle | ≤ 1.2 s | fanfare |
| `claim` | zone claimed | `levelup` plus a low C2 swell | ≤ 1.2 s | fanfare |
| `hint` | hint revealed | soft two-tone "ding" a fourth apart | 300 ms | chime |
| `fog-lift` | fog cleared | rising filtered-noise whoosh | 700 ms | whoosh |
| `tick` | timer, last 5 s | short wood tick, pitch rises in the final 3 s | 40 ms | none |
| `alarm` | 3am Pager start | two-tone pager beep ×3, gain-limited | 900 ms | alarm |
| `build-wait` | "Claude is building" | slow quiet flap shuffle every 1.2 s, silent after 10 s | loop | none |

**Mix rules.**
- Nothing is louder than `levelup`.
- No more than 12 voices sound at once. The oldest voice is dropped.
- Every envelope starts with an exponential ramp from 0.0001, so there are no clicks.
- Each sound has a visual twin (press scale, flap, confetti, shake), so no meaning is carried by sound alone.

### 4.3 Music engine

The engine is generative, synthesized, and in tune: equal temperament, A4 = 440 Hz, no detune, no pitch modulation.

- **Key and harmony.** The key is C major.
  - Progression A: C → G → Am → F.
  - Progression B: F → G → Em → Am.
  - Each chord lasts one bar of 4.0 s (8 eighth notes of 0.5 s).
- **Voices.**
  - **Pad bed** ("organ hum"): the 4 chord tones, sine plus triangle at the same pitch, attack 1.8 s, through a static 900 Hz low-pass, at gain 0.016 per voice.
  - **Bass:** sine root on beat 1 and beat 3, and an octave note on beat 4.
  - **Electric piano (lead):** FM (carrier = modulator frequency, index envelope 2.2f → 0.12f over 0.35 s) plus a faint ×4 bell partial, through a 3.4 kHz low-pass and a quarter-note echo (feedback 0.18, wet low).
  - **Arpeggio:** 8 eighth notes per bar on chord tones `[0,1,2,1,3,1,2,1]`. Each note lasts at most 1.8 beats, so it never rings into the next chord.
  - **Melody:** quarter notes on the beat, original phrases written from chord tones and passing tones, with two phrase sets that alternate on each cycle.
  - **Drums** (soft lo-fi):
    - kick (sine 110→42 Hz) on 1, the "and" of 2, and 3,
    - snare (band-passed noise + 196 Hz triangle) on 2 and 4,
    - hats on 8ths.
- **Timing.** Every note is on the eighth-note grid: no swing, no random timing.
- **Arrangement loop** (4 bars per section, 32 bars per cycle, about 2 min 8 s). Each row adds or removes one layer:

  | Section | Progression | Layers |
  |---|---|---|
  | 1 | A | pad + bass |
  | 2 | A | + arpeggio (with off-beat hats) |
  | 3 | A | + drums |
  | 4 | A | + melody |
  | 5 | B | all |
  | 6 | B | − melody |
  | 7 | A | − drums |
  | 8 | A | − arpeggio |
  | → | | loop to section 1 |

- **Transitions.** A layer fades in over its first 4 bars (0.30 → 0.60 → 0.85 → 1) and out over its last 4 bars (1 → 0.85 → 0.55 → 0.28).
- **Turnaround** (last bar of the cycle):
  - a rising filtered-air swell,
  - a bell arpeggio C–E–G–C,
  - a sustained low root,
  - then the pad re-enters at 55% → 85% → 100%.
- **Level.** Music bus 0.055 into the master: barely audible under the sound effects. The music ducks by 40% for 1.2 s under `levelup` and `claim`.
- **Scheduling.** Look-ahead scheduling (1.5 bars ahead, 500 ms timer) on `AudioContext.currentTime`. The engine pauses when the tab is hidden and resumes in time.
- **Copyright.** No existing song is reproduced. The user's reference track sets the vibe only.

---

## 5. Components

Each component lists its anatomy, states, motion, sound, keyboard behavior, and accessibility. Every interactive component also gets the shared **press feel**:
- `:active` scale to 0.965 (60 ms),
- a gold ripple from the pointer point (radial `rgba(232,194,106,.45)`, 500 ms),
- the `press` sound,
- Enter or Space plays the same sound.

### 5.1 Flap tile and flap text (`<own-flap>`)

- **Anatomy:** a tile (`--tile`, radius 6) with a centered `--f-flap` glyph and a 1 px hinge line at 50%. A flap text is a row of tiles with a 3 px gap.
- **Variants:**
  - default,
  - accent (`--gold` tile, `--gold-ink` glyph, used for the separator `/` and highlighted characters),
  - success (`--sage`),
  - alert (`--salmon`).
- **Flip:**
  - Each glyph cycles through 4 + index pseudo-random steps at 70 ms, so later characters settle later, which gives a left-to-right cascade.
  - Each step plays a rotateX 0 → 88° → 0 with darkening.
  - Only a flip the player causes plays `clack`. Idle shuffles are silent.
- **Accessibility:** the real text is in an `aria-label` on the row, and the tiles are `aria-hidden`. Value changes are announced politely in the live region only for score and XP.

### 5.2 Glass panel (`.panel`)

- `glass-1` with a sheen and a 20 px padding.
- It holds a section heading (`--f-ui` 600, 13 px, `--ink-2`, sentence case), which is the only label above content.
- Panels never nest more than one inset level (`--glass-deep` wells inside).

### 5.3 Liquid toggle / segmented control (`<own-toggle>`)

- **Anatomy:** a pill track (`rgba(0,0,0,.35)` with a border), 2–4 option buttons, and a `glass-bubble` thumb behind the chosen option.
- **Motion:**
  - The thumb slides (`left` and `width`, 550 ms `--ease-spring`).
  - The same move plays a squash-and-stretch keyframe: 30% `scale(1.18,.82)`, 60% `scale(.94,1.06)`, 100% `scale(1)`.
  - Text color crossfades in 300 ms.
- **Sound:** `toggle`.
- **Keyboard:** ←/→ move the choice. It uses `role="radiogroup"`, and options are `role="radio"` with `aria-checked`.
- **Used for:** Practice/Exam, mode filters in the library, settings.

### 5.4 Game logo

- 1 single-weight line glyph (stroke 2) in `--ink`, plus at most one gold detail, on a 44 px flap tile with a hinge.
- It is readable at 32 px.
- Each game's logo is unique and lives in its template (`assets/games/<id>.js` exports `logo` SVG).
- Concept per game (the build refines these):

  | Game | Logo concept |
  |---|---|
  | Quiz | speech bubble with a check |
  | Memory Match | two overlapping cards |
  | Spot the Lie | a mask |
  | Screen Tour | phone frame with a tap ring |
  | Quests | map pin on a path, gold flag |
  | Guess the Screen | blurred square with a magnifier |
  | Whiteboard | two nodes joined by an arrow |
  | Chain Reaction | lit fuse |
  | Data Detective | magnifier over a stamp |
  | Who's Allowed? | open and closed lock |
  | Pipe Plumber | elbow pipe |
  | Blast Radius | burst with rings |
  | 3am Pager | pager with a gold alert line |
  | What-If Dial | dial knob |
  | Design Duel | two crossed arrows |
  | Escape Room | door with a keyhole |
  | Boss Battle | shield with a heart bar |
  | Teach-back | presenter at an easel |

### 5.5 Brand mark and lockup

- **Mark:** two flap tiles reading `O` and `I`, where the I's dot is a small planted flag in `--gold`, with a gold rail under both tiles.
- **Lockup:** mark + `own-it` (`--f-flap` 600, `--ink`).
- **Files:** `assets/brand/mark.svg`, `lockup.svg`, `favicon.svg`, `mono.svg` (all `--ink` with a gold flag; mono is single-color).
- The favicon is the mark on a rounded `--tile-solid` square.

### 5.6 Buttons

- **Primary:** `--gold` fill, `--gold-ink` label, radius full, height 40, padding 0 18.
- **Secondary:** a glass pill with a border.
- **Quiet:** text only with an underline on hover.
- **Labels:** at most 3 words, never wrapping, verbs that say what happens ("Start quest", "Show hint", "Copy answer").
- **Disabled:** 45% opacity with a tooltip saying why. For example, "Hints are off in Exam mode."

### 5.7 Recommended card

- `--glass-deep` card (radius 16) containing:
  - the game logo tile,
  - the title (`--f-ui` 600, 16),
  - a one-line reason written by Claude for this app (≤ 120 chars),
  - a state chip (Ready / Building / Ask Claude) plus the time estimate.
- **Hover:**
  - the card lifts by 2 px,
  - a gold edge glow appears (`0 0 0 1px rgba(232,194,106,.5)` plus a soft gold shadow),
  - the card tilts by ≤ 6° toward the pointer (spring back on leave),
  - the `hover` sound plays.
- **Press:** the standard press feel, then the game opens.

### 5.8 Library tile

- Smaller than a card. It shows:
  - the logo,
  - the name,
  - one line on what you do,
  - the keys used,
  - the state chip.
- The tile grid uses `repeat(auto-fill, minmax(176px, 1fr))`.
- A **filter toggle** above the grid offers: All, Your app, Quick (≤ 3 min), Exam-ready.
- **Hover** flips a tiny flap row on the tile with the time estimate.

### 5.9 Departures board (zones)

- A table on a `glass-1` panel. Each row is `--glass-deep` with rounded ends.
- **Columns:**
  - **Zone:** a flap text of the zone name.
  - **Rungs:** five 22×28 flap cells, W M T B X:
    - cleared cells are sage,
    - open cells have a gold ring,
    - locked cells are dim.
  - **Next:** the recommended game, in plain text.
  - **Status:** a flap text, one of:
    - BOARDING: the recommended next zone,
    - ON TIME: claimed,
    - FOG · N FILES: fogged, shown in salmon,
    - SCHEDULED: not started.
- Clicking a row opens the zone detail, a side panel listing:
  - the screens strip (thumbnails of rebuilt screens, with fog badges),
  - weak spots, each with a "Practice this" button,
  - rung history.
- **Idle shuffle:** every 3.8 s, one random status cell flips through glyphs and returns to its value, silently.

### 5.10 Header

Left to right:
- the lockup,
- XP as a flap text,
- "Claimed n/m" as a flap text,
- the Practice/Exam liquid toggle,
- a music toggle and a sound toggle (icon buttons, 40 px, with a gold ring and tint when on, and `aria-pressed`),
- a help button (`?`).

The header is sticky with a `glass-1` background and a height of ≤ 72 px.

### 5.11 Quest pop-up (dialog)

- A `glass-2` dialog (radius 16, max-width 520) over a dimmed page (`rgba(10,11,13,.55)`).
- It opens with a flap title ("QUEST"), the goal in plain words, and the numbered objectives. The numbers are justified here because the objectives are a real sequence.
- One primary "Start quest" button (Enter) and a quiet "Back" button (Esc).
- **Motion:** it scales 0.96 → 1 and fades in over 260 ms `--ease-out`, while the title flaps in.

### 5.12 Objective panel

- A pinned side panel showing the objectives as a checklist.
- When an objective ticks:
  - the row flashes sage,
  - its checkbox draws in,
  - a small confetti burst fires from the row,
  - `correct` plays.

### 5.13 Result card

- A dialog showing:
  - the score as a big flap text ("7/9"),
  - the XP gained as a flap counter that rolls up,
  - new badges (each logo flips in with the `levelup` sound),
  - a "What you missed" list (salmon-tinted rows with the `file:line` refs as links),
  - Challenge buttons on missed or wrong rows,
  - and actions: "Next game" (primary) and "Back to board".
- **On a clear or claim:** a full confetti shower plus `levelup` or `claim`, and a banner flap reading "RUNG CLEARED" or "ZONE CLAIMED".

### 5.14 Feedback panel (Claude's debrief in the page)

- A glass panel that slides in from the right (320 ms).
- It shows:
  - Claude's debrief text (≤ 120 words, rendered from the data file as text, never as HTML),
  - the refs as links,
  - a "Ask a follow-up" input that posts an `ask` event.
- In Exam mode it shows "Debrief after the exam."

### 5.15 "Claude is building your round" state

- It shows a skeleton of the target game's layout in glass with a shimmer, so there is no spinner.
- A flap line cycles "BUILDING…", and the `build-wait` sound plays.
- After 20 s, it adds the line "Taking longer than usual. You can keep browsing."
- After 120 s, it shows "Still waiting on Claude. Check the chat." plus a "Use copy and paste instead" link, which is the fallback.

### 5.16 Hint dialog

- A small `glass-2` popover with "Use a hint? It costs 15 XP." and two buttons: "Show hint" (primary) and "Not now".
- The revealed hint is one sentence, labeled "Prediction, may be wrong" in `--ink-2`.

### 5.17 Key help overlay (`?`)

- A dialog listing the global keys and the current game's keys. Each key is shown as a small flap tile.
- It includes a **sound test strip**, with buttons for Flap, Correct, Wrong, and Level up, plus a volume slider. The volume slider uses the same liquid thumb style on a track.

### 5.18 Toasts / live region

- A bottom-center glass pill that shows for 3.2 s.
- It is used for: "Answer sent to Claude", "Copied", "Sound on" / "Sound off", and errors.
- It is also the `aria-live="polite"` region.

### 5.19 Empty, error, and offline states

- **No missions yet:** the board shows the zones, with a "Pick a game to start" prompt pointing at the recommended row.
- **Live link lost:** a salmon flap reads "LINK LOST". The text says "own-it can't reach Claude. Check that the chat is still open, then press Retry." It offers Retry and "Use copy and paste" buttons.
- **File:// fallback mode:** a quiet header note reads "Offline mode: answers download to your Downloads folder."
- **Exam report card:** a full-screen board styled like an arrivals board. Each zone row shows DEFENSIBLE (sage), SHAKY (gold), or BLIND SPOT (salmon) as a flap, with one line of reason.

### 5.20 Confetti

- A canvas layer (z 50) with up to 140 particles at once.
- Shapes are small tiles and flags in gold, sage, ink, and steel.
- Particles fall under gravity with a little spin and last 1.6 s.
- The burst origin is the event's element.
- It is off under reduced motion, which uses a sage flash instead.

---

## 6. Screens

### 6.1 Home / dashboard (first view after setup)

```
┌ header: [OI own-it]      XP 0340  Claimed 1/4   (Practice|Exam)  ♪ 🔊 ? ┐
├ Recommended for this app ─────────────────────────────────────────────┤
│ [Quest: Cancel a trip]  [Guess the Screen]  [3am Pager]               │
├ Departures ───────────────────────────────────────────────────────────┤
│ TRIPS   W M T B X   Trace · Quest           BOARDING                  │
│ LOCKS   W M T B X   Claimed                 ON TIME                   │
│ AUTH    W M T B X   Map · Screen tour       FOG · 2 FILES             │
├ Game library  (All | Your app | Quick | Exam-ready) ──────────────────┤
│ [tile][tile][tile][tile][tile][tile] …                                │
└ footer: Everything own-it creates lives in .own-it/. Delete it to remove everything. ┘
```

- **Load sequence**, a single orchestrated moment (about 1.2 s):
  1. the tile field fades in,
  2. the panels rise 8 px and fade in, staggered 80 ms,
  3. the flaps cascade in: header first, then the board rows.
- **No other entrance animations.**

### 6.2 Game shell (shared by all games)

```
┌ game header: [logo] Game name · Zone     ⏱ 00:42    score 3/5   (Hint) (?) (Exit) ┐
├───────────────────────────────────────────────┬───────────────────┤
│ play area (game template renders here)        │ side panel:       │
│                                               │ objectives / pins │
│                                               │ / tokens / notes  │
└───────────────────────────────────────────────┴───────────────────┘
```

- The timer and score are flap texts.
- Esc opens "Leave this game? Progress in this round is lost." with "Leave" and "Keep playing".

### 6.3 v2.0 game layouts

| Game | Play-area layout |
|---|---|
| Quiz | One question card centered on a glass panel, 4 answer rows in a 2×2 grid, and a progress row of flap dots (5). |
| Screen Tour | The screen copy in a sandboxed iframe on the left (device frame, 60% width), and the question and choices panel on the right. |
| Quests | Screen iframe in the center, objective panel on the right, a role switcher pill above the iframe, and the quest pop-up at the start. |
| Guess the Screen | One large screen copy with a CSS blur stepping 16 px → 0 over 12 s, a buzz button (Space), and 4 name choices after the buzz. |
| Whiteboard (Map) | Auto-laid-out cards on an SVG board, arrows drawn by clicking card → card, plus a legend. |
| Boss Battle | Boss HP bar as a flap row, player lives as 3 flag tiles, a question card, and a typed answer box (Claude grades it via the live link). Hits play `correct` plus a damage number flap. A miss shakes the screen 6 px and plays `wrong`. |

### 6.4 Screen-copy frame

- The device frame is a 1 px `--edge` rounded rectangle with a gold focus ring on the active tagged element.
- Tagged elements show a soft gold outline on hover (inside the iframe, via an injected style, since the copy itself runs no scripts).

---

## 7. Keyboard map

| Key | Action |
|---|---|
| Tab / Shift+Tab | move focus (visible gold ring, 2 px, offset 3 px) |
| Enter / Space | activate |
| Esc | close dialog / leave game (with confirm) |
| ? | key help + sound test |
| M | mute or unmute everything |
| 1–4 or A–D | answer choices |
| N | next |
| H | hint (confirm) |
| ←/→ | toggles, swipe games (Who's Allowed?) |
| Arrow keys | move selection on boards |
| Delete | remove arrow or placement |
| R | role switcher (Quests) |
| Q | quest list |
| Space | buzz (Guess the Screen) |

---

## 8. Accessibility

- WCAG AA for all text, and AAA target for body text on panels. Contrast is verified by the build script.
- Sound and music settings are separate from motion settings, and every audio cue has a visual twin.
- `prefers-reduced-motion` follows section 2.7.
- `prefers-reduced-transparency` uses solid panels.
- All interactive elements are reachable by keyboard and have accessible names.
  - Dialogs trap focus and return it on close.
  - Flap rows expose their real text.
- No content flashes more than 3 times per second, including the pager alarm tint.
- Hit targets are ≥ 40 px in the header and ≥ 44 px in games.

---

## 9. Performance budgets

- 60 fps on a mid laptop with the tile field, the sheen, and one game active.
- At most 26 background tiles, and one `backdrop-filter` blur of at most 26 px per stacked panel. Glass is never stacked more than 2 deep.
- **Size budget:**
  - engine and all v2.0 templates: ≤ 350 KB uncompressed, excluding fonts,
  - fonts: ≤ 220 KB total WOFF2 (subset to Latin).
- No network requests except to the local `serve` origin.
- Audio: at most 12 simultaneous voices, and music scheduling uses at most 1 timer.

---

## 10. Copy rules

- Use sentence case everywhere except flap tiles.
- No em dashes or en dashes in UI text. Use hyphens, periods, or commas.
- No decorative status dots, eyebrows, version labels, or scroll cues.
- Buttons name the action, and the result toast repeats it: "Copy answer" → "Copied".
- Errors say what happened and what to do, in the interface's voice, without apologies.
- Game descriptions are one line, use the word "you", and contain no hype words.

---

## 11. Files

```
own-it/assets/
  engine/
    tokens.css        tokens from section 2
    ui.css            components from section 5
    icons.svg         Tabler sprite (MIT notice included)
    core.js           grading/codec (existing)
    router.js         Home ↔ game shell
    flap.js           <own-flap>
    toggle.js         <own-toggle>
    field.js          background tile field
    audio.js          graph, sfx catalogue, settings
    music.js          music engine (section 4.3)
    juice.js          press feel, ripple, confetti, shake, tilt
    keys.js           keyboard manager + help overlay
    link.js           live link (serve/wait events) + fallback
    z.js              z-index constants
  games/<id>.js        one template per game (logo, layout, logic)
  games/<id>.schema.json
  fonts/               IBM Plex Mono, Geist, Geist Mono (WOFF2, OFL texts)
  brand/               mark, lockup, favicon, mono
  game.html            shell: loads tokens, ui, engine, templates, data
```

---

## 12a. Builder decisions (Claude's calls, from the builder check)

1. **Data contract.** The data contract is owned by the parent spec (sections 5b-2 live link, 5c templates, 6.x, 11.3). The page loads data as classic `.js` files that set `window.OWNIT_*` globals:
   - `progress.js`
   - `recs.js`
   - `data/<game>-<round>.js`
   - `data/feedback-<id>.js`
   - `screens.js`

   **Live mode:** `GET /state` returns a version map, and the page re-injects a changed script.

   **file:// mode:** a manual reload, with downloads and copy for results.
2. **Scope per stage.** The library shows all 18 tiles from v2.0 on.
   - Games that are not built yet appear as dimmed tiles with their logo and a "Coming in a later update" chip. They are not clickable.
   - The library filters use real metadata from each template's `register()` call (`minutes`, `examReady`, `usesScreens`).
   - Only the 6 v2.0 game layouts (section 6.3) are built in v2.0. All 18 logos are designed in v2.0, so the library looks complete.
3. **Runtime.**
   - Zero-build vanilla JS, as classic scripts (no ES modules, so `file://` works), with small custom elements for flap and toggle.
   - Targets: the current Chrome, Edge, Firefox, and Safari.
   - Where `backdrop-filter` is unsupported, the panels use the solid fallback from 2.1.
4. **Screen copies.** Defined in the parent spec (sections 6.2, 6.2b, 11, 15.5):
   - A screen copy is an HTML fragment stored as `screens/<id>.html` and inlined via `screens.js` as a string.
   - It is rendered with `iframe srcdoc`, `sandbox="allow-same-origin"`, and no scripts.
   - The page script attaches listeners through `contentDocument` and matches `data-ownit` ids.
5. **Whiteboard and Boss.**
   - **Layout:** the whiteboard uses a deterministic layered layout. Sources go left, sinks go right, and each column is ordered by the median of its neighbors' positions. A board holds at most 12 cards.
   - **Arrow correctness** follows the parent spec's directed-edge-set grading (`core.js`).
   - **Boss board grading** runs in the page. Boss typed answers are graded by Claude through the live link, or in chat in file:// mode.
6. **Music test.**
   - The test runs on a scheduled-note log produced by the engine in a test hook, not on rendered audio.
   - The allowed pitch classes are the C-major diatonic set (C D E F G A B) in any octave. Em and the C2 swell pass.
   - Sound effects (pager alarm, wrong "bonk" glide) are not part of the music test.
7. **Persistence.**
   - The game state (XP, rungs, badges, claims) lives in `.own-it/` files that the helper writes and the page reads.
   - The page never writes game state. In live mode it sends events, and in file:// mode it downloads results.
   - `localStorage` holds only view settings (sound, music, volume, last library filter).
8. **Fonts and icons.**
   - The fonts are fetched once at build time from their official OFL releases (IBM Plex, Geist), then subset to Latin and committed to the skill.
   - Weights: Plex Mono 600 (flaps), Geist 400 and 600, Geist Mono 400. Four files, each ≤ 55 KB.
   - Only the Tabler icons actually used are vendored into the sprite, with the MIT notice.

## 12. Acceptance checklist (build must pass)

- Every surface in sections 5 and 6, and every game template, renders in the browser check at 375, 768, 1280, and 1920 px (plus 2560 for the dashboard), with no horizontal overflow and with touch alternatives working.
- The contrast script passes for every text/background pair in use.
- Flaps animate on load and on value change. Only flips the player causes make sound.
- The liquid toggle squashes and stretches and springs. Every button has press scale, ripple, and sound.
- The tile field animates behind the glass, pauses when the tab is hidden, and is static under reduced motion.
- The music:
  - starts on the first interaction,
  - is in tune (an automated check confirms all scheduled frequencies are equal-tempered C-major scale tones),
  - is on the 8th grid (all start times are multiples of 0.5 s from bar start, except the turnaround),
  - loops through all 8 sections with fades.
- Sound effects stay under clipping: master peak < −1 dBFS in an OfflineAudioContext render of the busiest moment (levelup + combo + music section 5).
- Reduced motion, reduced transparency, mute, keyboard-only play, and the live-link-lost state are all verified.
- Zero em dashes in UI strings (grep check).
- The final look is approved by the user against the reference mockup before the stage closes.
