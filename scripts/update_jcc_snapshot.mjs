import { createDecipheriv } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

const HTML_PATH = new URL("../index.html", import.meta.url);
const API_BASE = "https://api.datatft.com";
const SITE_BASE = "https://jcc.datatft.com";
const TEAM_QUERY = { version: "jcc_18.1", season: "18", tier: "diamond", time: 5 };

async function getText(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  return response.text();
}

async function post(path, body) {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${path} returned HTTP ${response.status}`);
  const payload = await response.json();
  if (payload.code !== 1) throw new Error(`${path} failed: ${payload.message || payload.code}`);
  return payload.data;
}

async function loadHeroMetadata() {
  const home = await getText(`${SITE_BASE}/`);
  const entry = home.match(/\/assets\/index-[A-Za-z0-9_-]+\.js/)?.[0];
  if (!entry) throw new Error("Could not locate the DataTFT entry bundle");
  const entrySource = await getText(`${SITE_BASE}${entry}`);
  const dataAsset = entrySource.match(/\.\/data-cn-[A-Za-z0-9_-]+\.js/)?.[0];
  if (!dataAsset) throw new Error("Could not locate the DataTFT Chinese data bundle");
  const encryptedModule = await getText(`${SITE_BASE}/assets/${dataAsset.replace("./", "")}`);
  const encrypted = encryptedModule.match(/^const\s+\w+="([A-Za-z0-9+/=]+)"/)?.[1];
  if (!encrypted) throw new Error("Could not read the encrypted DataTFT data payload");
  const decipher = createDecipheriv("aes-128-ecb", Buffer.from("tftdaiaDexEamVaj"), null);
  decipher.setAutoPadding(true);
  const decoded = Buffer.concat([decipher.update(Buffer.from(encrypted, "base64")), decipher.final()]);
  return JSON.parse(decoded.toString("utf8")).heros18;
}

function uniqueTraitCounts(heroes, field) {
  const counts = new Map();
  for (const hero of heroes) {
    for (const name of new Set(hero.meta?.[field] || [])) counts.set(name, (counts.get(name) || 0) + 1);
  }
  return [...counts]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "zh-CN"))
    .map(([name, count]) => ({ name, picture: "", count }));
}

function heroImage(id, type = "default") {
  return `https://static.datatft.com/images/heros/${type}/${id}.jpg`;
}

async function buildSnapshot() {
  const [teamData, rankData, heroMetadata] = await Promise.all([
    post("/team/list", TEAM_QUERY),
    post("/team/rank", {}),
    loadHeroMetadata(),
  ]);
  if (!Array.isArray(teamData.list) || teamData.list.length === 0) throw new Error("DataTFT returned no S18 teams");
  const heroById = new Map(heroMetadata.map((hero) => [String(hero.chessId), hero]));
  const details = await Promise.all(
    teamData.list.map((team) => post("/team/detail", { teamId: team.id, ...TEAM_QUERY })),
  );
  const comps = teamData.list.map((team, index) => {
    const base = details[index]?.base || {};
    const heroes = team.heros.map((hero) => {
      const meta = heroById.get(String(hero.id));
      return {
        name: meta?.displayName || meta?.title || hero.key || String(hero.id),
        id: String(hero.id),
        picture: heroImage(hero.id),
        poster: heroImage(hero.id, "originjpg"),
        price: Number(meta?.price || 0),
        isCarry: String(hero.id) === String(team.heroId),
        stars: Number(hero.stars || 2),
        meta,
      };
    });
    const code = typeof team.jccCode === "string" && team.jccCode.startsWith("【阵容码】##") ? team.jccCode : "";
    return {
      id: String(team.id),
      name: team.title,
      tier: team.tier || "—",
      avgPlacement: Number(base.place ?? team.place ?? 0),
      top4Rate: Number(base.top4 ?? team.top4 ?? 0),
      topRate: Number(base.won ?? team.won ?? 0),
      sampleCount: Number(base.count || 0),
      pickRate: Number(team.playRate || 0),
      code,
      poster: `https://static.datatft.com/images/heros/bg/s6/${team.heroId}.jpg`,
      heroes: heroes.map(({ meta, ...hero }) => hero),
      races: uniqueTraitCounts(heroes, "races"),
      careers: uniqueTraitCounts(heroes, "jobs"),
    };
  });
  return { comps, updatedAt: rankData.updateTime || new Date().toISOString() };
}

const { comps, updatedAt } = await buildSnapshot();
const codeCount = comps.filter((comp) => comp.code).length;
const generated = [
  "// DATA_TFT_SNAPSHOT_START",
  `const DATA_TFT_UPDATED_AT=${JSON.stringify(updatedAt)};`,
  `const DATA_TFT_SNAPSHOT=${JSON.stringify(comps)};`,
  "// DATA_TFT_SNAPSHOT_END",
].join("\n");
const html = await readFile(HTML_PATH, "utf8");
const marker = /\/\/ DATA_TFT_SNAPSHOT_START[\s\S]*?\/\/ DATA_TFT_SNAPSHOT_END/;
if (!marker.test(html)) throw new Error("Snapshot markers are missing from the HTML file");
await writeFile(HTML_PATH, html.replace(marker, generated), "utf8");
console.log(JSON.stringify({ count: comps.length, codeCount, updatedAt }));
