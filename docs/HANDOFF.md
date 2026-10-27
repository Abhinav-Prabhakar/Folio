# Hand-off: remaining work

A prompt for the next agent working on Folio. Everything below the line is written to that agent. Do the tasks in order. Each is self-contained: commit and push after each one (`git push` to `main`; GitHub Pages redeploys on its own).

[← Back to the README](../README.md)

---

You're continuing work on **Folio** (`index.html`, a single-file reading app; live at https://abhinav-prabhakar.github.io/Folio/). Read `README.md`, `docs/ARCHITECTURE.md` and `docs/LIBRARY.md` first. The library summaries are by Four Minute Books (Niklas Göke), republished **with permission**. Keep every credit in place.

## Status: all planned tasks are complete

Done and pushed to `main`:

- **Author/year enrichment** finished: 1,196 of 1,317 books have an author, 1,168 a year.
- **Re-scrape** with the lesson-heading fix.
- **Summary audit** (`tools/catalog/audit.mjs`), with converter fixes.
- **Quiz questions** for every book: `node tools/quiz/build-index.mjs` reports 1,317 valid files, 0 problems, 0 missing.
- **Headless feature checks** for shelves, read marks, FSRS and the Memory sheet, in light and dark.
- **README media** refreshed, including the library-open GIF and the Memory sheet.

## Optional follow-ups

Serve locally with `python3 -m http.server 8791`. Commit and push each one separately.

1. **Sharpen generic questions.** 61 quiz files contain a generic "Which of these statements is made in <Title>?" question. Rewrite those questions to name the specific idea, following `docs/QUIZ-AGENT-PROMPT.md`, then re-run `node tools/quiz/build-index.mjs`.
2. **Missing authors.** 121 books have no author: Open Library had no confident match. Leave them empty unless a reliable, automated source turns up; never guess.
3. **Weekly refresh.** Confirm `.github/workflows/refresh-library.yml` runs green in the Actions tab. It needs *Settings → Actions → General → Workflow permissions: Read and write*, which only the repo owner can set.
4. **Safari pass.** The app has only been exercised in Chrome. Check the shelf, reader, library, Memory sheet and theme switch in Safari (macOS and iOS) and fix anything small.

End git commit messages with `Co-Authored-By: Claude <noreply@anthropic.com>`.
