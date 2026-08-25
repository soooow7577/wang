
import { createDecipheriv } from "node:crypto";
import { setDefaultResultOrder } from "node:dns";
import { readFile, writeFile } from "node:fs/promises";

setDefaultResultOrder("ipv4first");

const HTML_PATH = new URL("../index.html", import.meta.url);
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
    headers: {
      "content-type": "application/json",
      "accept-language": "zh-CN,zh;q=0.9",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${path} returned HTTP ${response.status}`);
  const payload = await response.json();
  if (payload.code !== 1) throw new Error(`${path} failed: ${payload.message || payload.code}`);
  return payload.data;
}

async function loadGameMetadata() {
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
  const payload = JSON.parse(decoded.toString("utf8"));
  return { heroes: payload.heros18 || [], equips: payload.equips18 || [] };
}

function buildTeamCodeMaps(heroes, equips) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
  const mapAlphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!<>.";
  const mapIndex = new Map([...mapAlphabet].map((value, index) => [value, index]));
  const heroByCode = new Map();
  let generatedHeroIndex = 0;
  const specialHeroes = [9977, 9978, 999001, 999002, 999003, 999004].map((chessId) => ({
    chessId,
    displayName: chessId === 9977 ? "目标假人" : chessId === 9978 ? "魔像" : "特殊召唤物",
    price: 0,
  }));
  for (const hero of [...heroes, ...specialHeroes]) {
    const code = hero.code || `z${alphabet[generatedHeroIndex++]}`;
    heroByCode.set(code, hero);
  }
  const excluded = new Set([612, 545, 573, 31004, 31005, 31006, 31007, 2252]);
  const appended = new Set([31004, 31005, 31006, 31007]);
  const orderedEquips = [
    ...equips.filter((equip) => !excluded.has(Number(equip.equipId))),
    ...equips.filter((equip) => appended.has(Number(equip.equipId))),
  ];
  const equipByCode = new Map();
  for (let index = 0; index < orderedEquips.length; index += 1) {
    const equip = orderedEquips[index];
    const row = Math.trunc(index / alphabet.length);
    const code = equip.code || `${alphabet[row]}${alphabet[index - row * alphabet.length]}`;
    equipByCode.set(code, equip);
  }
  return { mapIndex, heroByCode, equipByCode };
}

function equipImage(id) {
  return `https://static.datatft.com/images/equips/${id}.png`;
}

