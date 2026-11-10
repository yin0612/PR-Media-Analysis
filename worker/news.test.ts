import { it, expect, vi, afterEach } from "vitest";
import {
  newsQuery,
  parseNewsRSS,
  relevant,
  mergeNews,
  collectNews,
  loadNews,
} from "./news";
import type { NewsEnv } from "./news";
import type { NewsFeed } from "../src/news-types";
afterEach(() => vi.unstubAllGlobals());
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
it("網址去重並保留來源，不以同標題誤刪其他網站", () => {
  const a = parseNewsRSS(xml, historical())[0];
  expect(
    mergeNews([a, { ...a, sources: ["MediaMonitoring"] }])[0].sources,
  ).toHaveLength(2);
  expect(
    mergeNews([a, { ...a, id: "b", url: "https://example.com/another" }]),
  ).toHaveLength(2);
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
it("拒絕無效日期、未知主題及過大的搜尋輸入", () => {
  for (const query of [
    "topic=unknown",
    "q=a",
    "q=brand&from=2026-02-30&to=2026-03-01",
    "q=brand&from=2026-05-01&to=2026-04-01",
  ])
    expect(() => newsQuery(new URL("https://example.com/?" + query))).toThrow();
});
