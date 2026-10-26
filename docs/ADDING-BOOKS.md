# Adding books

A book in Folio has four parts, all in `index.html`: an entry in the library, a cover, a summary and five quiz questions. More books mean more variety in the daily six.

[← Back to the README](../README.md)

---

## 1. Library entry

Add an object to `LIB`:

```js
{k:'jane', title:'Jane Eyre', author:'Charlotte Brontë', life:'1816–1855 · Thornton', year:1847,
 pages:532, words:183000, rating:4.15,
 genre:'rings', genreName:'Gothic romance',
 accent:'#7a2e3a', base:'#2b1418', ink:'#ecd9c4',
 tex:'cloth', bands:true,
 one:'A plain governess, a locked attic, and a will of iron.',
 syn:'Orphaned and unwanted, Jane Eyre grows up …'}
```

| Field | Used for |
|:--|:--|
| `k` | Unique key. Links the cover, summary and questions |
| `title`, `author`, `year` | Caption, spine, timeline |
| `life` | Shown when you hover the author's name |
| `pages`, `words`, `rating` | The page-stack, reading-time and star glyphs. `pages` also sets the book's thickness |
| `genre`, `genreName` | Which icon from `ICONS` to show, and its hover label |
| `accent` | Glow behind the shelf, timeline marker, headings in the reader |
| `base`, `ink` | Spine, back cover and endpaper colours |
| `tex` | Optional surface: `'cloth'` or `'paper'` |
| `bands` | Optional raised bands on the spine |
| `one` | The one-line hook (quote glyph, back cover, title page) |
| `syn` | Back-cover blurb |

Timeline years run from 1800 to 2000. Extend `Y0` / `Y1` if a book falls outside that range.

## 2. Cover

Add a function to `COVERS` with the same key. It returns SVG markup for a **300 × 450** cover:

```js
jane(p){
  let s = `<defs>${lg(p+'bg', [[0,'#3a1a20'], [1,'#1a0a0d']], 0,0,0,1)}${lg(p+'g', GOLD)}${emb(p)}</defs>
    <rect width="300" height="450" fill="url(#${p}bg)"/>`;
  s += T(150, 200, 'JANE EYRE', `font-family="Cinzel" font-size="30" letter-spacing="6" fill="url(#${p}g)" filter="url(#${p}emb)"`);
  return s;
}
```

- **Always prefix IDs with `p`.** The same cover can appear several times on one page.
- Useful helpers: `lg()` (linear gradient), `GOLD` / `SILVER` (metallic stops), `emb()` (embossed foil), `glowF()` (soft glow), `T()` (centred text), `rng(seed)` (repeatable randomness).
- Keep heavy `feTurbulence` textures out of the live cover. If you need one, bake it into an image the way `LEATHER` does.

## 3. Summary

Add a Markdown block next to the others:

```html
<script type="text/markdown" data-md="jane">
# Jane Eyre

> A plain governess, a locked attic, and a will of iron.

## Gateshead and Lowood
Orphaned Jane is raised by a cold aunt …

## Characters
- **Jane Eyre** — plain, principled, passionate.
- **Edward Rochester** — brooding master of Thornfield.

## Themes
- Independence and self-respect

## Why read it
…
</script>
```

Everything before the first `##` becomes the title page. The renderer supports headings, paragraphs, `-` lists, `>` quotes, `---`, **bold** and *italic*. Aim for about 400 words.

## 4. Quiz questions

Add five questions to `QBANK`. **Put the right answer first**; Folio shuffles the options each day.

```js
jane:[
  {q:'Where does Jane go to school?', a:['Lowood','Gateshead','Thornfield','Moor House']},
  …four more
]
```

Each day three of the five are drawn per book. Only use facts the summary actually covers, since that's what readers will have just read.

## Checklist

- [ ] `LIB` entry with a unique `k`
- [ ] `COVERS[k]`, with every ID prefixed by `p`
- [ ] `<script type="text/markdown" data-md="k">`
- [ ] `QBANK[k]` with five questions, right answer first
- [ ] Optional: a new genre icon in `ICONS` (20 × 20, stroke only)
- [ ] Check it on a phone and in dark mode
- [ ] Optional: regenerate the README's library strip ([Media](MEDIA.md))

> [!NOTE]
> With more than six books in the library, the daily shelf starts to vary more. The quiz book's six gilt diamonds and the "six" wording assume six picks; if you change the count in `PICKS`, update those too.
