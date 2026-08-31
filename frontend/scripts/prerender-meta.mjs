// Post-build per-route <head> prerender.
//
// The app is a client-rendered SPA: react-helmet-async sets per-route <title>/meta
// only after JS runs. Search-engine crawlers that render JS eventually see it, but
// social scrapers (Facebook, LinkedIn, Slack, X, WhatsApp, Telegram) and non-JS
// crawlers read the static HTML — where every route otherwise serves the homepage's
// meta. This script writes dist/<route>/index.html with the correct head per public
// route. nginx (`try_files $uri $uri/ /index.html` + `index index.html`) serves those
// files automatically, then the SPA boots and renders the matching route as usual.
//
// It only rewrites <head> string content — it never renders React — so it cannot crash
// on browser-only APIs and cannot break the build.

import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const DIST = join(ROOT, 'dist');
const BLOG_DIR = join(ROOT, 'content', 'blog');
const BASE_URL = 'https://washflow.solutions';
const DEFAULT_IMAGE = `${BASE_URL}/screenshots/orders.png`;

const escapeAttr = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

// Static public routes — titles/descriptions mirror each page's <Seo> props.
const STATIC_ROUTES = [
  {
    path: '/blog',
    title: 'Blog',
    description:
      'Car wash business tips, guides, and software insights. Learn how to manage your car wash more efficiently with WashFlow.',
  },
  { path: '/how-to', title: 'How To', description: 'Learn how to use WashFlow effectively' },
  {
    path: '/legal/privacy',
    title: 'Privacy Policy',
    description: 'How WashFlow collects, uses, and protects your personal data.',
  },
  {
    path: '/legal/terms',
    title: 'Terms and Conditions',
    description: 'Terms and conditions governing your use of WashFlow.',
  },
  {
    path: '/legal/refund',
    title: 'Refund Policy',
    description: 'WashFlow refund and cancellation policy.',
  },
];

function parseFrontmatter(raw) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(raw);
  if (!match) return {};
  const data = {};
  for (const line of match[1].split('\n')) {
    const sep = line.indexOf(':');
    if (sep === -1) continue;
    const key = line.slice(0, sep).trim();
    const val = line
      .slice(sep + 1)
      .trim()
      .replace(/^["']|["']$/g, '');
    if (key) data[key] = val;
  }
  return data;
}

async function blogRoutes() {
  if (!existsSync(BLOG_DIR)) return [];
  const files = (await readdir(BLOG_DIR)).filter((f) => f.endsWith('.md'));
  const routes = [];
  for (const file of files) {
    const raw = await readFile(join(BLOG_DIR, file), 'utf8');
    const fm = parseFrontmatter(raw);
    const slug = fm.slug || file.replace(/\.md$/, '');
    routes.push({
      path: `/blog/${slug}`,
      title: fm.title || slug,
      description: fm.description || '',
      image: fm.image
        ? fm.image.startsWith('http')
          ? fm.image
          : `${BASE_URL}${fm.image}`
        : undefined,
      lang: fm.lang === 'uk' ? 'uk' : undefined,
      article: fm.date ? { publishedTime: fm.date } : undefined,
    });
  }
  return routes;
}

// Replace the first match of `regex` with `value` (function replacer avoids `$&` traps).
const replaceTag = (html, regex, value) => html.replace(regex, () => value);

function renderHead(template, route) {
  const pageTitle = `${route.title} | WashFlow`;
  const url = `${BASE_URL}${route.path}`;
  const ogImage = route.image || DEFAULT_IMAGE;
  const ogType = route.article ? 'article' : 'website';
  const t = escapeAttr(pageTitle);
  const d = escapeAttr(route.description);

  let html = template;
  html = replaceTag(html, /<title>[\s\S]*?<\/title>/, `<title>${escapeAttr(pageTitle)}</title>`);
  html = replaceTag(html, /<meta name="description" content="[\s\S]*?"\s*\/>/, `<meta name="description" content="${d}" />`);
  html = replaceTag(html, /<link rel="canonical"[^>]*\/>/, `<link rel="canonical" href="${url}" />`);
  html = replaceTag(html, /<meta property="og:type" content="[^"]*"\s*\/>/, `<meta property="og:type" content="${ogType}" />`);
  html = replaceTag(html, /<meta property="og:title" content="[\s\S]*?"\s*\/>/, `<meta property="og:title" content="${t}" />`);
  html = replaceTag(html, /<meta property="og:description" content="[\s\S]*?"\s*\/>/, `<meta property="og:description" content="${d}" />`);
  html = replaceTag(html, /<meta property="og:url" content="[^"]*"\s*\/>/, `<meta property="og:url" content="${url}" />`);
  html = replaceTag(html, /<meta property="og:image" content="[^"]*"\s*\/>/, `<meta property="og:image" content="${escapeAttr(ogImage)}" />`);
  html = replaceTag(html, /<meta name="twitter:title" content="[\s\S]*?"\s*\/>/, `<meta name="twitter:title" content="${t}" />`);
  html = replaceTag(html, /<meta name="twitter:description" content="[\s\S]*?"\s*\/>/, `<meta name="twitter:description" content="${d}" />`);
  html = replaceTag(html, /<meta name="twitter:image" content="[^"]*"\s*\/>/, `<meta name="twitter:image" content="${escapeAttr(ogImage)}" />`);

  // Homepage hreflang alternates are wrong on sub-routes — strip them.
  html = html.replace(/\s*<link rel="alternate" hreflang="[^"]*" href="[^"]*"\s*\/>/g, '');

  if (route.lang === 'uk') html = html.replace(/<html lang="en"/, '<html lang="uk"');

  if (route.article) {
    const articleLd = {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: pageTitle,
      datePublished: route.article.publishedTime,
      image: ogImage,
      url,
      publisher: { '@type': 'Organization', name: 'WashFlow', url: BASE_URL },
    };
    const script = `<script type="application/ld+json">\n${JSON.stringify(articleLd, null, 2).replace(/</g, '\\u003c')}\n</script>\n  </head>`;
    html = html.replace('</head>', script);
  }

  return html;
}

async function main() {
  if (!existsSync(join(DIST, 'index.html'))) {
    console.error('[prerender-meta] dist/index.html not found — run `vite build` first.');
    process.exit(1);
  }
  const template = await readFile(join(DIST, 'index.html'), 'utf8');
  const routes = [...STATIC_ROUTES, ...(await blogRoutes())];

  let written = 0;
  for (const route of routes) {
    const outDir = join(DIST, route.path.replace(/^\//, ''));
    await mkdir(outDir, { recursive: true });
    await writeFile(join(outDir, 'index.html'), renderHead(template, route), 'utf8');
    written += 1;
  }
  console.log(`[prerender-meta] wrote ${written} per-route HTML files (${routes.length} public routes).`);
}

main().catch((err) => {
  console.error('[prerender-meta] failed:', err);
  process.exit(1);
});
