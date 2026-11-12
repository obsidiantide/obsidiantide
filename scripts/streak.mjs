// Generates assets/streak-dark.svg and assets/streak-light.svg from the
// GitHub contribution calendar. No dependencies; needs Node 20+.
//
//   GITHUB_TOKEN=... GH_LOGIN=obsidiantide node scripts/streak.mjs
//   node scripts/streak.mjs --mock        (fake data, for previewing the design)

import { mkdir, writeFile } from "node:fs/promises";

const LOGIN = process.env.GH_LOGIN || process.env.GITHUB_REPOSITORY_OWNER;
const TOKEN = process.env.GITHUB_TOKEN;
const MOCK = process.argv.includes("--mock");
const OUT_DIR = "assets";

const THEMES = {
  dark: { text: "#e6edf3", muted: "#8b949e", accent: "#2dd4bf", line: "#30363d", empty: "#21262d" },
  light: { text: "#1f2328", muted: "#656d76", accent: "#0d9488", line: "#d0d7de", empty: "#ebedf0" },
};

async function gql(query, variables) {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      authorization: `bearer ${TOKEN}`,
      "content-type": "application/json",
      "user-agent": "profile-streak",
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`GitHub API responded ${res.status}: ${await res.text()}`);
  const body = await res.json();
  if (body.errors) throw new Error(`GitHub API error: ${JSON.stringify(body.errors)}`);
  return body.data;
}

async function fetchDays() {
  const now = new Date();
  const years = (
    await gql(`query($login:String!){user(login:$login){contributionsCollection{contributionYears}}}`, {
      login: LOGIN,
    })
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

function mockDays() {
  const days = [];
  const today = new Date();
  for (let i = 400; i >= 0; i--) {
    const d = new Date(today.getTime() - i * 86400000);
    const off = i > 60 && (i * 7919) % 11 < 3;
    days.push({ date: d.toISOString().slice(0, 10), count: off ? 0 : 1 + ((i * 31) % 9) });
  }
  return days;
}

export function computeStats(days) {
  const total = days.reduce((sum, d) => sum + d.count, 0);
  const first = days.find((d) => d.count > 0);

  let longest = { length: 0, start: null, end: null };
  let run = { length: 0, start: null, end: null };
  for (const d of days) {
    if (d.count > 0) {
      run = run.length ? { ...run, length: run.length + 1, end: d.date } : { length: 1, start: d.date, end: d.date };
      if (run.length > longest.length) longest = run;
    } else {
      run = { length: 0, start: null, end: null };
    }
  }

  // Today does not break the streak until it is over.
  let i = days.length - 1;
  if (i >= 0 && days[i].count === 0) i--;
  let current = { length: 0, start: null, end: null };
  for (; i >= 0 && days[i].count > 0; i--) {
    current = { length: current.length + 1, start: days[i].date, end: current.end ?? days[i].date };
  }

  return { total, since: first?.date ?? null, current, longest, recent: days.slice(-30) };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fmtNum = (n) => n.toLocaleString("en-US");
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

export function render(stats, theme) {
  const W = 800;
  const H = 236;
  const font = `-apple-system,BlinkMacSystemFont,'Segoe UI','Noto Sans',Helvetica,Arial,sans-serif`;
  const cols = [
    { x: 133, value: fmtNum(stats.total), label: "contributions", sub: stats.since ? `since ${fmtDate(stats.since, true)}` : "" },
    { x: 400, value: fmtNum(stats.current.length), label: "day streak", sub: fmtRange(stats.current), accent: true },
    { x: 667, value: fmtNum(stats.longest.length), label: "longest streak", sub: fmtRange(stats.longest) },
  ];

  const colSvg = cols
    .map(
      (c) => `
  <text x="${c.x}" y="${c.accent ? 78 : 74}" text-anchor="middle" font-size="${c.accent ? 52 : 36}" font-weight="700" fill="${c.accent ? theme.accent : theme.text}">${c.value}</text>
  <text x="${c.x}" y="108" text-anchor="middle" font-size="13" font-weight="600" letter-spacing="1.4" fill="${theme.text}">${c.label.toUpperCase()}</text>
  <text x="${c.x}" y="130" text-anchor="middle" font-size="12" fill="${theme.muted}">${c.sub}</text>`,
    )
    .join("");

  const size = 12;
  const gap = 4;
  const stripW = stats.recent.length * (size + gap) - gap;
  const x0 = (W - stripW) / 2;
  const max = Math.max(1, ...stats.recent.map((d) => d.count));
  const cells = stats.recent
    .map((d, i) => {
      const x = x0 + i * (size + gap);
      if (d.count === 0) return `<rect x="${x}" y="170" width="${size}" height="${size}" rx="3" fill="${theme.empty}"/>`;
      const opacity = (0.35 + 0.65 * Math.min(1, d.count / max)).toFixed(2);
      return `<rect x="${x}" y="170" width="${size}" height="${size}" rx="3" fill="${theme.accent}" fill-opacity="${opacity}"/>`;
    })
    .join("\n  ");

  const title = `${stats.current.length} day streak, ${stats.total} contributions, longest streak ${stats.longest.length} days`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${title}" font-family="${font}">
  <title>${title}</title>
  <rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="14" fill="none" stroke="${theme.line}"/>
  <line x1="266.5" y1="40" x2="266.5" y2="132" stroke="${theme.line}"/>
  <line x1="533.5" y1="40" x2="533.5" y2="132" stroke="${theme.line}"/>${colSvg}
  ${cells}
  <text x="${W / 2}" y="210" text-anchor="middle" font-size="11" letter-spacing="1.2" fill="${theme.muted}">LAST 30 DAYS</text>
</svg>
`;
}

async function main() {
  if (!MOCK && (!TOKEN || !LOGIN)) throw new Error("Set GITHUB_TOKEN and GH_LOGIN (or run with --mock).");
  const days = MOCK ? mockDays() : await fetchDays();
  if (!days.length) throw new Error("GitHub returned an empty contribution calendar; keeping the existing cards.");
  const stats = computeStats(days);
  await mkdir(OUT_DIR, { recursive: true });
  for (const [name, theme] of Object.entries(THEMES))
    await writeFile(`${OUT_DIR}/streak-${name}.svg`, render(stats, theme));
  console.log(`streak ${stats.current.length}, longest ${stats.longest.length}, total ${stats.total}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
