import { XMLParser } from "fast-xml-parser";
import { canonicalize, taipeiDate } from "../src/domain";
import {
  cleanNewsIssue,
  newsGoogleTerms,
  newsKeywords,
} from "../src/news-keywords";
import { supplementalNewsSources } from "../src/news-sources";
import type { MediaSource } from "../src/news-sources";
import { defaultNewsTopics } from "../src/news-types";
import type { NewsFeed, NewsItem } from "../src/news-types";
import { readLimited } from "./security";
export interface NewsEnv {
  MONITORING?: { fetch(input: Request | string | URL): Promise<Response> };
  NEWS_CACHE?: {
    get(key: string, type: "json"): Promise<unknown>;
    put(
      key: string,
      value: string,
      options?: { expirationTtl: number },
    ): Promise<unknown>;
  };
  NEWS_LIMITER?: {
    limit(input: { key: string }): Promise<{ success: boolean }>;
  };
}
export interface NewsQuery {
  key: string;
  query: string;
  topicId: string;
  from: string;
  to: string;
  issue?: string;
  issueAliases?: string[];
}
export function newsQuery(url: URL, at = Date.now()): NewsQuery {
  const topicId = url.searchParams.get("topic") || "";
  const topic = defaultNewsTopics.find((t) => t.id === topicId);
  if (topicId && !topic) throw new Error("找不到追蹤主題");
  const issue =
    topic?.issue ||
    (!topicId && url.searchParams.has("issue")
      ? cleanNewsIssue(url.searchParams.get("issue") || "")
      : undefined);
  if (
    issue !== undefined &&
    (issue.length < 2 || issue.length > 80 || /[<>"\x00-\x1f]/.test(issue))
  )
    throw new Error("請輸入 2 至 80 個字的公開議題關鍵字");
  const query = (
    topic?.query ||
    (issue ? `藍新 ${issue}` : url.searchParams.get("q")) ||
    "藍新金流"
  )
    .trim()
    .replace(/\s+/g, " ");
  if (query.length < 2 || query.length > 100 || /[<>\x00-\x1f]/.test(query))
    throw new Error("請輸入 2 至 100 個字的公開新聞關鍵字");
  const today = taipeiDate(new Date(at).toISOString());
  const from =
    topic?.from ||
    url.searchParams.get("from") ||
    taipeiDate(new Date(at - 29 * 86400000).toISOString());
  const to = topic?.to
    ? topic.to > today
      ? today
      : topic.to
    : url.searchParams.get("to") || today;
  for (const day of [from, to]) {
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(day) ||
      Number.isNaN(Date.parse(day)) ||
      new Date(day).toISOString().slice(0, 10) !== day
    )
      throw new Error("日期格式不正確");
  }
  if (
    from > to ||
    to > today ||
    Date.parse(to) - Date.parse(from) > 365 * 86400000
  )
    throw new Error("請選擇不超過一年的有效新聞期間");
  return {
    key:
      topic?.id ||
      JSON.stringify([query, from, to, ...(issue ? ["issue-v2"] : [])]),
    query,
    topicId: topic?.id || "",
    from,
    to,
    issue,
    issueAliases: topic?.issueAliases,
  };
}
function clean(v: unknown) {
  return String(v ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
export function relevant(title: string, summary: string, q: NewsQuery) {
  return (
    newsKeywords(
      title + " " + summary,
      q.topicId,
      q.query,
      q.issue,
      q.issueAliases,
    ).length > 0
  );
}
function allowedDate(date: string, q: NewsQuery) {
  if (!date || Number.isNaN(Date.parse(date))) return false;
  const day = taipeiDate(date);
  return (
    day >= q.from && day <= q.to && Date.parse(date) <= Date.now() + 300000
  );
}
function makeItem(
  input: {
    title: unknown;
    url: unknown;
    publisher: unknown;
    date: unknown;
    summary?: unknown;
    author?: unknown;
  },
  source: string,
  q: NewsQuery,
): NewsItem | null {
  const title = clean(input.title),
    summary = clean(input.summary).slice(0, 1500);
  let url = "";
  try {
    url = canonicalize(String(input.url || ""));
  } catch {
    return null;
  }
  const date = Date.parse(String(input.date || ""));
  if (
    !url ||
    !title ||
    Number.isNaN(date) ||
    !allowedDate(new Date(date).toISOString(), q) ||
    !relevant(title, summary, q)
  )
    return null;
  return {
    id: url,
    title,
    url,
    publisher:
      clean(input.publisher) || new URL(url).hostname.replace(/^www\./, ""),
    author: clean(input.author),
    publishedAt: new Date(date).toISOString(),
    summary,
    linkKind:
      new URL(url).hostname === "news.google.com" ? "aggregator" : "publisher",
    sources: [source],
  };
}
export function parseNewsRSS(
  xml: string,
  q: NewsQuery,
  media?: { source: MediaSource; official: boolean },
): NewsItem[] {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error("不支援的新聞格式");
  const parsed = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    parseTagValue: false,
    trimValues: true,
  }).parse(xml);
  if (!parsed?.rss?.channel) throw new Error("來源未提供有效 RSS");
  const entries = parsed.rss.channel.item;
  const items = Array.isArray(entries) ? entries : entries ? [entries] : [];
  return items.slice(0, 150).flatMap((r: Record<string, unknown>) => {
    const source = r.source as { "#text"?: string } | string | undefined;
    const publisher = typeof source === "object" ? source["#text"] : source;
    let title = clean(r.title);
    if (!media?.official && publisher && title.endsWith(" - " + publisher))
      title = title.slice(0, -publisher.length - 3);
    const a = makeItem(
      {
        title,
        url: r.link,
        publisher: media?.source.name || publisher,
        date: r.pubDate,
        summary: media?.official ? r.description : "",
        author: media?.official ? r["dc:creator"] || r.author : "",
      },
      media?.official ? "官方 RSS" : "Google News RSS",
      q,
    );
    return a ? [a] : [];
  });
}

interface CachedRSS {
  items: NewsItem[];
  fetchedAt: string;
}

interface CachedMedia extends CachedRSS {
  count: number;
}

const supplementalCacheKey = "rss:media:v1:newebpay";
const supplementalSourceName = "補充媒體 RSS";

function isFreshRSS(cached: CachedRSS | null) {
  return (
    cached &&
    Array.isArray(cached.items) &&
    Date.now() - Date.parse(cached.fetchedAt) < 6 * 3600000
  );
}

function matchesQuery(items: NewsItem[], q: NewsQuery) {
  return items.filter(
    (item) =>
      allowedDate(item.publishedAt, q) && relevant(item.title, item.summary, q),
  );
}

function bodyItems(input: unknown, q: NewsQuery) {
  if (!Array.isArray(input)) return [];
  return input.slice(0, 60).flatMap((row) => {
    if (typeof row?.summary !== "string" || row.summary.length > 400) return [];
    const keywords = newsKeywords(
      row.summary,
      q.topicId,
      q.query,
      q.issue,
      q.issueAliases,
    );
    if (!keywords.length) return [];
    const item = makeItem(
      row,
      row.archived === true ? "歷史原文核對" : "新聞內文比對",
      q,
    );
    return item?.linkKind === "publisher"
      ? [
          {
            ...item,
            bodyKeywords: keywords,
            rssLinks:
              typeof row.rssLink === "string" && googleArticleKey(row.rssLink)
                ? [row.rssLink]
                : [],
          },
        ]
      : [];
  });
}

const publisherNames: Record<string, string> = {
  anue: "鉅亨網",
  ltn: "自由時報",
  cna: "中央社",
  udn: "聯合新聞網",
  yahoonews: "Yahoo 新聞",
  ctee: "工商時報",
  chinatimes: "中時新聞網",
  moneydj: "MoneyDJ",
};
async function monitoring(q: NewsQuery, env: NewsEnv): Promise<NewsItem[]> {
  const queries =
    q.topicId === "newebpay" ? ["藍新金流", "藍新科技"] : [q.issue || q.query];
  const runs = await Promise.all(
    queries.map(async (query) => {
      const url = new URL(
        "https://media-monitoring-demo.media-monitoring-worker.workers.dev/api/search",
      );
      url.searchParams.set("q", query);
      url.searchParams.set("range", "30d");
      const res = env.MONITORING
        ? await env.MONITORING.fetch(url.toString())
        : await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (!res.ok) throw new Error("MONITORING_HTTP_" + res.status);
      const data = JSON.parse(await readLimited(res, 3_000_000));
      if (!Array.isArray(data?.data?.items))
        throw new Error("MONITORING_SCHEMA");
      return data.data.items.flatMap((r: Record<string, unknown>) => {
        const a = makeItem(
          {
            title: r.title,
            url: r.url,
            publisher:
              r.publisher ||
              r.sourceName ||
              publisherNames[String(r.source)] ||
              new URL(String(r.url)).hostname,
            date: r.publishedAt,
            summary: r.excerpt,
            author: r.author,
          },
          "MediaMonitoring",
          q,
        );
        return a ? [a] : [];
      });
    }),
  );
  return runs.flat();
}
async function google(q: NewsQuery, env: NewsEnv, stamp: (at: string) => void) {
  const cacheTopic =
    q.topicId ||
    (q.issue
      ? "newebpay"
      : q.query.toLowerCase().includes("aftee") && q.query.includes("藍新")
        ? "aftee-202604"
        : ["藍新金流", "藍新科技", "newebpay"].some((t) =>
              q.query.toLowerCase().includes(t),
            )
          ? "newebpay"
          : "");
  const previous: CachedRSS[] = [];
  if (cacheTopic && env.NEWS_CACHE) {
    const cached = (await env.NEWS_CACHE.get(
      "rss:v1:" + cacheTopic,
      "json",
    )) as CachedRSS | null;
    if (cached && isFreshRSS(cached)) {
      if (!q.issue || q.topicId) {
        stamp(cached.fetchedAt);
        return matchesQuery(cached.items, q);
      }
      previous.push(cached);
    }
  }
  if (q.issue && !q.topicId && env.NEWS_CACHE) {
    const namedTopics = defaultNewsTopics.filter(
      (topic) =>
        topic.id !== "newebpay" &&
        (!topic.from || topic.from <= q.to) &&
        (!topic.to || topic.to >= q.from),
    );
    const caches = await Promise.allSettled(
      namedTopics.map(
        async (topic) =>
          (await env.NEWS_CACHE!.get(
            "rss:v1:" + topic.id,
            "json",
          )) as CachedRSS | null,
      ),
    );
    for (const cache of caches) {
      if (
        cache.status === "fulfilled" &&
        cache.value &&
        isFreshRSS(cache.value)
      )
        previous.push(cache.value);
    }
  }
  const u = new URL("https://news.google.com/rss/search");
  const before = new Date(Date.parse(q.to) + 86400000)
    .toISOString()
    .slice(0, 10);
  const after = new Date(Date.parse(q.from) - 86400000)
    .toISOString()
    .slice(0, 10);
  const terms = newsGoogleTerms(q.query, q.topicId, q.issue, q.issueAliases);
  u.search = new URLSearchParams({
    q: `${terms} after:${after} before:${before}`,
    hl: "zh-TW",
    gl: "TW",
    ceid: "TW:zh-Hant",
  }).toString();
  const cachedItems = previous.flatMap((cache) => matchesQuery(cache.items, q));
  try {
    const res = await fetch(u, {
      signal: AbortSignal.timeout(q.issue ? 10000 : 20000),
      headers: { Accept: "application/rss+xml,application/xml,text/xml" },
    });
    if (!res.ok) throw new Error("RSS_HTTP_" + res.status);
    return [
      ...parseNewsRSS(await readLimited(res, 1_500_000), q),
      ...cachedItems,
    ];
  } catch (error) {
    if (!previous.length) throw error;
    stamp(
      previous
        .map((cache) => cache.fetchedAt)
        .sort()
        .at(-1)!,
    );
    return cachedItems;
  }
}
function googleArticleKey(link: string) {
  try {
    const url = new URL(link);
    if (
      url.origin === "https://news.google.com" &&
      /^\/rss\/articles\/[\w-]+$/.test(url.pathname)
    )
      return url.origin + url.pathname;
  } catch {
    return undefined;
  }
}

export function mergeNews(items: NewsItem[]) {
  const originals = new Map<string, NewsItem>();
  for (const item of items) {
    for (const link of item.rssLinks || []) {
      const key = googleArticleKey(link);
      if (key) originals.set(key, item);
    }
  }
  const map = new Map<string, NewsItem>();
  for (const item of items) {
    const original =
      item.linkKind === "aggregator"
        ? originals.get(googleArticleKey(item.url) || "")
        : undefined;
    const a = original ? { ...original, sources: item.sources } : item;
    const old = map.get(a.url);
    map.set(
      a.url,
      old
        ? {
            ...old,
            author: old.author || a.author,
            ...(a.bodyKeywords?.length
              ? {
                  summary: old.bodyKeywords?.length ? old.summary : a.summary,
                  bodyKeywords: old.bodyKeywords || a.bodyKeywords,
                  rssLinks: [
                    ...new Set([
                      ...(old.rssLinks || []),
                      ...(a.rssLinks || []),
                    ]),
                  ],
                }
              : {}),
            sources: [...new Set([...old.sources, ...a.sources])],
          }
        : a,
    );
  }
  return [...map.values()]
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    .slice(0, 500);
}
async function saved(env: NewsEnv, key: string) {
  if (!env.NEWS_CACHE) throw new Error("新聞保存服務尚未設定");
  return (await env.NEWS_CACHE.get(
    "news:v1:" + key,
    "json",
  )) as NewsFeed | null;
}
export async function collectNews(
  env: NewsEnv,
  q: NewsQuery,
): Promise<NewsFeed> {
  const old = await saved(env, q.key);
  const current = taipeiDate(
    new Date(Date.now() - 30 * 86400000).toISOString(),
  );
  const sourceTimes = new Map<string, string>();
  let supplementalPartial = false;
  const tasks: { name: string; run: () => Promise<NewsItem[]> }[] = [
    {
      name: "Google News RSS",
      run: () => google(q, env, (at) => sourceTimes.set("Google News RSS", at)),
    },
  ];
  if (q.to >= current)
    tasks.unshift({ name: "MediaMonitoring", run: () => monitoring(q, env) });
  if (
    q.to >= current &&
    (q.topicId === "newebpay" ||
      q.issue ||
      (!q.topicId && /藍新|newebpay/i.test(q.query)))
  ) {
    tasks.push({
      name: supplementalSourceName,
      run: async () => {
        const cached = (await env.NEWS_CACHE!.get(
          supplementalCacheKey,
          "json",
        )) as CachedMedia | null;
        if (!cached || !isFreshRSS(cached))
          throw new Error("補充媒體 RSS 尚未更新");
        sourceTimes.set(supplementalSourceName, cached.fetchedAt);
        supplementalPartial = cached.count < supplementalNewsSources.length;
        return matchesQuery(cached.items, q);
      },
    });
  }
  const attempts = await Promise.allSettled(tasks.map((t) => t.run()));
  attempts.forEach((r, i) => {
    if (r.status === "rejected")
      console.warn(
        "news_source_failed",
        tasks[i].name,
        String(r.reason?.message || "unknown").slice(0, 160),
      );
  });
  const fresh = attempts.flatMap((r) =>
    r.status === "fulfilled" ? r.value : [],
  );
  const sources = attempts.map((r, i) => ({
    name: tasks[i].name,
    ok: r.status === "fulfilled",
    updatedAt: sourceTimes.get(tasks[i].name) || new Date().toISOString(),
    ...(r.status === "rejected"
      ? { error: "來源暫時無法更新" }
      : tasks[i].name === supplementalSourceName && supplementalPartial
        ? { error: "部分補充媒體暫時無法更新" }
        : {}),
  }));
  const success = sources.filter((s) => s.ok).length;
  const at = new Date().toISOString();
  const feed: NewsFeed = {
    query: q.query,
    topicId: q.topicId,
    from: q.from,
    to: q.to,
    items: mergeNews([...fresh, ...matchesQuery(old?.items || [], q)]),
    lastAttemptAt: at,
    lastSuccessAt: success
      ? sources
          .filter((s) => s.ok)
          .map((s) => s.updatedAt)
          .sort()
          .at(-1) || at
      : old?.lastSuccessAt || null,
    status: sources.every((s) => s.ok && !s.error)
      ? "ready"
      : success
        ? "partial"
        : "failed",
    sources,
    note: "自動收集比對標題、摘要及可讀取的原站內文。標有「內文命中」的報導已在原文找到關鍵字。各站收錄範圍會影響結果。",
  };
  await env.NEWS_CACHE!.put(
    "news:v1:" + q.key,
    JSON.stringify(feed),
    q.topicId ? undefined : { expirationTtl: 7 * 86400 },
  );
  return feed;
}
export async function loadNews(
  env: NewsEnv,
  q: NewsQuery,
  _waitUntil?: (task: Promise<unknown>) => void,
) {
  const data = await saved(env, q.key);
  if (!data || Date.now() - Date.parse(data.lastAttemptAt) > 30 * 60000)
    return collectNews(env, q);
  return {
    ...data,
    from: q.from,
    to: q.to,
    items: data.items.filter((a) => allowedDate(a.publishedAt, q)),
  };
}
export async function collectTopics(env: NewsEnv) {
  const results = [];
  for (const topic of defaultNewsTopics) {
    try {
      const q = newsQuery(new URL("https://news.invalid/?topic=" + topic.id));
      const feed = await collectNews(env, q);
      results.push({
        topic: topic.id,
        count: feed.items.length,
        status: feed.status,
      });
    } catch {
      results.push({ topic: topic.id, count: 0, status: "failed" });
    }
  }
  return results;
}

export async function ingestRSS(
  env: NewsEnv,
  topicId: string,
  xml: string,
  media?: unknown,
  bodyMatches?: unknown,
  searchQuery?: NewsQuery,
) {
  const q =
    searchQuery ||
    newsQuery(
      new URL("https://news.invalid/?topic=" + encodeURIComponent(topicId)),
    );
  if (!q.topicId && !searchQuery) throw new Error("僅允許更新已建立的新聞查詢");
  const verified = bodyItems(bodyMatches, q);
  const items =
    xml || verified.length
      ? mergeNews([...verified, ...(xml ? parseNewsRSS(xml, q) : [])])
      : null;
  const fetchedAt = new Date().toISOString();
  const mediaItems = new Map<string, NewsItem[]>();
  if (q.topicId === "newebpay" && Array.isArray(media)) {
    for (const entry of media.slice(0, supplementalNewsSources.length)) {
      const source = supplementalNewsSources.find((m) => m.id === entry?.id);
      if (!source || mediaItems.has(source.id) || typeof entry.xml !== "string")
        continue;
      try {
        const official = entry.official === true && !!source.rss;
        mediaItems.set(
          source.id,
          parseNewsRSS(entry.xml, q, { source, official }),
        );
      } catch {
        console.warn("supplemental_rss_invalid", source.id);
      }
    }
  }
  if (!items && !mediaItems.size) throw new Error("來源未提供有效 RSS");
  if (items)
    await env.NEWS_CACHE!.put(
      "rss:v1:" + (q.topicId || q.key),
      JSON.stringify({ items, fetchedAt }),
    );
  if (mediaItems.size) {
    const previous = (await env.NEWS_CACHE!.get(
      supplementalCacheKey,
      "json",
    )) as CachedMedia | null;
    await env.NEWS_CACHE!.put(
      supplementalCacheKey,
      JSON.stringify({
        items: mergeNews([
          ...[...mediaItems.values()].flat(),
          ...matchesQuery(previous?.items || [], q),
        ]),
        count: mediaItems.size,
        fetchedAt,
      } satisfies CachedMedia),
    );
  }
  const feed = searchQuery
    ? {
        query: q.query,
        topicId: q.topicId,
        from: q.from,
        to: q.to,
        items: mergeNews([
          ...(items || []),
          ...matchesQuery((await saved(env, q.key))?.items || [], q),
        ]),
        lastAttemptAt: fetchedAt,
        lastSuccessAt: fetchedAt,
        status: "ready" as const,
        sources: [
          { name: "即時新聞與原文查詢", ok: true, updatedAt: fetchedAt },
        ],
        note: "依本次關鍵字和日期重新搜尋新聞並讀取可公開存取的原文。各站收錄與讀取情況會影響結果。",
      }
    : await collectNews(env, q);
  if (searchQuery)
    await env.NEWS_CACHE!.put("news:v1:" + q.key, JSON.stringify(feed), {
      expirationTtl: 7 * 86400,
    });
  return {
    topic: topicId,
    count: feed.items.length,
    status: feed.status,
    updatedAt: feed.lastSuccessAt,
  };
}
