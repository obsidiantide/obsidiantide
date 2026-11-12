// Generates every image used by the profile README into assets/.
// No dependencies; needs Node 20+.
//
//   GITHUB_TOKEN=... GH_LOGIN=obsidiantide node scripts/profile.mjs
//   node scripts/profile.mjs --mock        (fake data, for previewing the design)

import { mkdir, writeFile } from "node:fs/promises";

const LOGIN = process.env.GH_LOGIN || process.env.GITHUB_REPOSITORY_OWNER || "obsidiantide";
const TOKEN = process.env.GITHUB_TOKEN;
const MOCK = process.argv.includes("--mock");
const OUT_DIR = "assets";

// ── Edit these to change what the profile says ──────────────────────────────
const TITLE = "obsidiantide";
const TAGLINES = ["Hi, I'm muza", "I build web products with TypeScript & Python", "Calm on top, deep underneath"];
const PROJECTS = ["AutoNext", "Lexify", "algorithms-and-patterns", "az-text"];
// ────────────────────────────────────────────────────────────────────────────

const W = 840;
const SANS = `-apple-system,BlinkMacSystemFont,'Segoe UI','Noto Sans',Helvetica,Arial,sans-serif`;
const MONO = `ui-monospace,SFMono-Regular,'SF Mono',Menlo,Consolas,'Liberation Mono',monospace`;

const THEMES = {
  dark: {
    text: "#e6edf3", muted: "#8b949e", line: "#30363d", empty: "#161b22",
    a1: "#2dd4bf", a2: "#a78bfa",
    heroTop: "#05070d", heroBottom: "#0b1f2a", heroTitle: ["#5eead4", "#e2e8f0", "#a78bfa"], heroText: "#94a3b8",
    wave: ["#0f766e", "#14b8a6", "#7c3aed"], star: "#cbd5e1",
  },
  light: {
    text: "#1f2328", muted: "#656d76", line: "#d0d7de", empty: "#ebedf0",
    a1: "#0d9488", a2: "#7c3aed",
    heroTop: "#f0fdfa", heroBottom: "#eef2ff", heroTitle: ["#0f766e", "#1e293b", "#6d28d9"], heroText: "#475569",
    wave: ["#5eead4", "#2dd4bf", "#a78bfa"], star: "#94a3b8",
  },
};

// ── Data ────────────────────────────────────────────────────────────────────

async function gql(query, variables) {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { authorization: `bearer ${TOKEN}`, "content-type": "application/json", "user-agent": "profile-readme" },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`GitHub API responded ${res.status}: ${await res.text()}`);
  const body = await res.json();
  if (body.errors && !body.data) throw new Error(`GitHub API error: ${JSON.stringify(body.errors)}`);
  return body.data;
}

async function fetchDays() {
  const now = new Date();
  const years = (
    await gql(`query($login:String!){user(login:$login){contributionsCollection{contributionYears}}}`, { login: LOGIN })
  ).user.contributionsCollection.contributionYears;
  const byDate = new Map();
  for (const year of years) {
    const from = new Date(Date.UTC(year, 0, 1)).toISOString();
    const end = new Date(Date.UTC(year, 11, 31, 23, 59, 59));
    const to = (end > now ? now : end).toISOString();
    const data = await gql(
      `query($login:String!,$from:DateTime!,$to:DateTime!){
        user(login:$login){contributionsCollection(from:$from,to:$to){
          contributionCalendar{weeks{contributionDays{date contributionCount}}}}}}`,
      { login: LOGIN, from, to },
    );
    for (const week of data.user.contributionsCollection.contributionCalendar.weeks)
      for (const day of week.contributionDays) byDate.set(day.date, day.contributionCount);
  }
  return [...byDate].map(([date, count]) => ({ date, count })).sort((a, b) => (a.date < b.date ? -1 : 1));
}

