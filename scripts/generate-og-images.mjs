import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();
const POSTS_DIR = join(ROOT, '_posts');
const OUT_DIR = join(ROOT, 'assets', 'og');

// Palette from assets/style.css :root
const C = {
  bg: '#F0F2F5',
  card: '#FFFFFF',
  text: '#1E293B',
  secondary: '#64748B',
  muted: '#94A3B8',
  border: '#E2E8F0',
};

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const result = {};
  for (const line of match[1].split('\n')) {
    const idx = line.indexOf(':');
    if (idx > 0) {
      const key = line.slice(0, idx).trim();
      let val = line.slice(idx + 1).trim();
      val = val.replace(/^["'](.*)["']$/, '$1');
      result[key] = val;
    }
  }
  return result;
}

async function fetchFont(family, weight) {
  const url = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@${weight}`;
  // Use an older UA to get TTF instead of WOFF2 (Satori only supports TTF/OTF)
  const css = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 6.1; Trident/7.0; rv:11.0) like Gecko',
    },
  }).then((r) => r.text());

  const fontUrl = css.match(/src:\s*url\(([^)]+)\)/)?.[1];
  if (!fontUrl) throw new Error(`Font URL not found for ${family}:${weight}`);
  return fetch(fontUrl).then((r) => r.arrayBuffer());
}

// Shared card wrapper
function card(children) {
  return {
    type: 'div',
    props: {
      style: {
        display: 'flex',
        width: '100%',
        height: '100%',
        backgroundColor: C.bg,
        padding: '40px',
        fontFamily: 'Manrope',
      },
      children: {
        type: 'div',
        props: {
          style: {
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            width: '100%',
            height: '100%',
            backgroundColor: C.card,
            borderRadius: '20px',
            border: `2px solid ${C.border}`,
            padding: '60px 64px',
          },
          children,
        },
      },
    },
  };
}

function footer() {
  return {
    type: 'div',
    props: {
      style: {
        display: 'flex',
        alignItems: 'center',
        borderTop: `1px solid ${C.border}`,
        paddingTop: '24px',
      },
      children: {
        type: 'span',
        props: {
          style: { fontSize: '18px', fontWeight: 500, color: C.muted },
          children: 'alainbrown.com',
        },
      },
    },
  };
}

function postElement(title, description) {
  return card([
    {
      type: 'div',
      props: {
        style: {
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          flex: 1,
        },
        children: [
          {
            type: 'div',
            props: {
              style: {
                fontSize: '48px',
                fontWeight: 600,
                fontFamily: 'Newsreader',
                color: C.text,
                lineHeight: 1.2,
                letterSpacing: '-0.02em',
                marginBottom: description ? '20px' : '0',
              },
              children: title,
            },
          },
          ...(description
            ? [
                {
                  type: 'div',
                  props: {
                    style: {
                      fontSize: '22px',
                      color: C.secondary,
                      lineHeight: 1.5,
                    },
                    children: description,
                  },
                },
              ]
            : []),
        ],
      },
    },
    footer(),
  ]);
}

function defaultElement() {
  return card([
    {
      type: 'div',
      props: {
        style: {
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          flex: 1,
        },
        children: [
          {
            type: 'div',
            props: {
              style: {
                fontSize: '54px',
                fontWeight: 600,
                fontFamily: 'Newsreader',
                color: C.text,
                lineHeight: 1.2,
                letterSpacing: '-0.02em',
                marginBottom: '16px',
              },
              children: 'Alain Brown',
            },
          },
          {
            type: 'div',
            props: {
              style: {
                fontSize: '26px',
                color: C.secondary,
                lineHeight: 1.5,
              },
              children: 'Software engineer building AI systems',
            },
          },
        ],
      },
    },
    footer(),
  ]);
}

async function render(element, fonts, outputPath) {
  const svg = await satori(element, { width: 1200, height: 630, fonts });
  const png = new Resvg(svg, {
    fitTo: { mode: 'width', value: 1200 },
  })
    .render()
    .asPng();
  writeFileSync(outputPath, png);
  console.log(`  ${outputPath}`);
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  console.log('Loading fonts...');
  const [newsreader600, manrope400, manrope500] = await Promise.all([
    fetchFont('Newsreader', 600),
    fetchFont('Manrope', 400),
    fetchFont('Manrope', 500),
  ]);

  const fonts = [
    { name: 'Newsreader', data: newsreader600, weight: 600, style: 'normal' },
    { name: 'Manrope', data: manrope400, weight: 400, style: 'normal' },
    { name: 'Manrope', data: manrope500, weight: 500, style: 'normal' },
  ];

  console.log('Generating OG images...');

  // Site-wide default
  await render(defaultElement(), fonts, join(OUT_DIR, 'default.png'));

  // Per-post images
  const posts = readdirSync(POSTS_DIR).filter((f) => f.endsWith('.md'));

  for (const file of posts) {
    const content = readFileSync(join(POSTS_DIR, file), 'utf-8');
    const meta = parseFrontmatter(content);
    const slug = file.replace(/^\d{4}-\d{2}-\d{2}-/, '').replace('.md', '');

    await render(
      postElement(meta.title || slug, meta.description || ''),
      fonts,
      join(OUT_DIR, `${slug}.png`),
    );
  }

  console.log('Done!');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
