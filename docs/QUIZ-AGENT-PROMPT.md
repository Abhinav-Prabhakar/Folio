# Prompt: write Folio's quiz questions

Give everything below the line to an agent working in this repository. It writes multiple-choice recall questions for every library summary, in the exact format the app loads. Nothing else in the app needs to change: books gain questions as soon as their file exists and is listed in the index.

[← Back to the README](../README.md)

---

You are writing quiz questions for **Folio**, a reading app. Each day Folio shows a handful of book summaries. The last book on the shelf is a quiz asking readers a few questions about what they just read. There is no score: the reader picks an answer, the right one is circled, and they see how much stayed with them.

Your job: for every book summary in this repository, write **5 multiple-choice questions** that test whether someone who read the summary remembers its key ideas.

## Inputs

- `data/catalog.json` lists every library book. Each entry in `books` has:
  - `s`: slug, e.g. `"atomic-habits-summary"`. The book's **id** is the slug without `-summary`, e.g. `atomic-habits`.
  - `t`: title
  - `a`: author (may be empty)
  - `l`: the summary's lesson headlines (may be empty)
- `data/summaries/<id>.md` is the summary the reader sees. **Base every question on this file only.** Don't use outside knowledge of the book. If the summary doesn't say it, don't ask it.

The summaries are by Four Minute Books (Niklas Göke), republished in Folio with permission. Don't copy long passages into questions; see the rules below.

## Output

Write one file per book: `data/quiz/<id>.json`, UTF-8, formatted with 2-space indentation:

```json
{
  "book": "atomic-habits",
  "title": "Atomic Habits",
  "questions": [
    {
      "q": "What four-step loop does every habit follow?",
      "a": ["Cue, craving, response, reward", "Trigger, effort, result, rest", "Goal, plan, action, review", "Signal, routine, habit, identity"],
      "why": "The summary's first lesson breaks every habit into cue, craving, response and reward."
    }
  ]
}
```

| Field | Rule |
|:--|:--|
| `book` | The book's id, exactly matching the file name |
| `title` | The title from the catalog (for humans reading the file; the app ignores it) |
| `questions` | **Exactly 5** objects |
| `q` | The question. Plain text, at most 160 characters, ending with `?` |
| `a` | **Exactly 4** answers. **The first one is the correct answer**; Folio shuffles them each day. Plain text, at most 90 characters each, all different |
| `why` | Optional but encouraged. One sentence, at most 200 characters, saying where in the summary the answer comes from. Shown under the circled answer |

Plain text means no Markdown, HTML, emoji or asterisks. Typographic quotes and apostrophes (’ “ ”) are fine.

## What makes a good question

1. **Test the ideas, not trivia.** Ask about the lessons, the main claims, the key examples and what the author recommends. Avoid page counts, exact years or minor names unless they're central to the summary.
2. **Spread the questions out.** Cover at least three different lessons or sections. If the summary has three lessons, give each one at least one question; use the rest for the overview or the most memorable example.
3. **One clearly right answer.** Someone who read the summary carefully should be sure. The wrong answers must be clearly wrong *according to the summary*, not merely less good.
4. **Plausible wrong answers.** Write distractors that sound like they could belong in a book of the same kind: the same topic, the same tone, similar length and grammar. No jokes, no "all/none of the above", no "both A and B".
5. **Keep it fair.** No trick questions, no double negatives, no "Which of these is NOT…". Don't put the answer's distinctive words in the question.
6. **Parallel answers.** All four answers should be the same kind of thing (four habits, four numbers, four reasons) and roughly the same length, so the right one doesn't stand out.
7. **Paraphrase.** Put ideas in your own words. Never copy more than about eight consecutive words from the summary.
8. **Readable at a glance.** Short questions and answers. Ask "What…", "Why…", "According to the summary, how…".
9. **About the author:** you may ask at most one question about who wrote the book, and only if the summary names the author.

## How to work

1. Read `data/catalog.json`. Work through the books in catalog order, in batches of about 25.
2. **Resume, don't redo.** Skip any book whose `data/quiz/<id>.json` already exists and passes validation (step 4).
3. For each book, read its `data/summaries/<id>.md`, write the 5 questions, and save the file.
4. After every batch, run:

   ```bash
   node tools/quiz/build-index.mjs
   ```

   It checks every quiz file against the rules above and rebuilds `data/quiz/index.json`, the list of books the app will load questions for. Fix every file it reports, then run it again until it reports no problems.
5. Commit after each batch, for example `Quiz: add questions for 25 books (atomic-habits … deep-work)`. Include both the new `data/quiz/*.json` files and the updated `data/quiz/index.json`.
6. Don't edit anything outside `data/quiz/`.

## Check yourself before saving each file

- Could someone who read only this summary answer all 5? Could someone who didn't, not easily guess?
- Is the first answer the correct one, every time?
- Do the 5 questions cover different parts of the summary?
- Are all four answers similar in length and form?
- Is it plain text, with nothing copied at length from the summary?

When every book has a valid file, `build-index.mjs` reports `0 books still without questions`.
