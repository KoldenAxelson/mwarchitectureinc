#!/usr/bin/env node
/**
 * Reads scrape-tmp/parsed/*.json, filters out WordPress chrome and
 * thumbnail size-variants, downloads the originals into
 *   src/content/projects/images/<slug>/
 * and emits an MDX file per project at
 *   src/content/projects/<slug>.mdx
 *
 * Re-runnable. Skips files that already exist on disk.
 */
import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import { dirname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as wait } from "node:timers/promises";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const PARSED = join(__dirname, "scrape-tmp", "parsed");
const CONTENT_DIR = join(REPO_ROOT, "src", "content", "projects");
const IMAGES_DIR = join(CONTENT_DIR, "images");

const UA =
  "Mozilla/5.0 (compatible; MWArchitectureMigrationBot/1.0)";

const PROJECT_SLUGS = [
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
];

/**
 * Editorial metadata — locations, friendly titles, categories, feature
 * order. Keeps the MDX frontmatter human-curated rather than guessing
 * from <h1> on the legacy site.
 */
const PROJECT_META = {
  "good-land-apartments": {
    title: "Good Land Apartments",
    location: "Goleta, CA",
    categories: ["Multi-family"],
    order: 1,
  },
  "goodstuff-farms-winery": {
    title: "Goodstuff Farms Winery",
    location: "Santa Ynez Valley, CA",
    categories: ["Commercial"],
    order: 2,
  },
  "montecito-estate": {
    title: "Montecito Estate",
    location: "Montecito, CA",
    categories: ["Residential"],
    order: 3,
  },
  "syv-winery": {
    title: "SYV Winery",
    location: "Los Olivos, CA",
    categories: ["Commercial"],
    order: 4,
  },
  "voog-residence": {
    title: "Voog Residence",
    location: "Santa Barbara County, CA",
    categories: ["Residential"],
    order: 5,
  },
  "schluep-residence": {
    title: "Schluep Residence",
    location: "Santa Ynez Valley, CA",
    categories: ["Residential"],
    order: 6,
  },
  "j-street-mixed-use-development": {
    title: "J Street Mixed-Use Development",
    location: "Lompoc, CA",
    categories: ["Multi-family", "Commercial"],
    order: 7,
  },
  "tuscan-estate": {
    title: "Tuscan Estate",
    location: "Santa Barbara County, CA",
    categories: ["Residential"],
    order: 8,
  },
  "the-edge": {
    title: "The Edge",
    location: "Atascadero, CA",
    categories: ["Commercial", "Multi-family"],
    order: 9,
  },
  "central-coast-jet-center": {
    title: "Central Coast Jet Center",
    location: "Santa Maria, CA",
    categories: ["Commercial"],
    order: 10,
  },
  "santa-barbara-villa": {
    title: "Santa Barbara Villa",
    location: "Santa Barbara, CA",
    categories: ["Residential"],
    order: 11,
  },
};

// Strip WordPress chrome (logo, favicon) and Yoast/Elementor headshots that
// aren't part of any project gallery.
const CHROME_PATTERNS = [
  /cropped-Fevicon/i,
  /New-logoo/i,
  /Wade-img/i,
  /Moritz_Willen/i,
];

// WordPress automatically generates -WIDTHxHEIGHT crops alongside the
// original. Prefer originals; reject the auto-crops.
const SIZE_VARIANT_RE = /-\d{2,4}x\d{2,4}\.[a-z]+$/i;

// Elementor cache directory holds wildly mangled "thumbs/" filenames that
// are useless to keep — strip them too.
const ELEMENTOR_THUMB_RE = /\/elementor\/thumbs\//i;

function shouldKeep(url) {
  if (CHROME_PATTERNS.some((re) => re.test(url))) return false;
  if (SIZE_VARIANT_RE.test(url)) return false;
  if (ELEMENTOR_THUMB_RE.test(url)) return false;
  return true;
}

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function ensureDir(p) {
  await mkdir(p, { recursive: true });
}

