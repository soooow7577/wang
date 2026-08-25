import { createDecipheriv } from "node:crypto";
import { setDefaultResultOrder } from "node:dns";
import { readFile, writeFile } from "node:fs/promises";

setDefaultResultOrder("ipv4first");

const HTML_PATH = new URL("../outputs/铲阵雷达-可直接打开.html", import.meta.url);
const API_BASE = "https://api.datatft.com";
const SITE_BASE = "https://jcc.datatft.com";
const DATAJ_BASE = "https://www.dataj.cc/api/web";
const TEAM_QUERY = { version: "jcc_18.1", season: "18", tier: "diamond", time: 5 };
const DOUYIN_TREND_PAGES = [
  "https://jingxuan.douyin.com/m/video/7639771246565256271",
  "https://jingxuan.douyin.com/m/video/7675665871998150266",
  "https://jingxuan.douyin.com/m/video/7675742864353037595",
];
const MOBILE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148";
const COMP_ALIASES = {
  "16218": ["高约小法师", "小法师", "维迦"],
  "16219": ["高野怪驻灵", "峡谷野怪"],
  "16220": ["赌霞"],
  "16222": ["森林天使", "森林四星天使", "神器天使", "飞升天使"],
  "16223": ["赌炼狱天使", "炼狱天使", "赌天使"],
  "16224": ["赌妖姬", "妖姬"],
  "16225": ["提莫赌", "赌提莫"],
  "16227": ["重装狮子狗", "花仙狮子狗", "狮子狗"],
  "16228": ["锋喙鸟", "召唤F6"],
  "16230": ["花仙子小炮", "花仙小炮"],
  "16232": ["重装神谕豹女", "重装豹女"],
  "16233": ["高森林EZ", "森林EZ"],
  "16234": ["黑荆棘裁决", "裁决奶妈"],
  "16235": ["高莲花阿狸", "莲华阿狸", "莲花阿狸", "四裁决阿狸"],
  "16236": ["重装厄斐琉斯", "重装亚飞", "重装琉斯"],
  "16237": ["10野怪远古巨龙", "远古巨龙", "大龙九五", "巨龙95"],
  "16241": ["德莱文95", "打钱德莱文"],
  "16242": ["拉露恩95", "月男95"],
  "16244": ["艾希95", "莲华九五", "莲华猎人九五"],
  "16247": ["黑荆棘赌狼人", "双狼互保", "赌狼人"],
  "16253": ["剑圣", "魔战剑圣", "剑圣大嘴"],
  "16256": ["好事成双蛇女"],
  "16257": ["赌芸阿娜", "裁决芸阿娜"],
  "16260": ["世纪和解", "世纪和解双C"],
  "16261": ["重装女警", "爆头凯特琳", "无限爆头凯特琳"],
};

async function getText(url) {
  const response = await fetch(url, { cache: "no-store", headers: { "user-agent": MOBILE_UA } });
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  return response.text();
}

