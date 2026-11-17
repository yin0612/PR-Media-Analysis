import { it, expect, vi, afterEach } from "vitest";
import {
  newsQuery,
  parseNewsRSS,
  relevant,
  mergeNews,
  collectNews,
  loadNews,
  ingestRSS,
} from "./news";
import type { NewsEnv } from "./news";
import type { NewsFeed } from "../src/news-types";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
const historical = () =>
  newsQuery(new URL("https://example.com/?topic=aftee-202604"));
const xml =
  '<rss><channel><item><title>藍新金流攜手AFTEE服務 - 示意媒體</title><link>https://news.google.com/rss/articles/test</link><pubDate>Wed, 29 Apr 2026 07:00:00 GMT</pubDate><source url="https://example.com">示意媒體</source></item></channel></rss>';
function memory() {
  const values = new Map<string, NewsFeed>();
  const env: NewsEnv = {
    NEWS_CACHE: {
      get: async (k) => values.get(k) || null,
      put: async (k, v) => {
        values.set(k, JSON.parse(v));
      },
    },
  };
  return { env, values };
}
it("自動主題不混入同名的藍新資訊，舊事件有獨立期間", () => {
  const q = newsQuery(new URL("https://example.com/?topic=newebpay"));
  expect(relevant("藍新資訊股價", "", q)).toBe(false);
  expect(relevant("藍新金流服務", "", q)).toBe(true);
  expect(historical()).toMatchObject({ from: "2026-04-29", to: "2026-05-14" });
});
it("RSS 保留媒體、真實日期、聚合連結且不捏造記者", () => {
  const a = parseNewsRSS(xml, historical());
  expect(a).toHaveLength(1);
  expect(a[0]).toMatchObject({
    title: "藍新金流攜手AFTEE服務",
    publisher: "示意媒體",
    author: "",
    linkKind: "aggregator",
  });
  expect(
    parseNewsRSS(xml.replace("29 Apr", "28 Apr"), historical()),
  ).toHaveLength(0);
  expect(() => parseNewsRSS("<!DOCTYPE rss>" + xml, historical())).toThrow();
});
it("標題沒有品牌的報導可由原站內文命中，單有標題不標示為內文命中", async () => {
  vi.setSystemTime(new Date("2026-11-17T08:00:00Z"));
  const { env } = memory();
  env.MONITORING = {
    fetch: async () => Response.json({ data: { items: [] } }),
  };
  const article = {
    title: "人工智慧幫人買東西？AI導購平台有望登場",
    url: "https://inews.setn.com/news/example",
    publisher: "三立新聞網",
    date: "2026-11-13T05:00:00Z",
    summary: "藍新科技宣布推出新的購物平台。",
  };
  await ingestRSS(
    env,
    "newebpay",
    "<rss><channel><title>Google</title></channel></rss>",
    [],
    [
      article,
      {
        ...article,
        title: "藍新科技",
        summary: "其他內容",
        url: "https://example.com/other",
      },
    ],
  );
  const feed = await loadNews(
    env,
    newsQuery(new URL("https://example.com/?topic=newebpay")),
  );
  expect(feed.items).toHaveLength(1);
  expect(feed.items[0]).toMatchObject({
    title: article.title,
    url: article.url,
    bodyKeywords: ["藍新科技"],
    sources: ["新聞內文比對"],
  });
});
it("網址去重並保留來源，不以同標題誤刪其他網站", () => {
  const a = parseNewsRSS(xml, historical())[0];
  expect(
    mergeNews([a, { ...a, sources: ["MediaMonitoring"] }])[0].sources,
  ).toHaveLength(2);
  expect(
    mergeNews([a, { ...a, id: "b", url: "https://example.com/another" }]),
  ).toHaveLength(2);
});
it("原站連結與已核對的 Google 連結合併，其他同標題報導保留", () => {
  const aggregator = parseNewsRSS(xml, historical())[0];
  const original = {
    ...aggregator,
    id: "https://example.com/article",
    url: "https://example.com/article",
    linkKind: "publisher" as const,
    bodyKeywords: ["藍新金流", "AFTEE"],
    rssLinks: [aggregator.url + "?oc=5"],
    sources: ["新聞內文比對"],
  };
  const syndicated = {
    ...original,
    id: "https://other.example/article",
    url: "https://other.example/article",
    rssLinks: [],
  };
  const result = mergeNews([aggregator, original, syndicated]);
  expect(result.map((item) => item.url)).toEqual([
    original.url,
    syndicated.url,
  ]);
  expect(result[0].sources).toEqual(["Google News RSS", "新聞內文比對"]);
});
it("來源失敗保留雲端最後成功資料，不能顯示成成功", async () => {
  const { env } = memory();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(xml)));
  const first = await collectNews(env, historical());
  expect(first.items).toHaveLength(1);
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
  const next = await collectNews(env, historical());
  expect(next.status).toBe("failed");
  expect(next.items).toHaveLength(1);
  expect(next.lastSuccessAt).toBe(first.lastSuccessAt);
  expect((await loadNews(env, historical())).items).toHaveLength(1);
});
it("補充媒體的官方與 Google RSS 進入藍新清單，部分失敗保留上次結果", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-17T08:00:00Z"));
  const { env } = memory();
  env.MONITORING = {
    fetch: async () => Response.json({ data: { items: [] } }),
  };
  const googleFeed = xml
    .replace("藍新金流攜手AFTEE服務", "藍新攜手萬事達卡推AI導購平台")
    .replace("Wed, 29 Apr", "Fri, 13 Nov");
  const officialFeed = xml
    .replace(" - 示意媒體", "")
    .replace(
      "https://news.google.com/rss/articles/test",
      "https://3kingtw.com/4566/",
    )
    .replace("Wed, 29 Apr", "Fri, 13 Nov");
  const result = await ingestRSS(
    env,
    "newebpay",
    "<rss><channel><title>Google</title></channel></rss>",
    [
      { id: "biggo", xml: googleFeed, official: false },
      { id: "3kingtw", xml: officialFeed, official: true },
      { id: "2000fun", xml: "<html></html>", official: true },
    ],
  );
  expect(result).toMatchObject({ count: 2, status: "partial" });
  await ingestRSS(env, "newebpay", "", [
    { id: "biggo", xml: googleFeed, official: false },
  ]);
  const feed = await loadNews(
    env,
    newsQuery(new URL("https://example.com/?topic=newebpay")),
  );
  expect(feed.items).toHaveLength(2);
  expect(feed.items).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        publisher: "BigGo 財經",
        linkKind: "aggregator",
        sources: ["Google News RSS"],
      }),
      expect.objectContaining({
        publisher: "鑫台灣財經網",
        linkKind: "publisher",
        sources: ["官方 RSS"],
      }),
    ]),
  );
});
it("拒絕無效日期、未知主題及過大的搜尋輸入", () => {
  for (const query of [
    "topic=unknown",
    "q=a",
    "q=brand&from=2026-02-30&to=2026-03-01",
    "q=brand&from=2026-05-01&to=2026-04-01",
  ])
    expect(() => newsQuery(new URL("https://example.com/?" + query))).toThrow();
});
