# ab10.org

Personal site. Jekyll on GitHub Pages.

## Adding a blog post

1. Create `_posts/YYYY-MM-DD-slug.md`:

```yaml
---
title: "Post title"
date: YYYY-MM-DD
description: "One-sentence summary for SEO and social cards."
image: /assets/og/slug.png
---

Your content here.
```

2. Push to `main`. A GitHub Action generates the OG image and commits it to `assets/og/`.

The `slug` in the `image` path must match the filename after the date
(e.g., `2026-04-01-new-idea.md` → `image: /assets/og/new-idea.png`).

## Local development

```
bundle install   # first time only
bundle exec jekyll serve
```

## OG image generation

```
npm install      # first time only
npm run og       # regenerate all OG images locally
```

## SEO

Handled automatically by plugins (`jekyll-seo-tag`, `jekyll-sitemap`, `jekyll-feed`):

- Meta descriptions from `description` frontmatter
- Open Graph + Twitter Cards from `image` frontmatter
- `sitemap.xml`, `robots.txt`, RSS feed
- JSON-LD structured data (Person, BlogPosting)
