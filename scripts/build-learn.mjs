// Builds the public Learn pages (aevigor.com/learn/) from web/src/content/learn.json,
// the same file the app's "?" help reads. References are copied from research.html.
// Usage: node scripts/build-learn.mjs [outDir]   (default: ./learn)
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = process.argv[2] ? resolve(process.argv[2]) : join(root, 'learn');
const data = JSON.parse(readFileSync(join(root, 'web/src/content/learn.json'), 'utf8'));
const research = readFileSync(join(root, 'research.html'), 'utf8');

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const refs = {};
for (const m of research.matchAll(/<li id="(r\d+|c[A-Z])">([\s\S]*?)<\/li>/g)) refs[m[1]] = m[2];

const fields = Object.fromEntries(data.fields.map((f) => [f.id, f]));
for (const t of data.topics) {
  if (!fields[t.field]) throw new Error(`Topic ${t.id}: unknown field ${t.field}`);
  for (const r of t.refs) if (!refs[r]) throw new Error(`Topic ${t.id}: reference ${r} not in research.html`);
  for (const c of t.coach) if (!refs['c' + c]) throw new Error(`Topic ${t.id}: coaching source ${c} not in research.html`);
}

const page = ({ title, desc, path, body }) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · Aevigor</title>
<meta name="description" content="${esc(desc)}">
<meta name="theme-color" content="#f3eee3" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#171513" media="(prefers-color-scheme: dark)">
<script>try{var t=localStorage.getItem("aev-theme");if(t)document.documentElement.setAttribute("data-theme",t)}catch(e){}</script>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Shippori+Mincho:wght@500;700&family=Zen+Kaku+Gothic+New:wght@400;500;700&display=swap">
<link rel="icon" href="../favicon.svg" type="image/svg+xml">
<link rel="icon" href="../favicon.png" type="image/png">
<link rel="canonical" href="https://aevigor.com/learn/${path}">
<link rel="stylesheet" href="../site.css">
</head>
<body>
<main class="page narrow">
${body}
</main>
<footer>
  <p><b>Disclaimer.</b> Aevigor provides general fitness information and training tools for education only. It is not medical advice and does not diagnose, treat, cure or prevent any disease or condition. Talk to a qualified health professional before you start or change exercise, supplements or medication. In an emergency, call 911. You use Aevigor at your own risk.</p>
  <nav><a href="../research.html">Research</a> · <a href="../legal/medical.html">Medical disclaimer</a> · <a href="../legal/terms.html">Terms of use</a> · <a href="../legal/privacy.html">Privacy policy</a></nav>
  <p class="copy">© 2026 Aevigor · Alberta, Canada · Works with intervals.icu. Not affiliated with intervals.icu, Garmin or Google.</p>
</footer>
<script src="../theme.js"></script>
</body>
</html>
`;

// Research links point at the full list on research.html; rewrite the copied <a> targets to open in a new tab already.
const refItem = (id) => `<li>${refs[id]} <a class="tagc" href="../research.html#${id}">in Research</a></li>`;

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const index = data.fields.map((f) => {
  const items = data.topics.filter((t) => t.field === f.id)
    .map((t) => `<li><a href="${t.id}.html">${esc(t.title)}</a> · ${esc(t.short)}</li>`).join('');
  return `<h2 id="${f.id}">${esc(f.title.toUpperCase())}</h2><p class="note">${esc(f.intro)}</p><ul class="ev">${items}</ul>`;
}).join('\n');
writeFileSync(join(out, 'index.html'), page({
  title: 'Learn', path: '', desc: 'What every number in the Aevigor app means, why it matters and how it is worked out, with references.',
  body: `<a class="back" href="../">← AEVIGOR</a>
<h1>LEARN</h1>
<p class="lead">What each number and card in the Aevigor app means, why it matters, and how it is worked out. The same short help appears behind the <b>?</b> on each card in the app.</p>
<ul class="toc">${data.fields.map((f) => `<li><a href="#${f.id}">${esc(f.title)}</a></li>`).join('')}</ul>
${index}`
}));

for (const t of data.topics) {
  const f = fields[t.field];
  const health = t.field === 'health';
  const sources = [...t.refs.map(refItem), ...(t.extra ?? []).map((e) => `<li>${esc(e.text)} <a href="${esc(e.url)}" target="_blank" rel="noopener">${esc(e.url.replace('https://doi.org/', 'doi:'))}</a></li>`)];
  const coach = t.coach.map((c) => `<li>${refs['c' + c].replace(/^<b>[A-Z]\.<\/b>\s*/, '')}</li>`);
  writeFileSync(join(out, `${t.id}.html`), page({
    title: t.title, path: `${t.id}.html`, desc: t.short,
    body: `<a class="back" href="./#${f.id}">← LEARN · ${esc(f.title.toUpperCase())}</a>
<h1 style="letter-spacing:.06em;padding-left:0;font-size:clamp(28px,6vw,42px)">${esc(t.title)}</h1>
<p class="lead">${esc(t.short)}</p>
${health ? '<p class="note"><b>Not medical advice.</b> Aevigor only stores and charts what you enter. It does not interpret results or give advice about medication, supplements or doses.</p>' : ''}
<h2>WHY IT MATTERS</h2><p>${esc(t.why)}</p>
<h2>HOW IT IS WORKED OUT</h2>${t.calc.map((p) => `<p>${esc(p)}</p>`).join('')}
${sources.length ? `<h2>REFERENCES</h2><ol class="ev">${sources.join('')}</ol>` : ''}
${coach.length ? `<h2>COACHING SOURCES</h2><p class="note">Used where research does not give an exact rule, such as a cut-off or a formula.</p><ul class="ev">${coach.join('')}</ul>` : ''}`
  }));
}
console.log(`Learn: ${data.topics.length} topics written to ${out}`);
