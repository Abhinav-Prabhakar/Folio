# Hand-off: remaining work

A prompt for the next agent working on Folio. Everything below the line is written to that agent. Do the tasks in order. Each is self-contained: commit and push after each one (`git push` to `main`; GitHub Pages redeploys on its own).

[← Back to the README](../README.md)

---

You're continuing work on **Folio** (`index.html`, a single-file reading app; live at https://abhinav-prabhakar.github.io/Folio/). Read `README.md`, `docs/ARCHITECTURE.md` and `docs/LIBRARY.md` first. The library summaries are by Four Minute Books (Niklas Göke), republished **with permission**. Keep every credit in place.

Serve locally with `python3 -m http.server 8791` from the repo root. Browsers block the library's `fetch` from `file://`. End git commit messages with `Co-Authored-By: Claude <noreply@anthropic.com>`.

## 1. Finish the author/year enrichment

`tools/catalog/enrich.mjs` looks up each library title on Open Library to add authors (`a`) and first-publication years (`y`). The first run stopped about halfway; its cache is committed at `tools/catalog/openlibrary-cache.json`. It resumes from the cache, at roughly one request per second:

```bash
cd tools/catalog && npm ci && node enrich.mjs
```

Then commit `data/catalog.json` and the cache. Expect about 90% of books to get an author.

## 2. Re-scrape once (formatting fix)

`scrape.mjs` now strips the trailing full stop from lesson headlines. Regenerate the summaries, then re-run enrichment (instant, because it's cached):

```bash
cd tools/catalog && node scrape.mjs && node enrich.mjs && node ../quiz/build-index.mjs
```

Commit `data/`. The weekly GitHub Action (`.github/workflows/refresh-library.yml`) does the same every Monday. Check it ran green in the Actions tab; it needs *Settings → Actions → General → Workflow permissions: Read and write*.

## 3. Audit the converted summaries (automated, no manual reading)

Write `tools/catalog/audit.mjs` that scans every `data/summaries/*.md` and reports anything suspicious. Then fix the converter in `scrape.mjs` (not the Markdown files), re-run step 2, and repeat until the audit is clean. Flag:

- leftover promo or boilerplate lines (e.g. "Download PDF", "audio", "Blinkist", "affiliate", "click here", "sign up", "subscribe"), raw URLs, HTML tags or entities (`&amp;`, `<`), stray `*` markers
- empty sections (a `##`/`###` heading followed directly by another heading)
- headings over 140 characters, paragraphs over 1,500 characters, files under 250 words
- summaries with no `> hook` line (1 known) or no lessons (8 known; check whether they use a different heading pattern, e.g. "Big idea #1", and teach the converter)
- duplicate catalog titles, or catalog books that duplicate the 8 Folio originals (`LIB` in `index.html`; dedupe uses `aka` aliases)

Print a summary count per issue type and the first 10 files for each.

## 4. Quiz questions

Follow `docs/QUIZ-AGENT-PROMPT.md` exactly (5 questions per book → `data/quiz/<id>.json`, validated and indexed by `tools/quiz/build-index.mjs`). Work in batches of about 25 books and commit after each batch. The app picks them up automatically: questions join a reader's FSRS reviews once they've finished that book.

**Status:** Questions exist for 50 of 1317 books. Resume with the first book in catalog order that has no valid file (`node tools/quiz/build-index.mjs` prints how many are still missing). Skip existing valid files.

## 5. Light checks of the newest features

These were built at the end of a session and only smoke-tested. Check them on desktop (1440×900) and phone (390×844), light and dark. Use one headless Chrome script (`tools/media` already has Puppeteer set up) rather than many agents.

- **No repeats:** `localStorage['folio:days']` holds each day's shelf. Simulate a few days by overriding `Date` (see `tools/media/library.js` for how) and confirm no id repeats across days, and that books in `folio:read` never reappear.
- **Read marks:** turn to the last spread of a summary → the book appears in `folio:read`; its library tile shows the gilt seal; the *Read* chip filters to it; the shelf caption shows a check glyph.
- **FSRS (Recall):** with a read Folio original (e.g. set `folio:read` to `{"orwell":"2026-01-01"}`), open Recall. Expect new cards; answering schedules them in `folio:cards`; "back in N days" shows; *Rate how sure I was* shows Hard/Good/Easy after a right answer and re-grades. The memory sheet (sliders icon, top right in Recall) saves to `folio:mem`; the FSRS parameter box rejects anything but 19 numbers.
- **Memory sheet on a phone:** must fit and scroll; the reader's arrow keys must not turn pages while a slider or text box has focus.

Fix what's broken, keeping fixes small and in the existing style.

## 6. Refresh the README media

The hero, GIFs and screenshots predate the library, read marks and Recall's memory settings. Regenerate them with `tools/media` (`docs/MEDIA.md`):

```bash
cd tools/media && npm install && npm run all
```

Then add, in light and dark:

- a GIF of opening a library book from its tile
- a still of the memory sheet

Update `README.md` to use them. Keep each GIF under about 5 MB. Check the README renders well in both GitHub themes.

## Done when

Every library book has an author where Open Library knows it, the audit is clean, every book has valid quiz questions (`build-index.mjs` reports 0 without questions), the checks in 5 pass, and the README shows the current app.
