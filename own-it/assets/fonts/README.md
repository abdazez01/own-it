Fonts

own-it ships no font files. `engine/tokens.css` declares `local()` faces with system fallbacks, so it uses IBM Plex Mono and Geist only when they are installed.

To vendor them later (both are SIL OFL 1.1, free to redistribute):

1. Download IBM Plex Mono (500, 600) and Geist (400, 500, 600), plus Geist Mono (400), as WOFF2.
2. Put the files in this folder, named for example `IBMPlexMono-Medium.woff2`.
3. In `engine/tokens.css`, add `url("../fonts/<file>.woff2") format("woff2")` after the `local()` entry of each matching `@font-face`.
4. Include the OFL license text next to the files.
5. Copy this folder to `.own-it/fonts/` during setup, as the spec describes.
