#!/usr/bin/env node
/**
 * Rutgers-GPT corpus ingestion.
 *
 * Fetches official Rutgers–New Brunswick pages, converts them to clean Markdown
 * with `## ` sections (which the RAG loader splits into searchable chunks), and
 * writes them to apps/web/data/rutgers-corpus/. Free, no API keys, no training —
 * this is how the agent learns to answer niche questions from primary sources.
 *
 * Usage: node scripts/ingest-corpus.mjs
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CORPUS_DIR = path.join(__dirname, "..", "apps", "web", "data", "rutgers-corpus");

/** Official NB pages. slug -> output file; topic feeds tags; keep NB-only. */
const SOURCES = [
  // Academics / registration
  { slug: "academic-calendar", title: "Rutgers Academic Calendar", url: "https://scheduling.rutgers.edu/academic-calendar/" },
  { slug: "summer-session", title: "Rutgers Summer Session", url: "https://summersession.rutgers.edu/" },
  { slug: "winter-session", title: "Rutgers Winter Session", url: "https://wintersession.rutgers.edu/" },
  { slug: "registrar", title: "Office of the Registrar", url: "https://scarlethub.rutgers.edu/registrar/" },
  { slug: "transcripts", title: "Transcripts & Records", url: "https://scarlethub.rutgers.edu/registrar/transcripts/" },
  // Money
  { slug: "financial-aid", title: "Financial Aid (NB)", url: "https://financialaid.rutgers.edu/" },
  { slug: "financial-services", title: "Financial Services Hub", url: "https://scarlethub.rutgers.edu/financial-services/" },
  { slug: "tuition-fees", title: "Tuition & Fees", url: "https://finance.rutgers.edu/student-abc/tuition-fees" },
  { slug: "billing-payments", title: "Billing & Payments", url: "https://finance.rutgers.edu/student-abc/payments" },
  { slug: "payment-plans", title: "Tuition Payment Plans", url: "https://finance.rutgers.edu/student-abc/payments/rutgers-tuition-payment-plans" },
  { slug: "refunds", title: "Refunds", url: "https://finance.rutgers.edu/student-abc/refunds" },
  // Dining
  { slug: "dining-home", title: "Rutgers Dining Services", url: "https://food.rutgers.edu/" },
  { slug: "dining-about", title: "About Rutgers Dining", url: "https://food.rutgers.edu/about-us/learn-more-about-rutgers-dining" },
  // Transit / parking
  { slug: "parking", title: "Parking (DOTS)", url: "https://ipo.rutgers.edu/dots" },
  // Tech
  { slug: "it-help", title: "Rutgers IT Help", url: "https://it.rutgers.edu/help-support/" },
  { slug: "canvas-help", title: "Canvas Help", url: "https://canvas.rutgers.edu/" },
  // Libraries
  { slug: "libraries-home", title: "Rutgers University Libraries", url: "https://www.libraries.rutgers.edu/" },
  // Advising / academics support
  { slug: "student-success", title: "Student Success / Tutoring", url: "https://success.rutgers.edu/" },
  { slug: "learning-centers", title: "Learning Centers / Tutoring", url: "https://rlc.rutgers.edu/" },
  { slug: "nb-academics", title: "New Brunswick Academics", url: "https://newbrunswick.rutgers.edu/academics" },
  // Housing / life
  { slug: "housing", title: "On-Campus Housing", url: "https://ruoncampus.rutgers.edu/" },
  { slug: "residence-life", title: "Residence Life", url: "https://reslife.rutgers.edu/" },
  // Wellness
  { slug: "health-services", title: "Student Health Services", url: "https://health.rutgers.edu/" },
  { slug: "caps", title: "Counseling (CAPS)", url: "https://health.rutgers.edu/health-services/counseling-psychiatric-services/" },
  // Departments (examples)
  { slug: "cs-department", title: "Computer Science Department", url: "https://www.cs.rutgers.edu/" },
  { slug: "cs-undergrad", title: "CS Undergraduate Program", url: "https://www.cs.rutgers.edu/academics/undergraduate" },
  // Involvement / services
  { slug: "getinvolved", title: "Student Involvement", url: "https://involvement.rutgers.edu/" },
  { slug: "dean-of-students", title: "Dean of Students", url: "https://deanofstudents.rutgers.edu/" },
  { slug: "career-services", title: "Career Exploration & Success", url: "https://careers.rutgers.edu/" },
  { slug: "one-stop", title: "Scarlet Hub (One Stop)", url: "https://scarlethub.rutgers.edu/" },
  { slug: "graduation", title: "Graduation & Commencement", url: "https://commencement.rutgers.edu/" },
  // More student services
  { slug: "study-abroad", title: "Study Abroad (Global)", url: "https://global.rutgers.edu/" },
  { slug: "disability-services", title: "Disability Services (ODS)", url: "https://ods.rutgers.edu/" },
  { slug: "international-students", title: "International Students (ISSS)", url: "https://global.rutgers.edu/international-students-scholars" },
  { slug: "recreation", title: "Rutgers Recreation", url: "https://recreation.rutgers.edu/" },
  { slug: "public-safety", title: "Public Safety (RUPD)", url: "https://publicsafety.rutgers.edu/" },
  { slug: "veterans", title: "Veterans Services", url: "https://veterans.rutgers.edu/" },
  { slug: "first-gen", title: "Educational Opportunity Fund (EOF)", url: "https://eof.rutgers.edu/" },
  { slug: "honors", title: "Honors College", url: "https://honorscollege.rutgers.edu/" },
  // More departments
  { slug: "math-dept", title: "Mathematics Department", url: "https://www.math.rutgers.edu/" },
  { slug: "sas-home", title: "School of Arts & Sciences", url: "https://sas.rutgers.edu/" },
  { slug: "engineering", title: "School of Engineering", url: "https://soe.rutgers.edu/" },
  { slug: "business", title: "Rutgers Business School", url: "https://www.business.rutgers.edu/" },
];

