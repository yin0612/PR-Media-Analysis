import { afterEach, expect, it, vi } from "vitest";
import { searchStatus, startSearch, updateSearch } from "./news-search";
import type { SearchEnv } from "./news-search";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it("新議題派送實際查詢，同期間重複點擊沿用工作，結果依原查詢驗證", async () => {
  vi.setSystemTime(new Date("2026-11-18T04:00:00Z"));
  const values = new Map();
  const env: SearchEnv = {
    NEWS_DISPATCH_TOKEN: "test",
    NEWS_CACHE: {
      get: async (key) => values.get(key) || null,
      put: async (key, value) => {
        values.set(key, JSON.parse(value));
      },
    },
  };
  const dispatch = vi
    .fn()
    .mockResolvedValue(new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", dispatch);
  const input = { issue: "史瓦帝尼", from: "2026-10-13", to: "2026-10-14" };
  const first = await startSearch(env, input);
  expect(first.status).toBe("queued");
  expect((await startSearch(env, input)).id).toBe(first.id);
  expect(dispatch).toHaveBeenCalledTimes(1);
  const sent = JSON.parse(dispatch.mock.calls[0][1].body);
  expect(JSON.parse(sent.inputs.search_json)).toEqual(input);
  await updateSearch(env, { searchId: first.id, stage: "running" });
  expect((await searchStatus(env, first.id)).status).toBe("running");
  await updateSearch(env, {
    searchId: first.id,
    stage: "complete",
    xml: "<rss><channel><title>Test</title></channel></rss>",
    bodyMatches: [
      {
        title: "支付交流",
        publisher: "媒體",
        url: "https://example.com/eswatini",
        date: "2026-10-13T05:00:00Z",
        summary: "藍新科技接待史瓦帝尼訪團。",
      },
      {
        title: "其他新聞",
        url: "https://example.com/other",
        date: "2026-10-13T05:00:00Z",
        summary: "藍新科技與台灣大合作。",
      },
    ],
  });
  const result = await searchStatus(env, first.id);
  expect(result.status).toBe("complete");
  expect(result.feed?.items).toHaveLength(1);
  expect(result.feed?.items[0].bodyKeywords).toEqual(["藍新科技", "史瓦帝尼"]);
  expect(dispatch).toHaveBeenCalledTimes(1);
});

it("派送失敗可重試，日期錯誤不派送，逾時回報失敗", async () => {
  vi.setSystemTime(new Date("2026-11-18T04:00:00Z"));
  const values = new Map();
  const env: SearchEnv = {
    NEWS_DISPATCH_TOKEN: "test",
    NEWS_CACHE: {
      get: async (key) => values.get(key) || null,
      put: async (key, value) => {
        values.set(key, JSON.parse(value));
      },
    },
  };
  const dispatch = vi
    .fn()
    .mockResolvedValueOnce(new Response(null, { status: 403 }))
    .mockResolvedValue(new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", dispatch);
  const input = { issue: "台灣大", from: "2026-10-27", to: "2026-11-03" };
  expect((await startSearch(env, input)).status).toBe("failed");
  const retry = await startSearch(env, input);
  expect(retry.status).toBe("queued");
  await expect(
    startSearch(env, { ...input, to: "2026-02-30" }),
  ).rejects.toThrow();
  expect(dispatch).toHaveBeenCalledTimes(2);
  vi.setSystemTime(new Date("2026-11-18T04:11:00Z"));
  expect((await searchStatus(env, retry.id)).status).toBe("failed");
});