async function fetchLanguages() {
  const totals = new Map();
  let cursor = null;
  do {
    const data = await gql(
      `query($login:String!,$cursor:String){user(login:$login){
        repositories(first:100,after:$cursor,ownerAffiliations:OWNER,isFork:false){
          pageInfo{hasNextPage endCursor}
          nodes{languages(first:10,orderBy:{field:SIZE,direction:DESC}){edges{size node{name color}}}}}}}`,
      { login: LOGIN, cursor },
    );
    const repos = data.user.repositories;
    for (const repo of repos.nodes)
      for (const edge of repo.languages.edges) {
        const cur = totals.get(edge.node.name) ?? { name: edge.node.name, color: edge.node.color, size: 0 };
        cur.size += edge.size;
        totals.set(edge.node.name, cur);
      }
    cursor = repos.pageInfo.hasNextPage ? repos.pageInfo.endCursor : null;
  } while (cursor);
  return [...totals.values()].sort((a, b) => b.size - a.size);
}

async function fetchProject(name) {
  const data = await gql(
    `query($login:String!,$name:String!){repository(owner:$login,name:$name){
      name description stargazerCount forkCount primaryLanguage{name color}}}`,
    { login: LOGIN, name },
  );
  if (!data?.repository) throw new Error(`repository ${name} not found`);
  return data.repository;
}

function mockDays() {
  const days = [];
  const today = new Date();
  for (let i = 500; i >= 0; i--) {
    const d = new Date(today.getTime() - i * 86400000);
    const off = i > 60 && (i * 7919) % 11 < 4;
    days.push({ date: d.toISOString().slice(0, 10), count: off ? 0 : 1 + ((i * 31) % 9) + (i % 37 === 0 ? 30 : 0) });
  }
  return days;
}
const MOCK_LANGS = [
  { name: "TypeScript", color: "#3178c6", size: 520 }, { name: "Python", color: "#3572A5", size: 210 },
  { name: "C#", color: "#178600", size: 120 }, { name: "HTML", color: "#e34c26", size: 80 },
  { name: "CSS", color: "#663399", size: 60 }, { name: "PLpgSQL", color: "#336790", size: 40 },
  { name: "Java", color: "#b07219", size: 30 }, { name: "Shell", color: "#89e051", size: 5 },
];
const mockProject = (name, i) => ({
  name,
  description: i === 3 ? null : "Next-Gen AI-Powered Automotive Marketplace & Valuation Platform with smart search and <pricing>",
  stargazerCount: i * 7, forkCount: i,
  primaryLanguage: { name: i % 2 ? "Python" : "TypeScript", color: i % 2 ? "#3572A5" : "#3178c6" },
});

// ── Stats ───────────────────────────────────────────────────────────────────