async function downloadOnce(url, dest) {
  if (await exists(dest)) return { skipped: true };
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`${res.status} on ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(dest, buf);
  return { bytes: buf.length };
}

function dedupeParagraphs(paras) {
  const seen = new Set();
  const out = [];
  for (const p of paras) {
    if (seen.has(p)) continue;
    seen.add(p);
    out.push(p);
  }
  return out;
}

/**
 * Strip the boilerplate "MW Architecture is a design firm…" footer text
 * that bleeds into every page on the legacy site, and any obviously
 * non-project paragraphs.
 */
function isProjectParagraph(p) {
  if (/MW Architecture is a design firm/i.test(p)) return false;
  if (/Skip to content/i.test(p)) return false;
  if (p.length < 60) return false;
  return true;
}

function decodeHtmlEntities(s) {
  return s
    .replace(/&hellip;/g, "…")
    .replace(/&mdash;/g, "—")
    .replace(/&ndash;/g, "–")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'");
}

function pickSummary(description, paragraphs) {
  // Prefer the first sentence of the first paragraph — Yoast's meta description
  // tends to be a hard char cut that breaks mid-clause, which reads badly on
  // the portfolio index card.
  const firstPara = paragraphs[0];
  if (firstPara) {
    const firstSentence = firstPara.match(/^.+?[.!?](?:\s|$)/);
    if (firstSentence) {
      const s = firstSentence[0].trim();
      if (s.length >= 50 && s.length <= 260) return s;
    }
    if (firstPara.length <= 260) return firstPara;
  }
  if (description) {
    return decodeHtmlEntities(description).replace(/\s*\[…\]\s*$/, "").trim();
  }
  return firstPara?.slice(0, 240) || "";
}

/**
 * Format YAML for the frontmatter manually so we keep tight control over
 * formatting (relative paths, arrays, etc.) and don't drag in a yaml dep.
 */
function yamlEscape(s) {
  if (s == null) return '""';
  const needsQuote = /[:#\-?{}\[\]&*!|>'"%@`]/.test(s) || /^\s|\s$/.test(s);
  if (!needsQuote) return s;
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function buildMdx({ slug, meta, summary, paragraphs, coverFile, galleryFiles }) {
  const today = new Date().toISOString().slice(0, 10);

  /**
   * Astro/Vite needs each gallery image to come in as a real import statement
   * so it can be processed by the asset pipeline (and become an
   * ImageMetadata, not just a string path). We emit those imports once at
   * the top of the MDX file and pass the resulting bindings into <Gallery>.
   *
   * The `galleries` array stays in frontmatter for type-safety + use by the
   * portfolio index card, even though the body uses imports.
   */
  const galleries = galleryFiles.length
    ? [{ images: galleryFiles.map((f) => `./images/${slug}/${f}`) }]
    : [];

  const fm = [];
  fm.push("---");
  fm.push(`title: ${yamlEscape(meta.title)}`);
  fm.push(`date: ${today}`);
  fm.push(`location: ${yamlEscape(meta.location)}`);
  fm.push(`summary: ${yamlEscape(summary)}`);
  fm.push(`coverImage: ${yamlEscape(`./images/${slug}/${coverFile}`)}`);
  fm.push(`categories:`);
  for (const c of meta.categories) fm.push(`  - ${yamlEscape(c)}`);
  if (typeof meta.order === "number") fm.push(`order: ${meta.order}`);
  if (galleries.length) {
    fm.push(`galleries:`);
    for (const g of galleries) {
      fm.push(`  - images:`);
      for (const i of g.images) fm.push(`      - ${yamlEscape(i)}`);
    }
  }
  fm.push("---");
  fm.push("");
  // The project page template renders the first frontmatter gallery as a
  // hero carousel automatically — the body just needs to be the prose. If
  // Moritz wants a SECOND inline gallery for a particular project he can
  // import the images and drop in `<Gallery images={[…]} />` by hand
  // (see /scripts/portfolio-template.mdx for the pattern).

  // Body: just the dedup'd / decoded paragraphs.
  const body = paragraphs.map((p) => decodeHtmlEntities(p));
  if (body.length === 0) {
    body.push(summary);
  }
  fm.push(body.join("\n\n"));
  fm.push("");

  return fm.join("\n");
}

async function processProject(slug) {
  const parsedPath = join(PARSED, `${slug}.json`);
  if (!(await exists(parsedPath))) {
    console.log(`  ${slug}: skipped (no parsed JSON)`);
    return;
  }
  const data = JSON.parse(await readFile(parsedPath, "utf8"));

  const meta = PROJECT_META[slug];
  if (!meta) {
    console.log(`  ${slug}: no metadata stub, skipping`);
    return;
  }

  const keptUrls = data.images.filter(shouldKeep);
  if (keptUrls.length === 0) {
    console.log(`  ${slug}: no usable images after filtering`);
    return;
  }

  const slugDir = join(IMAGES_DIR, slug);
  await ensureDir(slugDir);

  const downloadedFiles = [];
  for (const url of keptUrls) {
    const file = basename(url.split("?")[0]);
    const dest = join(slugDir, file);
    try {
      const r = await downloadOnce(url, dest);
      downloadedFiles.push(file);
      if (!r.skipped) await wait(75);
    } catch (err) {
      console.log(`    !! ${file}: ${err.message}`);
    }
  }

  if (downloadedFiles.length === 0) {
    console.log(`  ${slug}: no files downloaded`);
    return;
  }

  const coverFile = downloadedFiles[0];
  const galleryFiles = downloadedFiles; // include cover; first slide doubles as hero

  const paragraphs = dedupeParagraphs(data.paragraphs).filter(
    isProjectParagraph
  );
  const summary = pickSummary(data.description, paragraphs);

  const mdx = buildMdx({
    slug,
    meta,
    summary,
    paragraphs,
    coverFile,
    galleryFiles,
  });

  const mdxPath = join(CONTENT_DIR, `${slug}.mdx`);
  await writeFile(mdxPath, mdx);
  console.log(
    `  ${slug}: ${downloadedFiles.length} images, ${paragraphs.length} paragraphs`
  );
}

async function main() {
  await ensureDir(IMAGES_DIR);
  console.log(`Migrating ${PROJECT_SLUGS.length} projects...`);
  for (const slug of PROJECT_SLUGS) {
    await processProject(slug);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
