# jayantkhanna.in

Personal portfolio of Jayant Khanna. A single static page on GitHub Pages. No build step.

## Preview locally

```bash
python3 -m http.server 4174
```

Then open http://localhost:4174/. Opening `index.html` directly will not work, because the scripts are ES modules.
Section links: `#about` `#portfolio` `#resume` `#skills` `#reviews` `#blog` `#contact`.

## Files

| File | What it does |
| --- | --- |
| `index.html` | All content |
| `assets/css/main.css` | Design tokens at the top, then sections in page order |
| `assets/js/main.js` | Navigation, smooth scrolling, reveals, parallax, skill groups, reviews, contact form |
| `assets/js/sculpture.js` | The hero: the JK mark and the 40-billion-rows field (plain WebGL2, loads after the page) |
| `assets/js/scenes.js` | The three.js scenes below the hero, one exported function each (loads on first scroll) |
| `assets/js/sound.js` | Soft mallet notes, synthesised, no audio files |
| `assets/js/vendor/` | three.js 0.187 (only the parts used) and Lenis, bundled with esbuild |

## Editing

- **Colours:** palette tokens at the top of `main.css`; each section sets its own `--bg`. The 3D scenes keep their colours in `scenes.js` and `sculpture.js`.
- **Main projects:** the three `<li class="feature">` items.
- **Ring projects:** the JSON inside `<div class="ring">`, plus the matching plain list just above it and the counts on the filter buttons. Images are 720x458 in `assets/images/work/`.
- **Skills:** the `<dl class="skill-list">`; the 3D balls are built from it. `data-x`/`data-y` pick the icon in the sprite.
- **Skill icons:** one sprite, `assets/images/skills-sprite.webp` (8 per row).
- **Swarm shapes:** an element with `data-slot="name"` is where the flock lands; `name` is a key of `shapes` in `scenes.js`.
- **Sound:** on by default but browsers keep it locked until the first click. The header button turns it off and is remembered.
- **Contact form:** posts to Formspree. The hidden `_gotcha` field is a spam trap; leave it empty.

Reduced-motion visitors get still scenes. Without WebGL or with data saver on, the content is all still there.

## SEO checklist

When something changes, update `dateModified` in the JSON-LD and `<lastmod>` in `sitemap.xml`. If the headline facts change (role, client count, sites count), update the `<title>`, meta description, OG tags, JSON-LD and `llms.txt` together.
