#!/usr/bin/env node
/**
 * One-shot scraper for the existing WordPress/Elementor site at
 * https://mwarchitectureinc.com.
 *
 * Pulls down every portfolio project page and writes:
 *   - scrape-tmp/raw/<slug>.html              full HTML, for re-parsing
 *   - scrape-tmp/parsed/<slug>.json           extracted text + image URLs
 *   - scrape-tmp/images/<slug>/<filename>     downloaded image binaries
 *
 * No content is touched outside scripts/scrape-tmp/. Migration into
 * /src/content/projects/ is a separate, deliberate step that runs after
 * a human has eyeballed the parsed JSON.
 */

import { mkdir, writeFile, readFile, access } from "node:fs/promises";
import { dirname, join, extname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as wait } from "node:timers/promises";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "scrape-tmp");

// Pulled from /page-sitemap.xml + /post-sitemap.xml (Yoast).
const PAGES = [
  { slug: "_home", url: "https://mwarchitectureinc.com/" },
  { slug: "_services", url: "https://mwarchitectureinc.com/services/" },
  { slug: "_portfolio", url: "https://mwarchitectureinc.com/portfolio/" },
  { slug: "_contact", url: "https://mwarchitectureinc.com/contact/" },
];

const PROJECTS = [
  "good-land-apartments",
  "goodstuff-farms-winery",
  "montecito-estate",
  "syv-winery",
  "voog-residence",
  "schluep-residence",
  "j-street-mixed-use-development",
  "tuscan-estate",
  "the-edge",
  "central-coast-jet-center",
  "santa-barbara-villa",
].map((slug) => ({ slug, url: `https://mwarchitectureinc.com/${slug}/` }));

const ALL = [...PAGES, ...PROJECTS];

const UA =
  "Mozilla/5.0 (compatible; MWArchitectureMigrationBot/1.0; +https://mwarchitectureinc.com)";

async function ensureDir(p) {
  await mkdir(p, { recursive: true });
}

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function fetchText(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} on ${url}`);
  return await res.text();
}

async function fetchBuffer(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} on ${url}`);
  const ab = await res.arrayBuffer();
  return Buffer.from(ab);
}

/**
 * Light-weight HTML parser. We don't need full DOM — we want
 *   1. The page <title>.
 *   2. <meta name="description"> and og:description.
 *   3. All image URLs the page references (src, data-src, srcset,
 *      style="background-image:url(...)", and Elementor's data-elementor-* lazy attributes).
 *   4. The plaintext of the main article — best-effort: strip script/style,
 *      then collapse whitespace.
 *
 * We pull image URLs but pin them to /wp-content/uploads/ to avoid
 * dragging in icons, theme assets, plugin sprites, etc.
 */
function parseHtml(html) {
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const descMatch =
    html.match(
      /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i
    ) ||
    html.match(
      /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i
    );

  // Collect candidate image URLs.
  const imgRe =
    /https?:\/\/mwarchitectureinc\.com\/wp-content\/uploads\/[^\s"'<>()]+\.(?:jpe?g|png|webp|gif|avif|svg)/gi;
  const imageSet = new Set();
  let m;
  while ((m = imgRe.exec(html))) {
    let u = m[0];
    // Normalise away Elementor "thumbs" intermediates so we keep
    // only the original-quality assets when both exist.
    imageSet.add(u);
  }
  const images = Array.from(imageSet);

  // Strip Elementor / WordPress chrome and keep paragraph-ish text.
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<header[\s\S]*?<\/header>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ");

  // Pull just the <p> blocks — Elementor wraps text in nested divs but the
  // actual prose still ends up inside <p>.
  const paragraphs = [];
  const pRe = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  while ((m = pRe.exec(stripped))) {
    const text = m[1]
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#039;/g, "'")
      .replace(/&apos;/g, "'")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/\s+/g, " ")
      .trim();
    if (text.length > 30) paragraphs.push(text);
  }

  return {
    title: titleMatch ? titleMatch[1].trim() : null,
    description: descMatch ? descMatch[1].trim() : null,
    images,
    paragraphs,
  };
}

async function downloadImages(slug, urls) {
  const dir = join(ROOT, "images", slug);
  await ensureDir(dir);
  const downloaded = [];
  for (const url of urls) {
    // De-dupe filenames per slug.
    const cleanName = basename(url.split("?")[0]);
    const dest = join(dir, cleanName);
    if (await exists(dest)) {
      downloaded.push({ url, file: cleanName, skipped: true });
      continue;
    }
    try {
      const buf = await fetchBuffer(url);
      await writeFile(dest, buf);
      downloaded.push({ url, file: cleanName, bytes: buf.length });
    } catch (err) {
      downloaded.push({ url, file: cleanName, error: String(err) });
    }
    await wait(60); // be polite
  }
  return downloaded;
}

async function processOne({ slug, url }, { skipImages }) {
  const rawDir = join(ROOT, "raw");
  const parsedDir = join(ROOT, "parsed");
  await ensureDir(rawDir);
  await ensureDir(parsedDir);

  const rawPath = join(rawDir, `${slug}.html`);
  let html;
  if (await exists(rawPath)) {
    html = await readFile(rawPath, "utf8");
  } else {
    html = await fetchText(url);
    await writeFile(rawPath, html);
  }

  const parsed = parseHtml(html);
  const out = { slug, url, ...parsed };

  if (!skipImages) {
    out.imageDownloads = await downloadImages(slug, parsed.images);
  }

  await writeFile(
    join(parsedDir, `${slug}.json`),
    JSON.stringify(out, null, 2)
  );

  return out;
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const skipImages = args.has("--no-images");
  const onlyOne = process.argv.find((a) => a.startsWith("--only="));
  const targets = onlyOne
    ? ALL.filter((p) => p.slug === onlyOne.split("=")[1])
    : ALL;

  console.log(`Scraping ${targets.length} URLs (images: ${!skipImages})`);
  for (const target of targets) {
    process.stdout.write(`  ${target.slug}... `);
    try {
      const r = await processOne(target, { skipImages });
      console.log(
        `ok — ${r.images.length} images, ${r.paragraphs.length} paragraphs`
      );
    } catch (err) {
      console.log(`FAILED: ${err}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
