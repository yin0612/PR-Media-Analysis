import { supplementalNewsSources } from "../src/news-sources.ts";
import { defaultNewsTopics } from "../src/news-types.ts";
import { newsGoogleTerms } from "../src/news-keywords.ts";
import {
  addScopedTitleMatches,
  collectBodyMatches,
  inBatches,
} from "./news-body.mjs";

const base =
  process.env.NEWS_API_URL ||
  "https://pr-media-analysis-api.media-monitoring-worker.workers.dev";
const key = process.env.NEWS_INGEST_KEY;
if (!key) throw new Error("NEWS_INGEST_KEY is not configured");
const localDay = (offset = 0) =>
  new Date(Date.now() + 8 * 3600000 + offset * 86400000)
    .toISOString()
    .slice(0, 10);
const today = localDay();
const searchId = process.env.NEWS_SEARCH_ID || "";
let requested = null;
if (searchId) {
  if (!/^[a-f0-9]{64}$/.test(searchId))
    throw new Error("Invalid query identifier");
  const values = JSON.parse(process.env.NEWS_SEARCH_JSON || "{}");
  const preset = values.topic
    ? defaultNewsTopics.find((topic) => topic.id === values.topic)
    : null;
  if (values.topic && !preset) throw new Error("Unknown topic");
  const issue =
    preset?.issue ||
    (typeof values.issue === "string" ? values.issue.trim() : undefined);
  const query = issue ? `藍新 ${issue}` : String(values.q || "").trim();
  if (query.length < 2 || query.length > 100 || /[<>"\x00-\x1f]/.test(query))
    throw new Error("Invalid public query");
  for (const date of [values.from, values.to])
    if (
      typeof date !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !Number.isFinite(Date.parse(date)) ||
      new Date(date).toISOString().slice(0, 10) !== date
    )
      throw new Error("Invalid query date");
  if (
    values.from > values.to ||
    values.to > today ||
    Date.parse(values.to) - Date.parse(values.from) > 365 * 86400000
  )
    throw new Error("Invalid query period");
  requested = {
    ...preset,
    query: preset?.query || query,
    issue,
    from: values.from,
    to: values.to,
  };
}
const topics = requested
  ? [
      {
        id: requested.id || "",
        query: requested.query,
        issue: requested.issue,
        issueAliases: requested.issueAliases,
        from: requested.from,
        to: requested.to,
        sites: [...new Set([...bodySearchSitesForRequest()])],
      },
    ]
  : defaultNewsTopics.map((topic) => ({
      ...topic,
      from: topic.from || localDay(-29),
      to: topic.to && topic.to < today ? topic.to : today,
    }));
function bodySearchSitesForRequest() {
  return [
    ...supplementalNewsSources.map((source) => source.site),
    "cna.com.tw",
    "udn.com",
    "money.udn.com",
    "ctwant.com",
    "news.pchome.com.tw",
    "n.yam.com",
    "today.line.me",
    "tw.news.yahoo.com",
    "tw.stock.yahoo.com",
    "chinatimes.com",
    "ctee.com.tw",
    "investor.com.tw",
    "money-link.com.tw",
    "knews.com.tw",
    "idn.com.tw",
  ];
}
const bodySearchSites = [
  "ctwant.com",
  "money.udn.com",
  "udn.com",
  "news.pchome.com.tw",
  "n.yam.com",
  "today.line.me",
  "tw.news.yahoo.com",
  "tw.stock.yahoo.com",
  "chinatimes.com",
  "ctee.com.tw",
  "money-link.com.tw",
  "wantrich.chinatimes.com",
  "investor.com.tw",
  "stock.ltn.com.tw",
  "cardu.com.tw",
];
const eswatiniArticleLinks = [
  [
    "富聯網",
    "https://ww2.money-link.com.tw/realtimenews/NewsContent.aspx?PU=1002&SN=6329725001",
    "2026-10-13",
    "《文創股》史瓦帝尼訪團參訪藍新科技 借鏡多元支付與AI代理支付經驗",
  ],
  [
    "蕃新聞",
    "https://n.yam.com/Article/20261013653562",
    "2026-10-13",
    "藍新科技分享台灣支付經驗 助史瓦帝尼拓展數位商務",
  ],
  [
    "Yahoo 股市",
    "https://tw.stock.yahoo.com/news/%E6%99%BA%E5%86%A0%E6%97%97%E4%B8%8B%E8%97%8D%E6%96%B0%E7%A7%91%E6%8A%80%E5%88%86%E4%BA%AB%E5%8F%B0%E7%81%A3%E6%94%AF%E4%BB%98%E7%B6%93%E9%A9%97-%E5%8A%A9%E5%8F%8B%E9%82%A6%E5%8F%B2%E7%93%A6%E5%B8%9D%E5%B0%BC%E6%8B%93%E5%B1%95%E6%95%B8%E4%BD%8D%E5%95%86%E5%8B%99-053856149.html",
  ],
  ["中央社", "https://www.cna.com.tw/news/afe/202610130166.aspx"],
  ["聯合新聞網", "https://udn.com/news/story/7240/9811857"],
  ["經濟日報", "https://money.udn.com/money/story/5612/9811857"],
  [
    "放言",
    "https://www.fountmedia.io/article/433875",
    "2026-10-13",
    "第三方支付公會推動與史瓦帝尼交流 展示AI代理支付",
  ],
  [
    "PChome Online 新聞",
    "https://news.pchome.com.tw/finance/cna/20261013/index-17918742396331018003.html",
    "2026-10-13",
    "第三方支付公會推動與史瓦帝尼交流 展示AI代理支付",
  ],
  [
    "Yahoo 新聞",
    "https://tw.news.yahoo.com/share/22427aeb-9d88-3921-baca-93b9813e3012",
  ],
  [
    "自立晚報",
    "https://www.idn.com.tw/news/news_content.aspx?catid=3&catsid=1&catdid=0&artid=20261013kofang011",
  ],
  [
    "PChome Online 新聞",
    "https://news.pchome.com.tw/living/leho/20261014/index-79192060181002356009.html",
    "2026-10-14",
  ],
  [
    "PChome Online 新聞",
    "https://news.pchome.com.tw/finance/idn/20261014/index-79192380880741224003.html",
    "2026-10-14",
    "第三方支付公會深化台史交流 史瓦帝尼次長訪藍新科技",
  ],
  [
    "Yahoo 新聞",
    "https://tw.news.yahoo.com/share/ee130125-24c9-3dd6-96f2-94f990da0ed7",
    "2026-10-14",
  ],
];

function googleUrl(topic, query) {
  const after = new Date(Date.parse(topic.from) - 86400000)
    .toISOString()
    .slice(0, 10);
  const before = new Date(Date.parse(topic.to) + 86400000)
    .toISOString()
    .slice(0, 10);
  const url = new URL("https://news.google.com/rss/search");
  url.search = new URLSearchParams({
    q: `${query} after:${after} before:${before}`,
    hl: "zh-TW",
    gl: "TW",
    ceid: "TW:zh-Hant",
  }).toString();
  return url;
}

async function fetchRSS(url, maxBytes, timeout = 30000) {
  const rss = await fetch(url, {
    headers: {
      Accept: "application/rss+xml,application/xml,text/xml,*/*",
      "User-Agent": "PRMediaNewsCollector/1.0",
    },
    signal: AbortSignal.timeout(timeout),
  });
  if (!rss.ok) throw new Error(`RSS HTTP ${rss.status}`);
  const xml = await rss.text();
  if (Buffer.byteLength(xml) > maxBytes || !xml.includes("<rss"))
    throw new Error("Invalid RSS response");
  return xml;
}

async function collectMedia(topic) {
  const feeds = [];
  // Keep Google News requests spread across small groups.
  for (let i = 0; i < supplementalNewsSources.length; i += 3) {
    const batch = supplementalNewsSources.slice(i, i + 3);
    await Promise.all(
      batch.map(async ({ id, site, rss }) => {
        let officialXml = "";
        try {
          if (rss) {
            try {
              officialXml = await fetchRSS(rss, 160000, 12000);
              if (/藍新(?!資訊)|newebpay/i.test(officialXml)) {
                feeds.push({ id, xml: officialXml, official: true });
                return;
              }
            } catch (e) {
              console.warn(`Official RSS failed for ${id}: ${e.message}`);
            }
          }
          const url = googleUrl(topic, `site:${site} "藍新"`);
          feeds.push({
            id,
            xml: await fetchRSS(url, 160000, 12000),
            official: false,
          });
        } catch (e) {
          if (officialXml) feeds.push({ id, xml: officialXml, official: true });
          console.warn(`Supplemental RSS failed for ${id}: ${e.message}`);
        }
      }),
    );
  }
  return feeds;
}

async function collectBodyFeeds(topic) {
  const sites =
    topic.sites ||
    (topic.id === "newebpay"
      ? bodySearchSites
      : topic.issue
        ? [
            "ctwant.com",
            "inews.setn.com",
            "money.udn.com",
            "news.pchome.com.tw",
            "today.line.me",
          ]
        : []);
  const terms =
    topic.sites && topic.issue && !searchId
      ? `"${topic.issue}"`
      : topic.issue || searchId
        ? newsGoogleTerms(
            topic.query,
            topic.id,
            topic.issue,
            topic.issueAliases,
          )
        : '"藍新"';
  const feeds = await inBatches(sites, 4, async (site) => {
    try {
      const url = googleUrl(topic, `site:${site} ${terms}`);
      return { site, xml: await fetchRSS(url, 180000, 6000) };
    } catch (e) {
      console.warn(`Article search failed for ${site}: ${e.message}`);
      return null;
    }
  });
  return feeds.filter(Boolean);
}

let failed = 0;
async function reportSearch(stage, fields = {}) {
  let response;
  for (let attempt = 0; attempt < 5; attempt++) {
    response = await fetch(base + "/api/news/ingest", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ searchId, stage, ...fields }),
      signal: AbortSignal.timeout(30000),
    });
    if (response.ok || response.status === 401) break;
    if (attempt < 4) await new Promise((resolve) => setTimeout(resolve, 15000));
  }
  if (!response?.ok) throw new Error(`Query update HTTP ${response?.status}`);
  return response.json();
}
if (searchId) await reportSearch("running");
for (const topic of topics) {
  if (topic.from > topic.to) continue;
  try {
    const terms = newsGoogleTerms(
      topic.query,
      topic.id,
      topic.issue,
      topic.issueAliases,
    );
    const [mainXml, media, additional] = await Promise.all([
      fetchRSS(googleUrl(topic, terms), 1_400_000).catch((e) => {
        console.warn(`Google News RSS failed for ${topic.id}: ${e.message}`);
        return "";
      }),
      topic.id === "newebpay" ? collectMedia(topic) : [],
      collectBodyFeeds(topic),
    ]);
    const xml = addScopedTitleMatches(mainXml, additional, topic);
    const publicLinks =
      topic.id === "eswatini-202610"
        ? eswatiniArticleLinks.map(
            ([publisher, url, date = topic.from, title]) => ({
              publisher,
              url,
              date,
              title,
            }),
          )
        : [];
    const body = await collectBodyMatches(
      topic,
      [
        { xml: mainXml },
        ...media.map((feed) => {
          const source = supplementalNewsSources.find(
            (source) => source.id === feed.id,
          );
          return { ...feed, site: source.site, name: source.name };
        }),
        ...additional,
      ],
      publicLinks,
    );
    // These public originals were checked against the historical release.
    const readUrls = new Set(body.matches.map((row) => row.url));
    const archived = publicLinks
      .filter((row) => row.title && !readUrls.has(row.url))
      .map((row) => ({
        ...row,
        archived: true,
        summary: "藍新科技、史瓦帝尼",
      }));
    if (!xml && !media.length && !body.matches.length && !archived.length)
      throw new Error("No RSS feeds available");
    const payload = {
      topic: topic.id,
      xml,
      media,
      bodyMatches: [...archived, ...body.matches],
    };
    const r = searchId
      ? null
      : await fetch(base + "/api/news/ingest", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(90000),
        });
    const data = searchId
      ? await reportSearch("complete", payload)
      : await r.json();
    if ((r && !r.ok) || data.status === "failed")
      throw new Error(`Ingest HTTP ${r?.status || 400}`);
    console.log(
      JSON.stringify({
        topic: topic.id,
        count: data.feed?.items?.length ?? data.count,
        status: data.status,
        updatedAt: data.updatedAt,
        supplementalFeeds: media.length,
        articlesChecked: body.checked,
        readableArticles: body.readable,
        bodyMatches: body.matches.length,
        archived: archived.length,
      }),
    );
  } catch (e) {
    failed++;
    if (searchId) await reportSearch("failed").catch(() => {});
    console.error(`News update failed for ${topic.id}: ${e.message}`);
  }
}
if (failed) process.exitCode = 1;