function decodeTeamBuilder(teamUrl, maps) {
  let code = String(teamUrl || "")
    .replace(/https:\/\/(?:www|jcc)\.datatft\.com\/(?:team-builder|simulator)\//i, "")
    .replace(/%7C/gi, "|")
    .replace(/\s/g, "");
  if (code.endsWith(".")) code = code.slice(0, -1);
  const seasonSuffix = code.match(/s(\d{1,2})$/);
  if (seasonSuffix) code = code.slice(0, -(seasonSuffix[1].length + 1));
  if (!code) return [];
  code = decodeURIComponent(code);
  const positions = new Array(28).fill(null);
  let cursor = 0;
  let isError = false;
  while (cursor < code.length) {
    if (code[cursor] === "|") break;
    const index = maps.mapIndex.get(code[cursor++]);
    if (index == null) { console.warn(`Unknown board index at ${cursor - 1}: ${code[cursor - 1]}`); isError = true; break; }
    let heroCode = code.slice(cursor, cursor + 2);
    cursor += 2;
    let hero = maps.heroByCode.get(heroCode);
    if (!hero) { console.warn(`Unknown hero code at ${cursor - 2}: ${heroCode}`); isError = true; break; }
    const items = [];
    if (/^[0-9]$/.test(code[cursor] || "")) {
      const itemCount = Number(code[cursor++]);
      for (let itemIndex = 0; itemIndex < itemCount; itemIndex += 1) {
        const itemCode = code.slice(cursor, cursor + 2);
        cursor += 2;
        const equip = maps.equipByCode.get(itemCode);
        if (equip) items.push({
          id: String(equip.equipId),
          name: equip.name || equip.jccname || String(equip.equipId),
          picture: equipImage(equip.equipId),
        });
        else { console.warn(`Unknown equip code at ${cursor - 2}: ${itemCode}`); isError = true; }
      }
    }
    if (code[cursor] === "~") {
      cursor += 1;
      const powerCount = Number(code[cursor++] || 0);
      cursor += powerCount * 3;
    }
    let stars = 2;
    if (code[cursor] === "*") {
      cursor += 1;
      stars = Number(code[cursor++] || 2);
    }
    let replacement = null;
    if (code[cursor] === "_") {
      cursor += 1;
      heroCode = code.slice(cursor, cursor + 2);
      cursor += 2;
      replacement = maps.heroByCode.get(heroCode) || null;
    }
    while (code[cursor] === "^") cursor += 2;
    let isMain = false;
    if (code[cursor] === "-") {
      cursor += 2;
      isMain = true;
    }
    if (index < 28) positions[index] = {
      index,
      row: Math.floor(index / 7) + 1,
      col: index % 7 + 1,
      id: String(hero.chessId),
      name: hero.displayName || hero.title || hero.key || String(hero.chessId),
      picture: heroImage(hero.chessId),
      price: Number(hero.price || 0),
      stars,
      isMain,
      replacement: replacement ? {
        id: String(replacement.chessId),
        name: replacement.displayName || replacement.title || replacement.key || String(replacement.chessId),
        picture: heroImage(replacement.chessId),
      } : null,
      equips: items,
    };
  }
  if (isError) throw new Error(`Could not decode Team Builder data: ${teamUrl}`);
  return positions.filter(Boolean);
}

function recommendedEquips(strategy, equipById) {
  return new Map((strategy?.equips || []).map((entry) => {
    const firstSet = Array.isArray(entry.equips?.[0]) ? entry.equips[0] : [];
    return [String(entry.heroId), firstSet.map((id) => {
      const equip = equipById.get(String(id));
      return {
        id: String(id),
        name: equip?.name || equip?.jccname || String(id),
        picture: equipImage(id),
      };
    })];
  }));
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

function polishGuideText(value) {
  let text = String(value || "").trim();
  if (!text) return "";
  const phraseFixes = [
    ["维迦拥有无限成长的机制配合荆棘提供的加成后期上限极高", "维迦拥有无限成长机制，配合黑荆棘羁绊的加成，后期上限极高"],
    ["2星维迦有装备开局最佳", "开局若有二星维迦并能配上装备，最适合直接玩这套阵容"],
    ["3-1大d维迦以及两个斗士质量，后续回存慢d三星即可上人口", "3-1阶段集中搜牌，提升维迦和两名斗士的质量；随后存回利息，慢搜三星后再升人口"],
    ["驻灵拥有极高的单体爆发可开高峡谷也可开高神谕", "驻灵拥有极高的单体爆发，可以选择高峡谷野怪或高神谕体系"],
    ["驻灵数量多且法系装备开局", "开局驻灵数量较多，并且拥有法术装备时最适合这套阵容"],
    ["利用三野怪过渡即可，驻灵数量较多时可直接拉人口无需在低等级d三星", "前期用3峡谷野怪过渡；驻灵数量较多时可以直接升人口，无需在低等级强追三星"],
    ["利用5野怪机制驻灵往往很容易三星，根据迅捷蟹石甲虫数量可选择在6，7级小d三星前排也可直接上8找2星蓝霸符", "利用5峡谷野怪机制，驻灵通常比较容易三星。根据迅捷蟹和石甲虫的数量，可以在6至7人口小幅搜牌追三星前排，也可以直接升至8人口寻找二星苍蓝雕纹魔像"],
    ["赌霞同时追奥恩拥有发神器上限", "这套阵容以追三星霞为核心，同时追三星奥恩可通过神器进一步提高上限"],
    ["可先连败抢装备，霞鬼索的狂暴之刃必备。3-1d牌数量多可直接追出三星，维鲁斯数量多也可同时追", "前期可通过连败优先拿装备，霞必备鬼索的狂暴之刃。3-1阶段如果体系牌数量较多，可以直接追三星；维鲁斯数量多时也可以一起追"],
    ["配合小精灵海克斯追出更多三星阵容强度飞升", "搭配有利于追三星的小精灵强化，追出更多三星棋子后，阵容强度会显著提升"],
    ["配合法杖海克斯追出更多三星阵容强度飞升", "搭配有利于追三星的法杖强化，追出更多三星棋子后，阵容强度会显著提升"],
    ["可连败抢合适装备，优先选择有利于三星海克斯", "前期可通过连败优先拿到合适装备，强化符文优先选择有利于追三星的类型"],
    ["5级6级慢追整体三星，三星数量多即可上人口", "在5至6人口卡利息慢搜全员三星，三星棋子数量足够后再升人口"],
    ["开局可直接做装备，物理系装备可先给雷恩加尔等优质物理单位后续给ez，拉人口连胜即可", "开局可以直接合成装备，物理装备先给雷恩加尔等优质棋子过渡，后续再转给伊泽瑞尔，以升人口保持连胜为主"],
    ["6，7级可小d利用乐芙兰机制，数量多时可冲出三星，数量少上人口开高羁绊即可", "在6至7人口可小幅搜牌，利用乐芙兰的机制补充数量；数量多时追三星，数量少时直接升人口开高羁绊"],
    ["如果乐芙兰数量不足以追三上9后可替换为2星拉克丝，", "如果乐芙兰数量不足以追三星，升至9人口后可替换为二星拉克丝"],
    ["3-2拉6小d整体2星，提莫数量多可直接追三，利用法杖走出连胜", "3-2阶段升至6人口，小幅搜牌提升至全员二星；提莫数量多时可以直接追三星，并利用法杖保持连胜"],
    ["开局有雷恩加尔和物理装备开局", "开局有雷恩加尔，并且拥有合适的物理装备时适合这套阵容"],
    ["7级慢d雷恩加尔和任意前后排三星即可", "在7人口卡利息慢搜，追出三星雷恩加尔，再补一个三星前排或后排即可"],
    ["7峡谷野怪能蔚峡谷野怪提供大量数值", "7峡谷野怪能为体系棋子提供大量属性加成"],
    ["先用绯红树怪凯特琳过渡即可，凯特琳带鸟装备，有5峡谷野怪可上5峡谷野怪利用机制嫖体系卡质量", "前期用绯红印记树怪和凯特琳过渡，凯特琳先携带锋喙鸟的装备；能开出5峡谷野怪时尽早开出，利用羁绊机制补充体系牌质量"],
    ["有连胜节奏时可每轮慢d法杖滚雪球，7级追出三星鸟和远古石甲虫后即可上人口，海克斯战力强且同行多也可二星上人口找2星蓝作为前排", "有连胜节奏时，可以利用法杖逐步扩大优势。7人口追出三星锋喙鸟和远古石甲虫后再升人口；如果战力强化较多或同行较多，也可以在二星时先升人口，寻找二星苍蓝雕纹魔像承担前排"],
    ["适当选择经济海克斯，三费阵容需要较多经济来确保阵容成型度，3-5或4-1拉7慢d即可", "强化符文可适当选择经济类。三费阵容需要较多经济保证成型，3-5或4-1阶段升至7人口后卡利息慢搜即可"],
    ["三阶段能赢即可，开高魔女层数后杀怪一样能取得不俗的层数，用卡西奥佩娅带莫甘娜装备过渡即可，4阶段启动d场面2星", "第三阶段以稳住血量为主；开出高魔女后，即使击杀较少也能积累不错的层数。用卡西奥佩娅携带莫甘娜的装备过渡，第四阶段启动搜牌，将场面提升至全员二星"],
    ["可先把ez装备给维鲁斯过渡，ez裁决不刚需无尽之刃", "前期可以让维鲁斯携带伊泽瑞尔的装备过渡；伊泽瑞尔拥有裁决使羁绊时，并不强求无尽之刃"],
    ["上9后补充2星凯南纳尔即可", "升至9人口后，补上二星凯南和纳尔即可"],
    ["法系的84拼多多阵容，阵容平滑，强度极高", "这是一套法术体系的八级四费拼多多阵容，过渡平滑，成型强度很高"],
    ["根据d到的前排灵活构筑8级阵容，上9后补2星凯南塔里克补充伤害与坦度即可", "根据搜到的前排棋子灵活构筑8人口阵容；升至9人口后补上二星凯南和塔里克，提升伤害与坦度"],
    ["莲花小精灵提供高额收益，阿狸大范围aoe配合其余伤害能瞬间完成清场", "莲花小精灵能够提供高额收益，阿狸的大范围伤害配合其他棋子，可以迅速完成清场"],
    ["4-2升8d整体两星，有莲花拉克丝可直接开7莲花，没有也可先开5莲花", "4-2阶段升至8人口，搜出全员二星；有莲花拉克丝时直接开7莲花，否则先开5莲花"],
    ["厄斐和红霸符双c84阵容，莫甘娜带莫雷洛秘典提供大范围重伤", "这是一套以厄斐琉斯和绯红印记树怪为双核心的八级四费阵容，莫甘娜携带莫雷洛秘典提供大范围重伤效果"],
    ["尽早做出厄斐神装，海克斯可多拿装备海克斯，装备较少时可规划秘法手套给红霸符，4-2拉8d整体两星，自由为可选择莫甘娜或者婕拉带重伤装备即可", "尽早做出厄斐琉斯的核心装备，强化符文可以多选装备类。装备较少时，可给绯红印记树怪秘法手套；4-2阶段升至8人口，搜出全员二星，重伤装备可由莫甘娜或婕拉携带"],
    ["上8上9小d整体质量即可利用血量容错和经济上10开出10峡谷", "升至8、9人口时小幅搜牌提升整体质量，再利用血量和经济优势升至10人口，开出10峡谷野怪"],
    ["可直接跳9的95，德莱文配合远古巨龙能直接对后排造成极大的威胁", "这是一套可以快速升至9人口的九五阵容，德莱文配合远古巨龙能够对敌方后排造成巨大威胁"],
    ["拉克丝不必过渡纠结羁绊，月光最佳，其余羁绊也可改变阵容开出羁绊", "拉克丝不必强求特定羁绊，月光效果最佳；也可以根据实战选择其他羁绊并调整阵容"],
    ["以艾希为主c的95，艾希凯南远古巨龙三c对后排都有极高的威胁", "这是一套以艾希为主核心的九五阵容，艾希、凯南和远古巨龙都能对敌方后排造成很大威胁"],
    ["前期连败优先做出沃里克神装，依靠战斗中的无限成长前中期间有着不俗战力", "前期可以连败优先做出沃里克的核心装备，依靠战斗中的无限成长机制，沃里克在前中期拥有很强的战斗力"],
    ["3-2升6小d质量保持连胜，卡利息慢追三星，阿兹尔数量多且有法系装备也可追三", "3-2阶段升至6人口，小幅搜牌提升质量并保持连胜；随后卡利息慢搜三星。阿兹尔数量多且有法术装备时，也可以一起追三星"],
    ["在搭配合适的神器后易有着极高的战力，配合2远古的发育打装备，阵容可支撑多个c位", "易大师搭配合适神器后战斗力极高，再利用2远古羁绊发育并获取装备，整套阵容可以支撑多个核心输出"],
    ["用莲花过渡即可，只购买经济法杖，选秀优先做出易装备", "前期用灵魂莲华体系过渡，只购买经济类法杖；选秀优先合成易大师的装备"],
    ["前期可连败养经济，只拿经济小精灵选秀优先做卡西奥佩娅法系装备", "前期可通过连败积累经济，只选择经济类小精灵；选秀优先合成卡西奥佩娅的法术装备"],
    ["3-5启动d到整体阵容，第七个位置可上索拉卡开2绝命花妖，回存利息慢追三星", "3-5阶段启动搜牌，找齐完整阵容；第七个位置可以上索拉卡开2绝命花妖，随后存回利息并慢搜三星"],
    ["世纪和解海克斯专属阵容，卡兹克配合狮子机制能对后排造成极大威胁", "这是世纪和解强化符文的专属阵容，卡兹克配合雷恩加尔的机制，能够对敌方后排造成巨大威胁"],
    ["用雷恩加尔卡兹克配合前排坦克过渡即可，当前版本可优先做卡兹克装备，利用两张三费卡尽量走出连胜", "前期用雷恩加尔和卡兹克搭配前排坦克过渡。当前版本优先制作卡兹克的装备，利用两张三费核心尽量打出连胜"],
    ["三星后上人口补充羁绊站位尽量前排单顶保护雷恩加尔卡兹克", "核心棋子三星后继续升人口补充羁绊；站位上尽量让主坦单顶前排，保护雷恩加尔和卡兹克"],
    ["利用魔女底层数有极大概率发体系卡尽早追三", "利用魔女叠层奖励可以更容易获得体系牌，从而尽早追出三星"],
    ["前期上三魔女换怪，可只收40层能收到凯特琳或伊莉丝，选秀优先拿凯特琳鬼索的狂暴之刃散件", "前期上3魔女并通过换怪积累层数，达到40层即可尝试获得凯特琳或伊莉丝；选秀优先拿合成凯特琳鬼索的狂暴之刃所需的散件"],
    ["3-2上6d整体质量，可先不开高重装战士，保留三魔女，利用40层奖励在4-1之前追出两个三星即可上人口", "3-2阶段升至6人口并提升整体质量，可以暂时保留3魔女，不急着开高重装战士；利用40层奖励，在4-1之前追出两名三星棋子后再升人口"],
    ["最种", "最终"],
    ["能蔚峡谷野怪", "能为峡谷野怪"],
    ["莫甘娜娜", "莫甘娜"],
    ["法系过度开局", "法系过渡开局"],
    ["芸啊娜", "芸阿娜"],
    ["魔女底层数", "魔女叠层数"],
    ["5级6级", "5、6级"],
    ["6，7级", "6、7级"],
    ["67级", "6、7级"],
    ["2星蓝霸符", "二星苍蓝雕纹魔像"],
    ["2星蓝作为前排", "二星苍蓝雕纹魔像作为前排"],
    ["自由为可选择莫甘娜或者婕拉带重伤装备即可", "重伤装备可由莫甘娜或婕拉携带"],
    ["雷恩加尔卡兹克听牌可在6级小d法杖已经二星", "雷恩加尔和卡兹克接近两星时，可在6人口小幅搜牌，并通过法杖补齐两星质量"],
    ["如果吃魔女的话尽量换怪精致连败", "如果选择魔女路线，尽量通过换怪打出精致连败"],
    ["常规三费赌狗阵容", "常规三费慢搜阵容"],
    ["最少双三后", "至少两名棋子三星后"],
  ];
  for (const [from, to] of phraseFixes) text = text.replaceAll(from, to);
  text = text
    .replace(/aoe/gi, "范围伤害")
    .replace(/\bez\b/gi, "伊泽瑞尔")
    .replace(/\bap\b/gi, "法术")
    .replace(/\bad\b/gi, "物理")
    .replace(/主[cC]/g, "主核心")
    .replace(/双[cC]/g, "双核心")
    .replace(/三[cC]/g, "三核心")
    .replace(/[cC]位/g, "核心输出位")
    .replace(/大[dD]/g, "大量搜牌")
    .replace(/小[dD]/g, "小幅搜牌")
    .replace(/慢[dD]/g, "卡利息慢搜")
    .replace(/[dD]牌/g, "搜牌")
    .replace(/[dD]到/g, "搜到")
    .replace(/[dD]整体/g, "搜出全员")
    .replace(/[dD]全/g, "搜出全员")
    .replace(/[dD]场面/g, "搜出场面")
    .replace(/[dD]质量/g, "提升质量")
    .replace(/[dD]两星/g, "搜出两星")
    .replace(/[dD]三星/g, "搜出三星")
    .replace(/84/g, "八级四费")
    .replace(/95/g, "九五阵容")
    .replace(/全2/g, "全员两星")
    .replace(/\s+/g, "")
    .replace(/，+/g, "，")
    .replace(/。+/g, "。");
  return /[。！？]$/.test(text) ? text : `${text}。`;
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
  const [teamData, rankData, gameMetadata, dataJComps, douyinCards] = await Promise.all([
    post("/team/list", TEAM_QUERY),
    post("/team/rank", {}),
    loadGameMetadata(),
    loadDataJComps(),
    loadDouyinCards(),
  ]);
  if (!Array.isArray(teamData.list) || teamData.list.length === 0) throw new Error("DataTFT returned no S18 teams");
  const heroById = new Map(gameMetadata.heroes.map((hero) => [String(hero.chessId), hero]));
  const equipById = new Map(gameMetadata.equips.map((equip) => [String(equip.equipId), equip]));
  const teamCodeMaps = buildTeamCodeMaps(gameMetadata.heroes, gameMetadata.equips);
  const codeByRoster = new Map(
    teamData.list
      .filter((team) => typeof team.jccCode === "string" && team.jccCode.startsWith("【阵容码】##"))
      .map((team) => [rosterKey(team.heros), team.jccCode]),
  );
  const [details, strategies] = await Promise.all([
    Promise.all(teamData.list.map((team) => post("/team/detail", { teamId: team.id, ...TEAM_QUERY }))),
    Promise.all(teamData.list.map((team) => post("/team/strategy", { id: team.strategyId || team.id }))),
  ]);
  const baseComps = teamData.list.map((team, index) => {
    const base = details[index]?.base || {};
    const strategy = strategies[index] || {};
    const board = decodeTeamBuilder(strategy.teamUrl, teamCodeMaps);
    const strategyEquips = recommendedEquips(strategy, equipById);
    const heroes = team.heros.map((hero) => {
      const meta = heroById.get(String(hero.id));
      const placed = board.find((item) => item.id === String(hero.id));
      return {
        name: meta?.displayName || meta?.title || hero.key || String(hero.id),
        id: String(hero.id),
        picture: heroImage(hero.id),
        poster: heroImage(hero.id, "originjpg"),
        price: Number(meta?.price || 0),
        isCarry: String(hero.id) === String(team.heroId),
        stars: Number(hero.stars || 2),
        recommendedItems: placed?.equips?.length ? placed.equips : (strategyEquips.get(String(hero.id)) || []),
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
      board,
      guide: {
        source: "DataTFT 一图流",
        updatedAt: strategy.updateTime || rankData.updateTime || "",
        teamUrl: strategy.teamUrl || "",
        core: polishGuideText(strategy.core),
        open: polishGuideText(strategy.open),
        earlyDesc: polishGuideText(strategy.earlyDesc),
        midDesc: polishGuideText(strategy.midDesc),
        finalDesc: polishGuideText(strategy.finalDesc),
      },
      races: uniqueTraitCounts(heroes, "races"),
      careers: uniqueTraitCounts(heroes, "jobs"),
    };
  });
  const missingBoards = baseComps.filter((comp) => !comp.board.length).map((comp) => comp.name);
  if (missingBoards.length) throw new Error(`Missing verified board data: ${missingBoards.join(", ")}`);
  const guideFields = ["core", "open", "earlyDesc", "midDesc", "finalDesc"];
  const untranslatedGuides = baseComps.flatMap((comp) => guideFields
    .filter((field) => comp.guide[field] && !/[\u3400-\u9fff]/.test(comp.guide[field]))
    .map((field) => `${comp.name}.${field}`));
  if (untranslatedGuides.length) {
    throw new Error(`Guide text is not Chinese: ${untranslatedGuides.join(", ")}`);
  }
  const guidesWithLatinText = baseComps.flatMap((comp) => guideFields
    .filter((field) => /[A-Za-z]/.test(comp.guide[field] || ""))
    .map((field) => `${comp.name}.${field}`));
  if (guidesWithLatinText.length) {
    throw new Error(`Guide text still contains English: ${guidesWithLatinText.join(", ")}`);
  }
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
const detailCount = comps.filter((comp) => comp.board?.length).length;
const equippedHeroCount = comps.reduce((count, comp) => count + comp.board.filter((hero) => hero.equips?.length).length, 0);
if (codeCount !== comps.length) throw new Error(`Only ${codeCount}/${comps.length} lineups have verified JCC codes`);
if (detailCount !== comps.length) throw new Error(`Only ${detailCount}/${comps.length} lineups have verified board details`);
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
console.log(JSON.stringify({ count: comps.length, codeCount, detailCount, equippedHeroCount, dataJMatchCount, trendCardCount, updatedAt, trendUpdatedAt }));