async function getJson(url) {
  const response = await fetch(url, { cache: "no-store", headers: { "user-agent": MOBILE_UA } });
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  return response.json();
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

function rosterKey(heroes) {
  return heroes.map((hero) => String(hero.id)).sort().join(",");
}

function normalizeName(value) {
  return String(value || "").toLowerCase().replace(/[\s·]/g, "").replace(/阵容|玩法|特色|无限/g, "");
}

function aliasesFor(comp) {
  return COMP_ALIASES[comp.id] || [comp.name];
}

async function loadDataJComps() {
  try {
    const versions = await getJson(`${DATAJ_BASE}/gamedata/gameVersion?setId=18`);
    const version = versions.data?.find((item) => Number(item.battleCount) > 0) || versions.data?.[0];
    if (!version) return [];
    const rank = await getJson(`${DATAJ_BASE}/comp/rank?setId=${version.setId}&gameVersion=${encodeURIComponent(version.gameVersion)}&minSample=1`);
    return Array.isArray(rank.data) ? rank.data : [];
  } catch (error) {
    console.warn(`DataJ cross-check skipped: ${error.message}`);
    return [];
  }
}

function parseDouyinCards(html) {
  return html.split('<div class="videoitem-yumme">').slice(1).map((part) => {
    const link = part.match(/<a class="videoitem-left" href="([^"]+)" title="([^"]+)"/) || [];
    const time = part.match(/<span class="xigua-timetag-item[^"]*">([^<]+)<\/span>/)?.[1] || "近期";
    return link[1] && link[2] ? {
      url: `https://jingxuan.douyin.com${link[1]}`,
      title: link[2].replace(/&quot;/g, '"').replace(/&amp;/g, "&"),
      time,
    } : null;
  }).filter(Boolean);
}

async function loadDouyinCards() {
  const settled = await Promise.allSettled(DOUYIN_TREND_PAGES.map((url) => getText(url)));
  const cards = settled.flatMap((result) => result.status === "fulfilled" ? parseDouyinCards(result.value) : []);
  return [...new Map(cards.map((card) => [card.url, card])).values()];
}

function findDataJMatch(comp, dataJComps) {
  const aliases = aliasesFor(comp).map(normalizeName).filter((name) => name.length >= 2);
  return dataJComps.find((item) => {
    const candidate = normalizeName(item.name);
    return aliases.some((alias) => candidate.includes(alias) || alias.includes(candidate));
  });
}

function findTrend(comp, cards) {
  const aliases = aliasesFor(comp).filter((name) => name.length >= 2);
  const matches = cards.filter((card) => aliases.some((alias) => card.title.includes(alias)));
  return {
    mentions: matches.length,
    title: matches[0]?.title || "",
    url: matches[0]?.url || "",
    time: matches[0]?.time || "",
  };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function addCompositeSignals(comp, dataJComps, douyinCards) {
  const matched = findDataJMatch(comp, dataJComps);
  const dataJ = matched ? {
    name: matched.name,
    avgPlacement: Number(matched.avgPlacement),
    top4Rate: Number(matched.top4Rate),
    topRate: Number(matched.topRate),
    sampleCount: Number(matched.sampleCount),
  } : null;
  const avgPlacement = dataJ ? comp.avgPlacement * 0.65 + dataJ.avgPlacement * 0.35 : comp.avgPlacement;
  const top4Rate = dataJ ? comp.top4Rate * 0.65 + dataJ.top4Rate * 0.35 : comp.top4Rate;
  const topRate = dataJ ? comp.topRate * 0.65 + dataJ.topRate * 0.35 : comp.topRate;
  const rankScore = clamp((8.5 - avgPlacement) / 7.5 * 100, 0, 100);
  const winScore = clamp(topRate * 3.2, 0, 100);
  const performanceScore = rankScore * 0.42 + top4Rate * 0.33 + winScore * 0.25;
  const confidenceScore = clamp((Math.log10(comp.sampleCount + 1) - 2) / 2 * 100, 0, 100);
  const trend = findTrend(comp, douyinCards);
  const trendScore = clamp(trend.mentions / 3 * 100, 0, 100);
  const dataScore = performanceScore * 0.88 + confidenceScore * 0.12;
  const compositeScore = dataScore * 0.86 + trendScore * 0.14;
  return {
    ...comp,
    dataJ,
    trend,
    dataScore: Number(dataScore.toFixed(1)),
    compositeScore: Number(compositeScore.toFixed(1)),
  };
}

async function buildSnapshot() {
  const [teamData, rankData, heroMetadata, dataJComps, douyinCards] = await Promise.all([
    post("/team/list", TEAM_QUERY),
    post("/team/rank", {}),
    loadHeroMetadata(),
    loadDataJComps(),
    loadDouyinCards(),
  ]);
  if (!Array.isArray(teamData.list) || teamData.list.length === 0) throw new Error("DataTFT returned no S18 teams");
  const heroById = new Map(heroMetadata.map((hero) => [String(hero.chessId), hero]));
  const codeByRoster = new Map(
    teamData.list
      .filter((team) => typeof team.jccCode === "string" && team.jccCode.startsWith("【阵容码】##"))
      .map((team) => [rosterKey(team.heros), team.jccCode]),
  );
  const details = await Promise.all(
    teamData.list.map((team) => post("/team/detail", { teamId: team.id, ...TEAM_QUERY })),
  );
  const baseComps = teamData.list.map((team, index) => {
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
    const directCode = typeof team.jccCode === "string" && team.jccCode.startsWith("【阵容码】##") ? team.jccCode : "";
    const code = directCode || codeByRoster.get(rosterKey(team.heros)) || "";
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
  const comps = baseComps.map((comp) => addCompositeSignals(comp, dataJComps, douyinCards));
  return {
    comps,
    updatedAt: rankData.updateTime || new Date().toISOString(),
    trendUpdatedAt: new Date().toISOString(),
    trendCardCount: douyinCards.length,
    dataJMatchCount: comps.filter((comp) => comp.dataJ).length,
  };
}

const { comps, updatedAt, trendUpdatedAt, trendCardCount, dataJMatchCount } = await buildSnapshot();
const codeCount = comps.filter((comp) => comp.code).length;
const generated = [
  "// DATA_TFT_SNAPSHOT_START",
  `const DATA_TFT_UPDATED_AT=${JSON.stringify(updatedAt)};`,
  `const TREND_UPDATED_AT=${JSON.stringify(trendUpdatedAt)};`,
  `const DATA_TFT_SNAPSHOT=${JSON.stringify(comps)};`,
  "// DATA_TFT_SNAPSHOT_END",
].join("\n");
const html = await readFile(HTML_PATH, "utf8");
const marker = /\/\/ DATA_TFT_SNAPSHOT_START[\s\S]*?\/\/ DATA_TFT_SNAPSHOT_END/;
if (!marker.test(html)) throw new Error("Snapshot markers are missing from the HTML file");
await writeFile(HTML_PATH, html.replace(marker, generated), "utf8");
console.log(JSON.stringify({ count: comps.length, codeCount, dataJMatchCount, trendCardCount, updatedAt, trendUpdatedAt }));
