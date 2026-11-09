// Builds the SEO landing pages, their example cover images and the sitemap.
// Usage: node tools/build-pages.mjs [https://base-url]   (default: the live site address)
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { NAMES, THEMES, SUBJECTS, PHASES, INTENTS } from "./pages-data.mjs";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const BASE = (process.argv[2] || process.env.SITE_BASE || "https://schoolbookcovers.netlify.app").replace(/\/$/, "");
const TODAY = new Date().toISOString().slice(0, 10);
const IMG_DIR = path.join(ROOT, "img", "covers");
fs.mkdirSync(IMG_DIR, { recursive: true });

const esc = s => String(s).replace(/[&<>"]/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[m]));
const slugify = s => s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const imgName = (subject, theme) => `${slugify(subject)}-${theme}.jpg`;
const appLink = (q) => "/?" + new URLSearchParams(q).toString() + "#maker";

// ---------- collect pages ----------
const pages = [];
const subjectList = Object.keys(SUBJECTS);
subjectList.forEach((sub, i) => {
  const d = SUBJECTS[sub];
  const short = sub.replace("Economic & Management Sciences", "EMS").replace("Computer Applications Technology", "CAT").replace("Information Technology", "IT").replace("Engineering Graphics & Design", "EGD");
  pages.push({
    slug: d.slug, group: "Subjects", label: `${short} book covers`,
    title: `${short} Book Covers – Printable with Your Child's Name | School Book Covers`,
    desc: `Printable ${sub} school book covers for ${d.phases}, with your child's name, grade and school. 12 themes, A4, print at home. First set R50.`,
    h1: `${sub} book covers`,
    lead: `Matching, printable ${sub} covers for ${d.phases}, with your child's name, grade and school already on them.`,
    body: [d.note, `Pick any of the 12 themes and the ${sub} cover keeps its own colour and icon, so it's easy to spot next to the other subjects. Add the rest of your child's subjects and print every cover in one PDF.`],
    examples: d.themes.map((t, k) => [sub, t, NAMES[(i + k) % NAMES.length], ["4", "8", "11"][k]]),
    cta: { subject: sub },
    faq: [[`Can I make more than one ${sub} cover?`, `Yes. Set Copies to 2, 3 or 4 for subjects with more than one book, and each copy is added to the PDF.`],
          [`Does the ${sub} cover show my child's grade?`, `Yes, the name, grade and (optionally) school and year are printed on every cover. Grades up to 4 characters work, for example 8, 8B or 12A.`]],
  });
});
PHASES.forEach((p, i) => pages.push({
  slug: p.slug, group: "Grades", label: p.title,
  title: `${p.title} – Printable ${p.phase} Covers | School Book Covers`,
  desc: `Printable book covers for ${p.grades} (${p.phase}) with your child's name on every subject: ${p.subjects.slice(0, 5).join(", ")} and more. A4, print at home.`,
  h1: `${p.title}`,
  lead: `Every ${p.phase} subject, with your child's name and grade, in one printable PDF.`,
  body: [p.intro, `Start with the ${p.phase} subject list already filled in: ${p.subjects.join(", ")}. Remove what your school doesn't use, add your own subjects, and set copies for subjects that need two books.`],
  examples: p.subjects.slice(0, 4).map((s, k) => [s, p.theme, NAMES[(i * 3 + k) % NAMES.length], p.grade]),
  cta: { phase: p.key, theme: p.theme },
  faq: [[`Which subjects are included for ${p.grades}?`, `${p.subjects.join(", ")}. You can add or remove subjects, or type your own.`],
        [`Can I do covers for more than one child?`, `Yes. Your first set is R50 and the 2nd and 3rd set in the same pack are R25 each, so siblings in different grades each get their own name, subjects and theme.`]],
}));
Object.entries(THEMES).forEach(([key, t], i) => pages.push({
  slug: t.slug, group: "Themes", label: t.title,
  title: `${t.title} – Printable with Name | School Book Covers`,
  desc: `${t.title} for ${t.who}. ${t.desc.split(".")[0]}. Printable A4 with your child's name, grade and subject.`,
  h1: t.title,
  lead: `The ${t.name} theme, made for ${t.who}.`,
  body: [t.desc, `Every subject gets its own colour and icon inside the ${t.name} design, so the books match but are still easy to tell apart. It works for all 26 subjects and every grade.`],
  examples: ["Mathematics", "English", "Natural Sciences"].map((s, k) => [s, key, NAMES[(i + k * 2) % NAMES.length], ["6", "8", "10"][k]]),
  cta: { theme: key },
  faq: [[`Can I use ${t.name} for every subject?`, `Yes, choose ${t.name} once and every cover in the PDF uses it.`],
        [`Can siblings use different themes?`, `Yes. Each set (one learner) has its own name, subjects and theme.`]],
}));
INTENTS.forEach((it, i) => pages.push({
  slug: it.slug, group: "Guides", label: it.title,
  title: `${it.title} | School Book Covers`,
  desc: `${it.body.split(". ")[0]}. 12 themes, 26 subjects, A4 PDF.`.slice(0, 158),
  h1: it.h1, lead: it.body.split(". ")[0] + ".", body: [it.body, "Designing and previewing is free. Downloading the print-ready PDF costs R50 for the first set (one learner), and R25 each for the 2nd and 3rd set in the same pack. Each pack lasts 4 months."],
  examples: it.examples.map(([s, t], k) => [s, t, NAMES[(i + k * 3) % NAMES.length], ["3", "7", "9"][k]]),
  cta: {},
  faq: [["Do I need special paper?", "No. Plain A4 printer paper works. Print at Actual size, then cover the book with clear plastic."],
        ["Does it work on a phone?", "Yes, it works in Safari on iPhone and Chrome on Android, as well as on computers."]],
}));

// ---------- render images ----------
async function renderImages() {
  const need = new Map();
  pages.forEach(p => p.examples.forEach(([s, t, n, g]) => need.set(imgName(s, t), [s, t, n, g])));
  const todo = [...need.entries()].filter(([f]) => !fs.existsSync(path.join(IMG_DIR, f)) || process.env.FORCE_IMG);
  if (!todo.length) return need.size;
  const { chromium } = require("playwright");
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8").replace("window.__bcm=drawCover;", "window.__bcm=drawCover;window.__st=()=>state;");
  const tmp = path.join(ROOT, ".render-tmp.html"); fs.writeFileSync(tmp, html);
  const b = await chromium.launch(); const pg = await b.newPage();
  await pg.goto("file://" + tmp); await pg.waitForTimeout(1500);
  for (const [file, [s, t, n, g]] of todo) {
    const data = await pg.evaluate(([s, t, n, g]) => { const st = window.__st(); Object.assign(st, { name: n, grade: g, school: "", year: "2027" }); const cv = document.createElement("canvas"); window.__bcm(cv, { s, n: 1 }, 0, 600, t, true); return cv.toDataURL("image/jpeg", 0.82); }, [s, t, n, g]);
    fs.writeFileSync(path.join(IMG_DIR, file), Buffer.from(data.split(",")[1], "base64"));
  }
  await b.close(); fs.unlinkSync(tmp);
  return need.size;
}

// ---------- page template ----------
const CSS = `:root{--bg:#F3F4F7;--panel:#fff;--ink:#14161A;--muted:#5B6270;--line:#DADDE3;--accent:#2F55D4}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#111317;--panel:#1A1D23;--ink:#ECEEF2;--muted:#9AA1AD;--line:#2D323B;--accent:#7D9BFF}}
:root[data-theme="dark"]{--bg:#111317;--panel:#1A1D23;--ink:#ECEEF2;--muted:#9AA1AD;--line:#2D323B;--accent:#7D9BFF}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif}
a{color:var(--accent)}.wrap{max-width:980px;margin:0 auto;padding:0 16px}
.nav{background:var(--panel);border-bottom:1px solid var(--line);position:sticky;top:0;z-index:5}.nav .wrap{display:flex;align-items:center;gap:12px;height:58px}
.brand{display:flex;align-items:center;gap:8px;font-weight:800;color:var(--ink);text-decoration:none;margin-right:auto;font-size:17px}.brand em{font-style:normal;color:var(--accent)}
.btn{display:inline-flex;align-items:center;justify-content:center;padding:11px 18px;border-radius:10px;background:var(--accent);color:#fff;font-weight:700;text-decoration:none;border:0}
.btn.ghost{background:var(--panel);color:var(--ink);border:1px solid var(--line)}
.crumbs{font-size:13px;color:var(--muted);margin:18px 0 4px}.crumbs a{color:var(--muted)}
h1{font-size:clamp(28px,5vw,44px);line-height:1.1;margin:6px 0 10px;letter-spacing:-.5px}.lead{font-size:18px;color:var(--muted);margin:0 0 18px;max-width:720px}
.hero{display:grid;grid-template-columns:1.1fr 1fr;gap:24px;align-items:center;padding:8px 0 22px}@media(max-width:760px){.hero{grid-template-columns:1fr}}
.covers{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px}.hero .covers{grid-template-columns:repeat(3,minmax(0,1fr))}.covers figure{margin:0}.covers img{width:100%;height:auto;border-radius:8px;box-shadow:0 8px 24px rgba(20,22,26,.14);background:#fff;display:block}.covers figcaption{font-size:12px;color:var(--muted);margin-top:6px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:18px 20px;margin:16px 0}
.card h2{font-size:22px;margin:0 0 8px}.steps{margin:0;padding-left:20px}.steps li{margin:4px 0}
.price{display:flex;flex-wrap:wrap;gap:10px;margin-top:10px}.price span{border:1px solid var(--line);border-radius:999px;padding:4px 12px;font-size:14px;background:var(--bg)}
details{border-bottom:1px solid var(--line);padding:10px 0}summary{cursor:pointer;font-weight:700}
.links{columns:3 200px;column-gap:18px;padding:0;list-style:none;margin:0}.links li{margin:3px 0;break-inside:avoid}.links a{text-decoration:none}
.ctas{display:flex;flex-wrap:wrap;gap:10px;margin:6px 0 4px}
footer{color:var(--muted);font-size:13px;padding:26px 0 40px}`;

const LOGO = `<svg width="30" height="30" viewBox="0 0 64 64" aria-hidden="true"><rect x="8" y="12" width="30" height="40" rx="4" fill="#F07800" transform="rotate(-14 23 32)"/><rect x="26" y="12" width="30" height="40" rx="4" fill="#2E9E44" transform="rotate(12 41 32)"/><rect x="17" y="8" width="30" height="44" rx="4" fill="#2F55D4"/><rect x="22" y="14" width="20" height="6" rx="2" fill="#fff"/><rect x="22" y="40" width="20" height="5" rx="2" fill="#E63946"/></svg>`;

function related(p) {
  const same = pages.filter(x => x.group === p.group && x.slug !== p.slug).slice(0, 9);
  const other = pages.filter(x => x.group !== p.group).filter((_, k) => k % 5 === pages.indexOf(p) % 5).slice(0, 6);
  return [...same, ...other];
}

function page(p) {
  const url = `${BASE}/covers/${p.slug}/`;
  const imgs = p.examples.map(([s, t, n, g]) => ({ src: `/img/covers/${imgName(s, t)}`, alt: `${s} school book cover in the ${THEMES[t].name} theme with the name ${n.split(" ")[0]} and Grade ${g}`, cap: `${s} · ${THEMES[t].name}` }));
  const ld = { "@context": "https://schema.org", "@graph": [
    { "@type": "WebPage", "@id": url, url, name: p.title, description: p.desc, inLanguage: "en-ZA", isPartOf: { "@type": "WebSite", name: "School Book Covers", url: BASE + "/" }, primaryImageOfPage: BASE + imgs[0].src, dateModified: TODAY },
    { "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "School Book Covers", item: BASE + "/" }, { "@type": "ListItem", position: 2, name: "Book covers", item: BASE + "/covers/" }, { "@type": "ListItem", position: 3, name: p.label, item: url }] },
    { "@type": "FAQPage", mainEntity: p.faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) },
  ] };
  return `<!doctype html>
<html lang="en-ZA"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(p.title)}</title>
<meta name="description" content="${esc(p.desc)}">
<link rel="canonical" href="${url}">
<meta name="robots" content="index, follow, max-image-preview:large">
<meta property="og:type" content="website"><meta property="og:site_name" content="School Book Covers"><meta property="og:title" content="${esc(p.title)}"><meta property="og:description" content="${esc(p.desc)}"><meta property="og:url" content="${url}"><meta property="og:image" content="${BASE}${imgs[0].src}"><meta property="og:locale" content="en_ZA">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="/apple-touch-icon.png">
<script type="application/ld+json">${JSON.stringify(ld)}</script>
<style>${CSS}</style></head>
<body>
<nav class="nav"><div class="wrap"><a class="brand" href="/">${LOGO}<span>School Book <em>Covers</em></span></a><a class="btn" href="${appLink(p.cta)}">Make covers</a></div></nav>
<main class="wrap">
<p class="crumbs"><a href="/">Home</a> › <a href="/covers/">Book covers</a> › ${esc(p.label)}</p>
<section class="hero"><div><h1>${esc(p.h1)}</h1><p class="lead">${esc(p.lead)}</p>
<div class="ctas"><a class="btn" href="${appLink(p.cta)}">Start designing, it's free</a><a class="btn ghost" href="/#pricing">From as little as R50</a></div></div>
<div class="covers">${imgs.slice(0, 3).map(im => `<figure><img src="${im.src}" width="600" height="849" alt="${esc(im.alt)}" data-pin-description="${esc(im.alt)}. Make yours with your child's name at schoolbookcover.co.za" loading="eager" decoding="async"><figcaption>${esc(im.cap)}</figcaption></figure>`).join("")}</div></section>
${imgs.length > 3 ? `<div class="covers" style="margin-bottom:12px">${imgs.slice(3).map(im => `<figure><img src="${im.src}" width="600" height="849" alt="${esc(im.alt)}" data-pin-description="${esc(im.alt)}. Make yours with your child's name at schoolbookcover.co.za" loading="lazy" decoding="async"><figcaption>${esc(im.cap)}</figcaption></figure>`).join("")}</div>` : ""}
<section class="card">${p.body.map(t => `<p>${esc(t)}</p>`).join("")}</section>
<section class="card"><h2>How it works</h2><ol class="steps"><li>Type your child's name and grade (and school, if you like).</li><li>Pick the subjects and one of 12 themes. Preview every cover for free.</li><li>Unlock and download one PDF, then print on A4 at home.</li></ol>
<div class="price"><span>First set R50</span><span>2nd &amp; 3rd set R25 each</span><span>Valid 4 months</span><span>Secure Payfast checkout</span></div>
<p style="margin:14px 0 0"><a class="btn" href="${appLink(p.cta)}">Make my covers</a></p></section>
<section class="card"><h2>Questions</h2>${p.faq.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join("")}<p style="margin-top:12px"><a href="/#faq">More questions and answers</a></p></section>
<section class="card"><h2>More book covers</h2><ul class="links">${related(p).map(r => `<li><a href="/covers/${r.slug}/">${esc(r.label)}</a></li>`).join("")}<li><a href="/covers/">All book covers</a></li><li><a href="/#schools">Bulk pricing for schools</a></li></ul></section>
</main>
<footer><div class="wrap">© ${new Date().getFullYear()} Velvik (Pty) Ltd · School Book Covers · <a href="mailto:coetzerdominique25@gmail.com">coetzerdominique25@gmail.com</a> · <a href="/#policies">Refunds and privacy</a></div></footer>
</body></html>`;
}

function hub() {
  const url = `${BASE}/covers/`;
  const groups = ["Subjects", "Grades", "Themes", "Guides"];
  const ld = { "@context": "https://schema.org", "@graph": [
    { "@type": "CollectionPage", "@id": url, url, name: "Printable school book covers by subject, grade and theme", inLanguage: "en-ZA", isPartOf: { "@type": "WebSite", name: "School Book Covers", url: BASE + "/" } },
    { "@type": "ItemList", itemListElement: pages.map((p, i) => ({ "@type": "ListItem", position: i + 1, url: `${BASE}/covers/${p.slug}/`, name: p.label })) },
    { "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "School Book Covers", item: BASE + "/" }, { "@type": "ListItem", position: 2, name: "Book covers", item: url }] },
  ] };
  return `<!doctype html>
<html lang="en-ZA"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Printable School Book Covers by Subject, Grade and Theme | School Book Covers</title>
<meta name="description" content="Browse printable school book covers for every South African subject and grade, from Grade R to Grade 12, in 12 themes for boys, girls and teens.">
<link rel="canonical" href="${url}"><meta name="robots" content="index, follow, max-image-preview:large">
<meta property="og:title" content="Printable school book covers by subject, grade and theme"><meta property="og:url" content="${url}"><meta property="og:image" content="${BASE}/og-image.png">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<script type="application/ld+json">${JSON.stringify(ld)}</script>
<style>${CSS}.grp{margin:22px 0}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:14px}.grid a{text-decoration:none;color:var(--ink);font-size:14px;font-weight:600}.grid img{width:100%;height:auto;border-radius:8px;box-shadow:0 6px 18px rgba(20,22,26,.12);display:block;margin-bottom:6px;background:#fff}</style></head>
<body>
<nav class="nav"><div class="wrap"><a class="brand" href="/">${LOGO}<span>School Book <em>Covers</em></span></a><a class="btn" href="/#maker">Make covers</a></div></nav>
<main class="wrap"><p class="crumbs"><a href="/">Home</a> › Book covers</p>
<h1>Printable school book covers</h1><p class="lead">Pick a subject, grade or theme to see examples, then make your own with your child's name in minutes.</p>
${groups.map(g => `<section class="grp"><h2>${g === "Guides" ? "Popular searches" : "By " + g.toLowerCase().replace(/s$/, "")}</h2><div class="grid">${pages.filter(p => p.group === g).map(p => { const [s, t] = p.examples[0]; return `<a href="/covers/${p.slug}/"><img src="/img/covers/${imgName(s, t)}" width="600" height="849" loading="lazy" decoding="async" alt="${esc(p.label)} example">${esc(p.label)}</a>`; }).join("")}</div></section>`).join("")}
</main>
<footer><div class="wrap">© ${new Date().getFullYear()} Velvik (Pty) Ltd · School Book Covers · <a href="/">Make covers</a></div></footer>
</body></html>`;
}

function sitemap() {
  const urls = [{ loc: BASE + "/", pr: "1.0" }, { loc: BASE + "/covers/", pr: "0.8" }, ...pages.map(p => ({ loc: `${BASE}/covers/${p.slug}/`, pr: "0.7", img: p.examples.map(([s, t]) => `${BASE}/img/covers/${imgName(s, t)}`) }))];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${urls.map(u => `  <url><loc>${u.loc}</loc><lastmod>${TODAY}</lastmod><priority>${u.pr}</priority>${(u.img || []).map(i => `<image:image><image:loc>${i}</image:loc></image:image>`).join("")}</url>`).join("\n")}
</urlset>
`;
}

const n = await renderImages();
const outRoot = path.join(ROOT, "covers");
fs.mkdirSync(outRoot, { recursive: true });
for (const p of pages) { const d = path.join(outRoot, p.slug); fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, "index.html"), page(p)); }
fs.writeFileSync(path.join(outRoot, "index.html"), hub());
fs.writeFileSync(path.join(ROOT, "sitemap.xml"), sitemap());
fs.writeFileSync(path.join(ROOT, "robots.txt"), `User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${BASE}/sitemap.xml\n`);
console.log(`pages: ${pages.length} + hub, images: ${n}, base: ${BASE}`);
