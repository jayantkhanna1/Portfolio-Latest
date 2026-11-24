# jayantkhanna.in

Personal portfolio of Jayant Khanna. A single static page (`index.html`, `assets/css/tidy.css`, `assets/js/script.js`) hosted on GitHub Pages. No build step.

## Preview locally

```bash
python3 -m http.server 4174
```

Then open http://localhost:4174/. Each tab has its own link, e.g. http://localhost:4174/#resume.

## Editing

- **Content:** everything is in `index.html`. Each tab is an `<article data-page="…">`.
- **Accent colours:** the four values at the top of `assets/css/tidy.css` (`--accent`, `--accent-2`, `--accent-soft`, `--danger`). Currently a neon-mint green built on #06F470; alternative palettes are listed in the comment above them. The skill icons, `assets/images/sundar_arrow.svg` and `assets/images/og-image.jpg` have the green baked in, so recolour them too if you switch.
- **Fonts:** Poppins, self-hosted in `assets/fonts/` (latin subset).
- **Icons:** inline SVGs from Ionicons 5, so there is no icon script to load.
- **Projects:** shown in the order they appear in `index.html`, best first. `assets/images/project-roomrr.webp` and `assets/images/project-citadel.webp` are mockups made from screenshots of the live sites; to update one, replace the file (same name, about 1411x896).
- **Contact form:** posts to Formspree. The hidden `_gotcha` field is a spam trap; leave it empty.

## SEO checklist

Already in place: title, meta description, canonical URL, Open Graph and Twitter cards (`assets/images/og-image.jpg`), JSON-LD (Person, WebSite, ProfilePage), `robots.txt`, `sitemap.xml` and `llms.txt`.

When something changes:

- Update `dateModified` in the JSON-LD and `<lastmod>` in `sitemap.xml`.
- If the headline facts change (role, client count, sites count), update the `<title>`, meta description, OG tags, JSON-LD and `llms.txt` together so they agree.
- After deploying, submit `https://jayantkhanna.in/sitemap.xml` in Google Search Console and Bing Webmaster Tools.
