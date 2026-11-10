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
let failed = 0;
for (const topic of topics) {
  try {
    const after = new Date(Date.parse(topic.from) - 86400000)
      .toISOString()
      .slice(0, 10);
    const before = new Date(Date.parse(topic.to) + 86400000)
      .toISOString()
      .slice(0, 10);
    const url = new URL("https://news.google.com/rss/search");
    url.search = new URLSearchParams({
      q: `${topic.query} after:${after} before:${before}`,
      hl: "zh-TW",
      gl: "TW",
      ceid: "TW:zh-Hant",
    }).toString();
    const rss = await fetch(url, {
      headers: {
        Accept: "application/rss+xml,application/xml",
        "User-Agent": "PRMediaNewsCollector/1.0",
      },
      signal: AbortSignal.timeout(30000),
    });
    if (!rss.ok) throw new Error(`RSS HTTP ${rss.status}`);
    const xml = await rss.text();
    if (xml.length > 1400000 || !xml.includes("<rss"))
      throw new Error("Invalid RSS response");
    const r = await fetch(base + "/api/news/ingest", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ topic: topic.id, xml }),
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
      }),
    );
  } catch (e) {
    failed++;
    console.error(`News update failed for ${topic.id}: ${e.message}`);
  }
}
if (failed) process.exitCode = 1;
