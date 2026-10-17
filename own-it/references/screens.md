# Screen copies

Screen Tour, Guess the Screen and Quests show rebuilt copies of the user's screens. Rebuild only screens a recommended round needs, once per file hash. Refresh only fogged ones. Max 8 per zone.

## Rebuild (Sonnet subagent, at most 8,000 tokens each)

Give it one screen component (plus direct children if needed): at most 3 files and 400 lines. Tell it to change nothing outside `.own-it/`. Ask for one HTML fragment:
- inline CSS, no JavaScript, no external URLs, no forms with actions;
- keeps visual hierarchy, labels and interactive elements;
- `data-ownit="<item id>"` on every button, link or input that matters, using `element` or `surface` ids from the model;
- sample data made up and plausible. Never copy values from fixtures, seeds or env files;
- login-gated screens show their logged-in state.

Unsupported framework or too dynamic? Fall back to a sketch card: a plain wireframe listing the screen's buttons and fields.

## Build

Save the fragment as `.own-it/screen-<id>.html`, then:

`build-screen <screenId> .own-it/screen-<id>.html --zone <zone> --inputs path/a.tsx,path/b.tsx`

It sanitizes, rejects real-looking data (emails, uuids, long hex or base64 runs, `.env` values), checks every `data-ownit` id, caps at 60 KB, and prints `{id, bytes, dropped}`. `dropped` lists stripped tags or attributes. On an error, fix the fragment and rerun.

`--inputs` are the project-relative files the copy came from; their hashes mark it stale when they change.
