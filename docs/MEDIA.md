# Regenerating media

Every screenshot, GIF, icon and the social card in this repository is captured from the running app by the scripts in [`tools/media`](../tools/media). Re-run them whenever the design changes.

[← Back to the README](../README.md)

---

## What you need

- Node.js 18+
- Google Chrome. Set `CHROME=/path/to/chrome` if it isn't in the default macOS location.
- Python 3 with Pillow (`pip install pillow`)
- [gifski](https://gif.ski) for the GIFs (`brew install gifski`)

## Run

```bash
cd tools/media
npm install
npm run serve        # in one terminal: serves the app on http://localhost:8791
npm run all          # in another: icons, stills, GIFs and the library strip
```

Or run one part at a time:

| Script | Produces |
|:--|:--|
| `npm run icons` | `assets/favicon-32.png`, `apple-touch-icon.png`, `icon-192.png`, `icon-512.png` (from the leather-and-gilt mark) |
| `npm run stills` | Desktop screenshots in light and dark, the hero images, `assets/og.png`, phone mockups (`mobile*.png`), then JPEG conversion |
| `npm run gifs` | `swipe`, `open`, `read`, `quiz` and `theme` GIFs, plus dark versions of `swipe`, `open`, `read` and `quiz` |
| `npm run library` | `library.png`: every cover in the library in one row |

Point the scripts at another address with `FOLIO_URL=https://… npm run stills`.

## How it works

- **Puppeteer** (`puppeteer-core`, using your installed Chrome) opens the app at a fixed size and pixel density, emulating the light or dark colour scheme (`THEME=dark`).
- **Stills** are taken at 2× (desktop) or 3× (phone).
- **GIFs** come from Chrome's screencast stream. Frames are resampled to a steady 20 to 25 fps and encoded with gifski. Headless Chrome draws no cursor, so a soft touch indicator is added to show where each tap lands.
- **Phone mockups** are drawn by `phones.py`: rounded screen, bezel, camera pill and shadow, on a transparent background so they suit GitHub's light and dark themes.
- **The library strip** loads the app on several simulated dates (by overriding `Date`) until it has seen every cover, because each day only shows six.

The app picks books by date, so screenshots show whatever is on the shelf the day you run them.
