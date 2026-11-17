import { supplementalNewsSources } from "../src/news-sources.ts";

const base =
  process.env.NEWS_API_URL ||
  "https://pr-media-analysis-api.media-monitoring-worker.workers.dev";
const key = process.env.NEWS_INGEST_KEY;
if (!key) throw new Error("NEWS_INGEST_KEY is not configured");
const localDay = (offset = 0) =>
  new Date(Date.now() + 8 * 3600000 + offset * 86400000)
    .toISOString()
    .slice(0, 10);
const topics = [
  {
    id: "newebpay",
    query: '("藍新金流" OR "藍新科技" OR NewebPay)',
    from: localDay(-29),
    to: localDay(),
  },
  {
    id: "aftee-202604",
    query: "藍新 AFTEE",
    from: "2026-04-29",
    to: "2026-05-14",
  },
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

let failed = 0;
for (const topic of topics) {
  try {
    const [xml, media] = await Promise.all([
      fetchRSS(googleUrl(topic, topic.query), 1_400_000).catch((e) => {
        console.warn(`Google News RSS failed for ${topic.id}: ${e.message}`);
        return "";
      }),
      topic.id === "newebpay" ? collectMedia(topic) : [],
    ]);
    if (!xml && !media.length) throw new Error("No RSS feeds available");
    const r = await fetch(base + "/api/news/ingest", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ topic: topic.id, xml, media }),
      signal: AbortSignal.timeout(90000),
    });
    const data = await r.json();
    if (!r.ok || data.status === "failed")
      throw new Error(`Ingest HTTP ${r.status}`);
    console.log(
      JSON.stringify({
        topic: topic.id,
        count: data.count,
        status: data.status,
        updatedAt: data.updatedAt,
        supplementalFeeds: media.length,
      }),
    );
  } catch (e) {
    failed++;
    console.error(`News update failed for ${topic.id}: ${e.message}`);
  }
}
if (failed) process.exitCode = 1;