function decodeEntities(s) {
  return s
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;|&rsquo;|&lsquo;/gi, "'")
    .replace(/&quot;|&ldquo;|&rdquo;/gi, '"')
    .replace(/&mdash;/gi, "—")
    .replace(/&ndash;/gi, "–")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/&#\d+;/g, " ");
}

/** HTML -> readable Markdown, preserving h2/h3 as `## ` section breaks. */
function htmlToMarkdown(html) {
  let s = html;
  // drop non-content regions
  s = s.replace(/<script[\s\S]*?<\/script>/gi, " ");
  s = s.replace(/<style[\s\S]*?<\/style>/gi, " ");
  s = s.replace(/<noscript[\s\S]*?<\/noscript>/gi, " ");
  s = s.replace(/<svg[\s\S]*?<\/svg>/gi, " ");
  s = s.replace(/<nav[\s\S]*?<\/nav>/gi, " ");
  s = s.replace(/<footer[\s\S]*?<\/footer>/gi, " ");
  s = s.replace(/<header[\s\S]*?<\/header>/gi, " ");
  s = s.replace(/<form[\s\S]*?<\/form>/gi, " ");
  // headings -> ## ; list items -> - ; paragraphs/breaks -> newlines
  s = s.replace(/<h[1-3][^>]*>/gi, "\n## ").replace(/<\/h[1-3]>/gi, "\n");
  s = s.replace(/<h[4-6][^>]*>/gi, "\n**").replace(/<\/h[4-6]>/gi, "**\n");
  s = s.replace(/<li[^>]*>/gi, "\n- ").replace(/<\/li>/gi, " ");
  s = s.replace(/<\/(p|div|tr|section|article)>/gi, "\n");
  s = s.replace(/<br\s*\/?>/gi, "\n");
  // strip remaining tags + decode
  s = s.replace(/<[^>]+>/g, " ");
  s = decodeEntities(s);
  // tidy whitespace
  s = s
    .split("\n")
    .map((l) => l.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return tidyContent(s);
}

const NAV_NOISE = /^(home|menu|search|close|skip to (main )?content|toggle|back to top|share|print|read more|learn more|apply now|give|donate|login|log in|sign in|main navigation|breadcrumb|footer|header|copyright|all rights reserved|©.*)$/i;

/** Drop nav junk: empty bullets, single-word links, duplicate/menu lines. Keep real sentences + headings. */
function tidyContent(md) {
  const out = [];
  let lastLine = "";
  for (let raw of md.split("\n")) {
    const line = raw.trim();
    if (!line) {
      if (out.length && out[out.length - 1] !== "") out.push("");
      continue;
    }
    const isHeading = line.startsWith("## ") || (line.startsWith("**") && line.endsWith("**"));
    const stripped = line.replace(/^[-*]\s*/, "").replace(/\*\*/g, "").trim();
    if (!isHeading) {
      if (!stripped) continue; // empty bullet
      if (NAV_NOISE.test(stripped)) continue;
      const words = stripped.split(/\s+/).length;
      // keep short lines only if they carry a date/number/colon (e.g. "Fall classes begin: Sep 1")
      const informative = /\d|:|—|–/.test(stripped);
      if (words < 4 && !informative) continue;
      if (stripped === lastLine) continue; // dedupe consecutive
    }
    out.push(isHeading ? line : `- ${stripped}`.replace(/^- (## )/, "$1"));
    lastLine = stripped;
  }
  return out
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^(- )+/gm, "- ")
    .trim();
}

/** Count of substantive (non-bullet-marker, non-heading) characters. */
function contentWeight(md) {
  return md
    .split("\n")
    .filter((l) => !l.startsWith("## ") && l.replace(/^[-*\s]+/, "").length > 0)
    .join(" ")
    .replace(/[-*#\s]+/g, " ")
    .trim().length;
}

async function fetchPage(url) {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: ctrl.signal,
      headers: { "User-Agent": "RutgersGPT/1.0 (+https://rutgers.edu)", Accept: "text/html" },
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const html = await res.text();
    return { ok: true, html };
  } catch (e) {
    return { ok: false, error: e?.message || "fetch failed" };
  } finally {
    clearTimeout(to);
  }
}

function buildCorpusFile(src, markdown) {
  // Cap to keep chunks retrievable; append source to each section for citations.
  const capped = markdown.slice(0, 6000);
  const sections = capped.split(/\n(?=## )/).filter((p) => p.trim().length > 60);
  const head = `## ${src.title}\n\nOfficial Rutgers–New Brunswick source: ${src.url}\n`;
  const body = sections
    .map((sec) => (sec.trim().startsWith("## ") ? sec.trim() : `## ${src.title}\n${sec.trim()}`))
    .map((sec) => `${sec}\n\nSource: ${src.url}`)
    .join("\n\n");
  return `${head}\n${body}\n`;
}

async function main() {
  await fs.mkdir(CORPUS_DIR, { recursive: true });
  const results = [];
  for (const src of SOURCES) {
    process.stdout.write(`• ${src.slug} … `);
    const r = await fetchPage(src.url);
    if (!r.ok) {
      console.log(`SKIP (${r.error})`);
      results.push({ slug: src.slug, ok: false, reason: r.error });
      continue;
    }
    const md = htmlToMarkdown(r.html);
    const weight = contentWeight(md);
    if (weight < 400) {
      console.log(`SKIP (only ${weight} content chars — JS-rendered/nav-only)`);
      results.push({ slug: src.slug, ok: false, reason: `thin (${weight})` });
      continue;
    }
    const file = buildCorpusFile(src, md);
    await fs.writeFile(path.join(CORPUS_DIR, `${src.slug}.md`), file, "utf8");
    console.log(`OK (${file.length} chars)`);
    results.push({ slug: src.slug, ok: true, chars: file.length });
  }

  const ok = results.filter((r) => r.ok);
  const skipped = results.filter((r) => !r.ok);
  console.log(`\n=== Ingested ${ok.length}/${SOURCES.length} pages ===`);
  if (skipped.length) {
    console.log("Skipped:");
    for (const s of skipped) console.log(`  - ${s.slug}: ${s.reason}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