export function computeStats(days) {
  const total = days.reduce((sum, d) => sum + d.count, 0);
  const first = days.find((d) => d.count > 0);
  let longest = { length: 0, start: null, end: null };
  let run = { length: 0, start: null, end: null };
  for (const d of days) {
    if (d.count > 0) {
      run = run.length ? { ...run, length: run.length + 1, end: d.date } : { length: 1, start: d.date, end: d.date };
      if (run.length > longest.length) longest = run;
    } else run = { length: 0, start: null, end: null };
  }
  // Today does not break the streak until it is over.
  let i = days.length - 1;
  if (i >= 0 && days[i].count === 0) i--;
  let current = { length: 0, start: null, end: null };
  for (; i >= 0 && days[i].count > 0; i--)
    current = { length: current.length + 1, start: days[i].date, end: current.end ?? days[i].date };
  return { total, since: first?.date ?? null, current, longest };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const num = (n) => n.toLocaleString("en-US");
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const r2 = (n) => Math.round(n * 100) / 100;
function fmtDate(iso, withYear) {
  const [y, m, d] = iso.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}${withYear ? `, ${y}` : ""}`;
}
function fmtRange({ start, end }) {
  if (!start) return "no activity yet";
  const thisYear = String(new Date().getUTCFullYear());
  const withYear = !(start.startsWith(thisYear) && end.startsWith(thisYear));
  return start === end ? fmtDate(start, withYear) : `${fmtDate(start, withYear)} – ${fmtDate(end, withYear)}`;
}
function wrap(text, perLine, maxLines) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    if ((line + " " + word).trim().length <= perLine) line = (line + " " + word).trim();
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    lines[maxLines - 1] = lines[maxLines - 1].slice(0, perLine - 1).replace(/[\s.,;:]+$/, "") + "…";
  }
  return lines.map((l) => (l.length > perLine ? l.slice(0, perLine - 1) + "…" : l));
}
const svg = (h, label, body, w = W, fullH = h) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${fullH}" viewBox="0 0 ${w} ${fullH}" role="img" aria-label="${esc(label)}" font-family="${SANS}">
<title>${esc(label)}</title>${body}
</svg>
`;
const accentDefs = (t, id = "acc") =>
  `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${t.a1}"/><stop offset="1" stop-color="${t.a2}"/></linearGradient>`;
const frame = (h, t, w = W) => `<rect x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" rx="14" fill="none" stroke="${t.line}"/>`;
const FADE = `<style>.f{opacity:0;animation:f .7s ease-out forwards}@keyframes f{to{opacity:1}}</style>`;

// ── Hero ────────────────────────────────────────────────────────────────────

function wavePath(baseY, amp, len, h) {
  let d = `M ${-len} ${baseY} q ${len / 4} ${-amp} ${len / 2} 0`;
  for (let x = -len / 2; x < W + len; x += len / 2) d += ` t ${len / 2} 0`;
  return `${d} V ${h} H ${-len} Z`;
}

export function renderHero(t, dark) {
  const H = 240;
  const slot = 4.2;
  const total = slot * TAGLINES.length;
  const fs = 17;
  const cw = fs * 0.602;
  const k = (s) => r2(s / total);

  const typed = TAGLINES.map((line, i) => {
    const w = Math.ceil(line.length * cw) + 4;
    const x0 = r2(W / 2 - w / 2);
    const t0 = i * slot;
    const times = [0, t0, t0 + 1.3, t0 + slot - 0.9, t0 + slot - 0.4, total].map(k);
    const kt = times.join(";");
    const vis = i === 0 ? { v: "1;0", kt: `0;${k(slot)}` } : { v: "0;1;0", kt: `0;${k(t0)};${k(t0 + slot)}` };
    return `
<clipPath id="c${i}"><rect x="${x0}" y="140" height="30" width="0"><animate attributeName="width" dur="${total}s" repeatCount="indefinite" values="0;0;${w};${w};0;0" keyTimes="${kt}"/></rect></clipPath>
<text x="${x0}" y="161" font-family="${MONO}" font-size="${fs}" fill="${t.heroText}" clip-path="url(#c${i})" xml:space="preserve">${esc(line)}</text>
<rect y="145" width="2" height="20" rx="1" fill="${t.a1}" opacity="0"><animate attributeName="x" dur="${total}s" repeatCount="indefinite" values="${x0};${x0};${x0 + w};${x0 + w};${x0};${x0}" keyTimes="${kt}"/><animate attributeName="opacity" dur="${total}s" repeatCount="indefinite" calcMode="discrete" values="${vis.v}" keyTimes="${vis.kt}"/></rect>`;
  }).join("");

  let stars = "";
  if (dark) {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    for (let i = 0; i < 34; i++) {
      const x = r2(rnd() * W), y = r2(rnd() * 150), r = r2(0.6 + rnd() * 0.9), dur = r2(2.5 + rnd() * 4), begin = r2(rnd() * 4);
      stars += `<circle cx="${x}" cy="${y}" r="${r}" fill="${t.star}" opacity=".15"><animate attributeName="opacity" values=".15;.9;.15" dur="${dur}s" begin="${begin}s" repeatCount="indefinite"/></circle>`;
    }
  }

  const waves = [
    { y: 196, amp: 16, len: 420, dur: 16, op: dark ? 0.35 : 0.3, c: t.wave[0] },
    { y: 208, amp: 12, len: 300, dur: 11, op: dark ? 0.35 : 0.35, c: t.wave[1] },
    { y: 220, amp: 9, len: 240, dur: 8, op: dark ? 0.3 : 0.3, c: t.wave[2] },
  ]
    .map(
      (w) =>
        `<path d="${wavePath(w.y, w.amp, w.len, H)}" fill="${w.c}" fill-opacity="${w.op}"><animateTransform attributeName="transform" type="translate" from="0 0" to="${w.len} 0" dur="${w.dur}s" repeatCount="indefinite"/></path>`,
    )
    .join("\n");

  return svg(H, TITLE, `
<defs>
<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${t.heroTop}"/><stop offset="1" stop-color="${t.heroBottom}"/></linearGradient>
<radialGradient id="glow" cx=".5" cy=".42" r=".5"><stop offset="0" stop-color="${t.a1}" stop-opacity="${dark ? 0.2 : 0.16}"/><stop offset="1" stop-color="${t.a1}" stop-opacity="0"/></radialGradient>
<radialGradient id="glow2" cx=".85" cy=".1" r=".4"><stop offset="0" stop-color="${t.a2}" stop-opacity="${dark ? 0.2 : 0.14}"/><stop offset="1" stop-color="${t.a2}" stop-opacity="0"/></radialGradient>
<linearGradient id="title" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${t.heroTitle[0]}"/><stop offset=".5" stop-color="${t.heroTitle[1]}"/><stop offset="1" stop-color="${t.heroTitle[2]}"/><animateTransform attributeName="gradientTransform" type="translate" values="-0.35 0;0.35 0;-0.35 0" dur="9s" repeatCount="indefinite"/></linearGradient>
<clipPath id="r"><rect width="${W}" height="${H}" rx="16"/></clipPath>
</defs>
<g clip-path="url(#r)">
<rect width="${W}" height="${H}" fill="url(#bg)"/>
<rect width="${W}" height="${H}" fill="url(#glow)"/>
<rect width="${W}" height="${H}" fill="url(#glow2)"/>
${stars}
${waves}
</g>
<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="16" fill="none" stroke="${t.line}" stroke-opacity=".7"/>
<text x="${W / 2}" y="112" text-anchor="middle" font-size="60" font-weight="800" letter-spacing="1" fill="url(#title)">${esc(TITLE)}</text>${typed}`);
}

// ── Streak ──────────────────────────────────────────────────────────────────

const FLAME =
  "M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z";

export function renderStreak(stats, t) {
  const H = 210;
  const R = 52;
  const C = 2 * Math.PI * R;
  const gap = 42;
  const dash = r2(C - gap);
  const rot = r2(-90 + (gap / 2 / C) * 360);
  const side = (x, value, label, sub, delay) => `
<g class="f" style="animation-delay:${delay}s">
<text x="${x}" y="96" text-anchor="middle" font-size="40" font-weight="700" fill="${t.text}">${value}</text>
<text x="${x}" y="126" text-anchor="middle" font-size="12" font-weight="600" letter-spacing="1.5" fill="${t.text}">${label}</text>
<text x="${x}" y="148" text-anchor="middle" font-size="12" fill="${t.muted}">${sub}</text>
</g>`;
  const label = `${stats.current.length} day streak, ${stats.total} contributions, longest streak ${stats.longest.length} days`;
  return svg(H, label, `
<defs>${accentDefs(t)}</defs>${FADE}
${frame(H, t)}
<line x1="280.5" y1="50" x2="280.5" y2="160" stroke="${t.line}"/>
<line x1="560.5" y1="50" x2="560.5" y2="160" stroke="${t.line}"/>${side(140, num(stats.total), "CONTRIBUTIONS", stats.since ? `since ${fmtDate(stats.since, true)}` : "", 0.1)}${side(700, num(stats.longest.length), "LONGEST STREAK", fmtRange(stats.longest), 0.3)}
<circle cx="420" cy="88" r="${R}" fill="none" stroke="${t.line}" stroke-width="5" stroke-dasharray="${dash} ${r2(C)}" stroke-linecap="round" transform="rotate(${rot} 420 88)"/>
<circle cx="420" cy="88" r="${R}" fill="none" stroke="url(#acc)" stroke-width="5" stroke-dasharray="${dash} ${r2(C)}" stroke-dashoffset="${dash}" stroke-linecap="round" transform="rotate(${rot} 420 88)"><animate attributeName="stroke-dashoffset" from="${dash}" to="0" dur="1.6s" begin="0.2s" fill="freeze" calcMode="spline" keyTimes="0;1" keySplines=".2 .7 .2 1"/></circle>
<g transform="translate(408 23)" fill="none" stroke="${t.a1}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${FLAME}"><animateTransform attributeName="transform" type="scale" values="1;1.08;1" dur="1.8s" repeatCount="indefinite" additive="sum"/></path></g>
<g class="f" style="animation-delay:.2s">
<text x="420" y="104" text-anchor="middle" font-size="44" font-weight="800" fill="url(#acc)">${num(stats.current.length)}</text>
<text x="420" y="170" text-anchor="middle" font-size="12" font-weight="600" letter-spacing="1.5" fill="${t.text}">DAY STREAK</text>
<text x="420" y="190" text-anchor="middle" font-size="12" fill="${t.muted}">${fmtRange(stats.current)}</text>
</g>`);
}

// ── Activity heatmap ────────────────────────────────────────────────────────

export function renderActivity(days, t) {
  const H = 214;
  const cell = 11, step = 14, x0 = 62, y0 = 76;
  const last = days.slice(-371);
  const dow = (iso) => new Date(`${iso}T00:00:00Z`).getUTCDay();
  // Start on a Sunday so every column is a full week.
  let start = 0;
  while (start < last.length && dow(last[start].date) !== 0) start++;
  const year = last.slice(start);
  const nonZero = year.filter((d) => d.count > 0).map((d) => d.count).sort((a, b) => a - b);
  const q = (p) => nonZero[Math.min(nonZero.length - 1, Math.floor(p * nonZero.length))] ?? 1;
  const cuts = [q(0.25), q(0.5), q(0.8)];
  const level = (c) => (c === 0 ? 0 : c <= cuts[0] ? 1 : c <= cuts[1] ? 2 : c <= cuts[2] ? 3 : 4);
  const op = [0, 0.3, 0.52, 0.76, 1];

  let cols = "", months = "", prevMonth = -1, lastLabelCol = -9;
  const weeks = Math.ceil(year.length / 7);
  for (let w = 0; w < weeks; w++) {
    let rects = "";
    for (let d = 0; d < 7; d++) {
      const day = year[w * 7 + d];
      if (!day) break;
      const l = level(day.count);
      rects += `<rect y="${y0 + d * step}" width="${cell}" height="${cell}" rx="2.5" fill="${l ? t.a1 : t.empty}"${l ? ` fill-opacity="${op[l]}"` : ""}><title>${day.count} on ${fmtDate(day.date, true)}</title></rect>`;
    }
    cols += `<g class="f" style="animation-delay:${r2(w * 0.018)}s" transform="translate(${x0 + w * step} 0)">${rects}</g>\n`;
    const month = Number(year[w * 7].date.slice(5, 7)) - 1;
    if (month !== prevMonth) {
      if (w - lastLabelCol >= 3 && w < weeks - 1) {
        months += `<text x="${x0 + w * step}" y="66" font-size="10" fill="${t.muted}">${MONTHS[month]}</text>`;
        lastLabelCol = w;
      }
      prevMonth = month;
    }
  }

  const total = year.reduce((s, d) => s + d.count, 0);
  const best = year.reduce((b, d) => (d.count > b.count ? d : b), { count: 0, date: null });
  const active = year.filter((d) => d.count > 0).length;
  const stat = (x, value, label) =>
    `<text x="${x}" y="34" text-anchor="end" font-size="12" fill="${t.muted}"><tspan font-weight="700" fill="${t.text}">${value}</tspan> ${label}</text>`;
  const legendX = W - 62 - 5 * step;
  const legend = op.map((o, i) => `<rect x="${legendX + i * step}" y="${H - 27}" width="${cell}" height="${cell}" rx="2.5" fill="${i ? t.a1 : t.empty}"${i ? ` fill-opacity="${o}"` : ""}/>`).join("");

  return svg(H, `${total} contributions in the last year`, `${FADE}
${frame(H, t)}
<text x="30" y="34" font-size="13" font-weight="600" letter-spacing="1.5" fill="${t.text}">LAST 12 MONTHS</text>
${stat(W - 30, num(active), "active days")}${stat(W - 150, num(best.count), "best day")}${stat(W - 250, num(total), "contributions")}
${months}
${["Mon", "Wed", "Fri"].map((d, i) => `<text x="30" y="${y0 + (1 + i * 2) * step + 9}" font-size="10" fill="${t.muted}">${d}</text>`).join("")}
${cols}<text x="${legendX - 8}" y="${H - 18}" text-anchor="end" font-size="10" fill="${t.muted}">Less</text>${legend}<text x="${W - 30}" y="${H - 18}" text-anchor="end" font-size="10" fill="${t.muted}">More</text>`);
}

// ── Languages ───────────────────────────────────────────────────────────────

export function renderLanguages(langs, t) {
  const H = 150;
  const top = langs.slice(0, 6);
  const rest = langs.slice(6).reduce((s, l) => s + l.size, 0);
  if (rest > 0) top.push({ name: "Other", color: t.muted, size: rest });
  const total = top.reduce((s, l) => s + l.size, 0) || 1;
  const barX = 30, barW = W - 60;
  let x = barX;
  const segs = top
    .map((l) => {
      const w = (l.size / total) * barW;
      const seg = `<rect x="${r2(x)}" y="52" width="${r2(Math.max(w, 0.5))}" height="10" fill="${l.color || t.muted}"/>`;
      x += w;
      return seg;
    })
    .join("");
  const colW = barW / 4;
  const legend = top
    .map((l, i) => {
      const lx = barX + (i % 4) * colW, ly = 92 + Math.floor(i / 4) * 26;
      const pct = (l.size / total) * 100;
      return `<g class="f" style="animation-delay:${r2(0.3 + i * 0.08)}s"><circle cx="${lx + 5}" cy="${ly - 4}" r="5" fill="${l.color || t.muted}"/><text x="${lx + 18}" y="${ly}" font-size="12" fill="${t.text}">${esc(l.name)} <tspan fill="${t.muted}">${pct < 10 ? pct.toFixed(1) : Math.round(pct)}%</tspan></text></g>`;
    })
    .join("\n");
  return svg(H, `Most used languages: ${top.map((l) => l.name).join(", ")}`, `${FADE}
<defs><clipPath id="bar"><rect x="${barX}" y="52" height="10" rx="5" width="0"><animate attributeName="width" from="0" to="${barW}" dur="1.2s" begin="0.2s" fill="freeze" calcMode="spline" keyTimes="0;1" keySplines=".2 .7 .2 1"/></rect></clipPath></defs>
${frame(H, t)}
<text x="30" y="34" font-size="13" font-weight="600" letter-spacing="1.5" fill="${t.text}">LANGUAGES</text>
<text x="${W - 30}" y="34" text-anchor="end" font-size="12" fill="${t.muted}">across public repositories</text>
<rect x="${barX}" y="52" width="${barW}" height="10" rx="5" fill="${t.empty}"/>
<g clip-path="url(#bar)">${segs}</g>
${legend}`);
}

// ── Project card ────────────────────────────────────────────────────────────

const REPO_ICON =
  "M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 1 1-1.072 1.05A2.495 2.495 0 0 1 2 11.5Zm10.5-1h-8a1 1 0 0 0-1 1v6.708A2.486 2.486 0 0 1 4.5 9h8ZM5 12.25a.25.25 0 0 1 .25-.25h3.5a.25.25 0 0 1 .25.25v3.25a.25.25 0 0 1-.4.2l-1.45-1.087a.249.249 0 0 0-.3 0L5.4 15.7a.25.25 0 0 1-.4-.2Z";
const STAR_ICON =
  "M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.751.751 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Z";

export function renderProject(p, t) {
  const w = 412, H = 132, pad = 8; // pad keeps a gap between rows of cards
  const desc = wrap(p.description || `github.com/${LOGIN}/${p.name}`, 54, 2);
  const lang = p.primaryLanguage;
  return svg(H, `${p.name}${p.description ? `: ${p.description}` : ""}`, `${FADE}
<defs>${accentDefs(t)}</defs>
<rect x="0.5" y="0.5" width="${w - 1}" height="${H - 1}" rx="14" fill="none" stroke="${t.line}"/>
<g class="f">
<path transform="translate(22 22)" d="${REPO_ICON}" fill="${t.muted}"/>
<text x="46" y="35" font-size="15" font-weight="700" fill="url(#acc)">${esc(p.name.length > 34 ? p.name.slice(0, 33) + "…" : p.name)}</text>
${desc.map((l, i) => `<text x="22" y="${62 + i * 18}" font-size="12" fill="${t.muted}">${esc(l)}</text>`).join("")}
${lang ? `<circle cx="28" cy="108" r="5" fill="${lang.color || t.muted}"/><text x="40" y="112" font-size="12" fill="${t.text}">${esc(lang.name)}</text>` : ""}
<path transform="translate(${w - 62} 100) scale(.85)" d="${STAR_ICON}" fill="${t.muted}"/><text x="${w - 42}" y="112" font-size="12" fill="${t.muted}">${num(p.stargazerCount)}</text>
</g>`, w, H + pad);
}

// ── Footer ──────────────────────────────────────────────────────────────────

export function renderFooter(t) {
  const H = 70;
  const waves = [
    { y: 34, amp: 14, len: 420, dur: 16, c: t.wave[0] },
    { y: 44, amp: 10, len: 300, dur: 11, c: t.wave[1] },
    { y: 52, amp: 8, len: 240, dur: 8, c: t.wave[2] },
  ]
    .map((w) => `<path d="${wavePath(w.y, w.amp, w.len, H)}" fill="${w.c}" fill-opacity=".3"><animateTransform attributeName="transform" type="translate" from="0 0" to="${w.len} 0" dur="${w.dur}s" repeatCount="indefinite"/></path>`)
    .join("\n");
  return svg(H, "", `
<defs><linearGradient id="fade" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".15" stop-color="#fff"/><stop offset=".85" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient><mask id="m"><rect width="${W}" height="${H}" fill="url(#fade)"/></mask></defs>
<g mask="url(#m)">${waves}</g>`);
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  if (!MOCK && !TOKEN) throw new Error("Set GITHUB_TOKEN (or run with --mock).");
  await mkdir(OUT_DIR, { recursive: true });
  const write = async (name, render) => {
    for (const [mode, theme] of Object.entries(THEMES))
      await writeFile(`${OUT_DIR}/${name}-${mode}.svg`, render(theme, mode === "dark"));
  };
  // Each section is independent: if one fails, its previous image stays in place.
  const failures = [];
  const section = async (name, fn) => {
    try {
      await fn();
      console.log(`ok   ${name}`);
    } catch (err) {
      failures.push(name);
      console.error(`FAIL ${name}: ${err.message}`);
    }
  };

  await section("hero", () => write("hero", renderHero));
  await section("footer", () => write("footer", renderFooter));
  await section("streak + activity", async () => {
    const days = MOCK ? mockDays() : await fetchDays();
    if (!days.length) throw new Error("empty contribution calendar");
    const stats = computeStats(days);
    await write("streak", (t) => renderStreak(stats, t));
    await write("activity", (t) => renderActivity(days, t));
    console.log(`     streak ${stats.current.length}, longest ${stats.longest.length}, total ${stats.total}`);
  });
  await section("languages", async () => {
    const langs = MOCK ? MOCK_LANGS : await fetchLanguages();
    if (!langs.length) throw new Error("no languages found");
    await write("languages", (t) => renderLanguages(langs, t));
  });
  for (const [i, name] of PROJECTS.entries())
    await section(`project ${name}`, async () => {
      const project = MOCK ? mockProject(name, i) : await fetchProject(name);
      await write(`project-${name}`, (t) => renderProject(project, t));
    });

  if (failures.length) process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
