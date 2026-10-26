# Architecture

Folio is a single `index.html` with no build step. This document explains how the parts fit together, for anyone changing the code.

[← Back to the README](../README.md)

---

## Contents

- [Map of the file](#map-of-the-file)
- [The daily shelf](#the-daily-shelf)
- [The 3D shelf](#the-3d-shelf)
- [Covers](#covers)
- [Generated covers](#generated-covers)
- [The library](#the-library)
- [The reader](#the-reader)
- [The quiz](#the-quiz)
- [Theming](#theming)
- [Performance notes](#performance-notes)
- [Accessibility](#accessibility)

---

## Map of the file

| Section | What lives there |
|:--|:--|
| `<head>` | Meta and social tags, icons, the **theme pre-paint script**, fonts, a small base reset |
| Main `<style>` | Design tokens, shelf, caption, timeline, reader, reading mode, quiz, dark theme, theme switch |
| `<main>` | Header (mark, theme switch, calendar, counter), the shelf `#vp`, caption `#details`, timeline `#rail` |
| `#reader` | The overlay: veil, glow, 3D rig (board, spine, pages, cover leaf, turning leaf), morph sheets, chrome |
| `script[type=text/markdown]` | One Markdown summary per book, keyed by `data-md` |
| Main `<script>` | Everything else, in one IIFE (see below) |

Inside the main script, in order:

1. **`LIB`**: the library. One object per book (title, author, year, colours, stats, blurb).
2. **SVG helpers** (`rng`, `lg`, `emb`, `glowF`, …) and **today's shelf** (`DAY`, `PICKS`, `QUIZ`, `BOOKS`).
3. **`LEATHER`** and **`COVERS`**: one function per cover, returning SVG markup.
4. **`ICONS`** and the glyph builders (`stars`, `ring`, `stack`).
5. **Shelf build**: one `.slot > .book` per entry in `BOOKS`, with six faces.
6. **Motion state and `layout()` / `tick()`**: the coverflow.
7. **Caption, timeline and `select()`**.
8. **Input**: pointer drag, wheel, keys.
9. **Reader**: Markdown renderer, geometry, pagination, page turns, open/close, morph.
10. **Quiz**: `QBANK`, today's draw `QZ`, answer storage, page builders, answer handling.
11. **Theme**: the switch, device listener and transitions.

## The daily shelf

```js
DAY    = 'YYYY-MM-DD'                  // local date
seeded = s => rng(hash(s))             // FNV-1a hash → LCG
PICKS  = shuffle(LIB, seeded('shelf:' + DAY)).slice(0, 6)
BOOKS  = PICKS.concat(QUIZ)            // the quiz book is always last
```

Because the seed is only the date, every visitor gets the same six books on the same day with no server, and the shelf changes at local midnight. The quiz uses separate seeds (`'quiz:' + DAY + ':' + bookKey`), so changing the library doesn't reshuffle unrelated questions.

## The 3D shelf

Each book is a `.slot` (positioned along the shelf) holding a `.book` (rotated), with six faces: front, back, spine, fore-edge, top and bottom edges. Thickness `--d` scales with page count.

`tick()` eases `st.pos` toward `st.target` every frame, then `layout()` places every slot from its offset `o = i - st.pos`:

- **x**: spreads neighbours out, then packs distant books more tightly.
- **z**: pushes non-centre books back.
- **rotateY**: about ±58° for side books, plus 16° on the centre book, plus a cursor-driven tilt.

**Lighting.** For each face, `layout()` computes how much it faces a fixed light from its rotation, and sets the opacity of a dark `.sh` overlay on it. The glare's position follows the angle too. Static overlays (`.grain`, `.cloth`, `.light`, `.hinge`, `.edgeline`) supply paper and cloth texture, the spine crease and edge highlights.

Books more than ~5 positions away are hidden and **parked off-stage**. That way they can't paint at the stage centre, and `overflow-x: clip` on the shelf stops them widening the page on phones.

## Covers

Each `COVERS[key](prefix)` returns the inner SVG for a 300×450 cover. `prefix` keeps gradient and filter IDs unique, because the same cover can be in the DOM several times (shelf, reader cover, small covers inside pages).

Recurring techniques:

- **Foil**: multi-stop metallic gradients (`GOLD`, `SILVER`, brass) plus `emb`, a specular-lighting filter that gives lettering a pressed, lit edge.
- **Texture**: `feTurbulence` for grain, leather and mottling.
- **Depth**: soft shadows with `feDropShadow` and blurred shapes.

The quiz book's leather is **pre-rendered once** as an SVG data-URI image (`LEATHER`). That's covered in [Performance notes](#performance-notes).

## Generated covers

Library books get covers from `genCover(book, prefix, lite)`:

1. **Family.** The book's most specific category (the rarest of its categories) maps through `FAMILY_OF` to one of ten families: `ascent`, `mind`, `ledger`, `venture`, `archive`, `cosmos`, `vital`, `sage`, `bonds`, `quill`. Each family has an `ART` function that draws its motif.
2. **Palette.** `PAL[family]` holds four curated palettes (background gradient, ink, foil, app accent, optional cloth or paper surface). The book's id hashes to one of them, so the cover, spine, back, endpaper, glow and reader accents all match.
3. **Layout.** Each family's own `seeded('cover:'+id)` generator places the motif (sun position, ripple count, wave phases…), so no two covers repeat.
4. **Title.** `fitTitle()` measures the real fonts on a canvas and picks the largest size at which the title wraps into the family's line limit. Text is drawn as SVG `<tspan>` lines, in foil with the `emb` emboss filter on dark palettes.
5. **Lite mode.** Library tiles pass `lite = true`, which skips filters and thins dense details so a screen of covers stays smooth. Tiles render only when they near the viewport (`IntersectionObserver`), and `content-visibility` lets the browser skip the rest.

`coverSVG(book)` is the single entry point: hand-drawn `COVERS[k]` for the originals, `genCover` for everything else.

## The library

- `data/catalog.json` is loaded at startup; see [LIBRARY.md](LIBRARY.md) for how it's built. `ALL = LIB (originals) + FMB (catalog)`.
- **Daily picks:** `shuffle(ALL sorted by id, seeded('shelf:'+DAY+':'+N)).slice(0, N)`, with *N* from `localStorage['folio:perday']` (3–12, default 6). Changing *N* in the calendar popover fades the page and reloads it with the new shelf.
- **Library overlay (`#lib`):** tiles are created once. Search, category filter and sort only toggle `hidden` and set CSS `order` from three precomputed orders (A–Z, newest, shortest), so typing stays instant with 1,300+ books.
- **Opening from a tile:** `openBook(null, {book, el})` flies the reader's book from the tile's cover rect (flat, no shelf tilt) and hides that tile while open.

## The reader

### Two modes

| Mode | Purpose | Geometry (`geo()`) |
|:--|:--|:--|
| `book` | The realistic object that flies in and opens | 2:3 pages, cream paper, board, spine, cover |
| `read` | Comfortable reading | Up to 600 px wide pages, up to ~1.85:1 tall on phones, flat, quiet |

Two pages show side by side when the window is at least **760 px** wide, otherwise one.

### Opening sequence (`openBook`)

1. The rig starts exactly where the shelf book is: `fromT()` reads the front face's bounding box and builds a matching transform.
2. It glides to the centre (`midT()`).
3. The cover leaf turns −180° on the spine while the rig re-centres the spread.
4. **`morphTo('read')`**: plain paper sheets cover the pages, the 3D scene fades out under them, and the geometry switches to reading mode. The sheets then glide (FLIP) and recolour to the new page size, and dissolve to reveal the re-laid pages.

`closeBook` runs the same steps in reverse and lands the book back in its slot.

### Pagination

The summary Markdown is rendered once to HTML (`md()` handles headings, paragraphs, lists, quotes, rules, bold and italics). Each page is a window onto the same flow:

```css
.flow { width: var(--r-iw); height: var(--r-ih);
        column-width: var(--r-iw); column-gap: var(--r-gap); column-fill: auto; }
```

Page *n* is that flow translated by `n × (width + gap)`. The page count comes from the position of an end marker in a hidden measuring copy. The title page is a full-height `.opening` section that ends with a column break.

### The page model

`R.r` is the index of the **right-hand page**. The left page is `L(r)`:

```js
L(r) = r === 0 ? (mode === 'read' ? 'front' : null) : r - 1
```

`null` shows the endpaper (the inside of the cover). `'front'` is the cover-and-glyphs page shown in reading mode. A turn uses one reusable leaf (`#rLeaf`):

- **Forward**: the leaf's front shows the current right page and its back shows the next left page. The page underneath already shows the next right page. The leaf rotates 0 → −180°.
- **Backward**: the same, mirrored.

Resting pages sit on the **z = 0 plane** so text stays sharp. The turning leaf rides slightly above them, and an opened cover rests just below. Shading on both sides of the leaf, and a shadow cast on the page underneath, follow the turn.

## The quiz

```js
QBANK[bookKey] = [{ q, a: [right, wrong, wrong, wrong] }, …5]  // first answer is the right one
QZ = PICKS.flatMap(book => three of its five, options shuffled, c = index of the right one)
```

- Answers are saved to `localStorage['folio:quiz:YYYY-MM-DD']` as `{ questionId: chosenIndex }`. This is wrapped in `try/catch`, so the quiz works without storage.
- Quiz pages are built by `quizPages()`: title, then for each question a small-cover page (two-page layout only) and a question page, then a closing spread.
- Answering re-renders the right-hand page with a `.now` flag. That plays the ink circle draw (`stroke-dashoffset` on a hand-drawn path with `pathLength="1"`), the strike-through, and the fade of the other options. Pages rendered later show the result without replaying it.

## Theming

- **Tokens.** Global colours (`--bg`, `--ink`, `--hair`, `--veil`, `--floor1`…) live on `:root` and are redefined under `:root[data-theme="dark"]`.
- **Accents.** `--accent` is set per book from JavaScript. `--acc` is the version used for lines and text. In dark mode it's mixed toward white (`color-mix(in oklab, …)`) for contrast, while glows keep the raw accent.
- **Page palette.** Pages carry their own tokens (`--p-bg`, `--p-ink`, `--p-strong`…). The realistic book keeps cream paper in both themes; only reading-mode pages switch to charcoal in dark mode.
- **No flash.** An inline script in `<head>` sets `data-theme` before first paint: a saved choice wins, otherwise the device setting.
- **Switching.** `setTheme()` uses `document.startViewTransition` and animates a `clip-path` circle on `::view-transition-new(root)`, starting from the switch. Without View Transitions, or with Reduce Motion on, a short `.theming` crossfade is used instead.
- **Back to auto.** Choosing the scheme the device already prefers removes the saved choice, so Folio follows the device again. Device changes are followed live while no choice is saved.

## Performance notes

- **Baked leather.** The quiz cover's turbulence and lighting filters run once, inside an `<image>`. Chrome paints live filters on 3D-transformed layers progressively, which showed up as a grey cloud on first load.
- **Off-stage parking.** Hidden books get a far transform instead of keeping a stale one.
- **One rAF loop** drives the shelf. The reader uses the Web Animations API with `commitStyles()` and then cancels, so finished animations don't pile up.
- **Crisp text.** Resting pages share one depth plane; nothing that holds text is offset in z.

## Accessibility

- Everything is reachable by keyboard; glyph details show on `:focus-visible` as well as hover.
- The reader is a `role="dialog"` with `aria-modal`, and gets focus when it opens.
- Buttons have labels (`aria-label`); the theme switch sets `aria-pressed`.
- `prefers-reduced-motion` makes transitions instant and turns off decorative animation.
