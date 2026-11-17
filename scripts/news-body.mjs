import { lookup } from "node:dns/promises";
import { load } from "cheerio";
import { XMLParser } from "fast-xml-parser";
import robotsParser from "robots-parser";
import { agentCommerce, newsKeywords } from "../src/news-keywords.ts";
import { publicIP, readLimited } from "../worker/security.ts";

const bot = "PRMediaNewsCollector";
const google = "https://news.google.com";
const taiwan = { hl: "zh-TW", gl: "TW", ceid: "TW:zh-Hant" };
const parser = new XMLParser({ ignoreAttributes: false, parseTagValue: false });
const clean = (text) =>
  String(text ?? "")
    .replace(/\s+/g, " ")
    .trim();
const groups = (value) => (Array.isArray(value) ? value : value ? [value] : []);
const hostname = (url) => url.hostname.replace(/^www\./, "");

export async function inBatches(items, size, run) {
  const results = [];
  for (let i = 0; i < items.length; i += size)
    results.push(...(await Promise.all(items.slice(i, i + size).map(run))));
  return results;
}

function request(url, options = {}) {
  return fetch(url, {
    headers: { "User-Agent": bot + "/1.0" },
    redirect: "manual",
    signal: AbortSignal.timeout(6000),
    ...options,
  });
}

function publicURL(raw) {
  const url = new URL(raw);
  if (url.protocol !== "https:" || url.username || url.password || url.port)
    throw new Error("Invalid publisher URL");
  url.hash = "";
  return url;
}

async function publisherURL(link, hosts) {
  const url = publicURL(link);
  if (url.origin !== google) return url;
  const id = url.pathname.match(/^\/rss\/articles\/([A-Za-z0-9_-]+)$/)?.[1];
  if (!id) throw new Error("Unknown Google News link");
  url.search = new URLSearchParams(taiwan).toString();
  const page = await request(url);
  const location = page.headers.get("location");
  if (page.status >= 300 && page.status < 400 && location)
    return publicURL(new URL(location, url));
  if (!page.ok) throw new Error("Google News article unavailable");
  const html = await readLimited(page, 1_500_000);
  const time = html.match(/data-n-a-ts="(\d+)"/)?.[1];
  const signature = html.match(/data-n-a-sg="([\w-]+)"/)?.[1];
  if (!time || !signature)
    throw new Error("Google News article ID unavailable");
  // Google News uses this request to open the source link in the browser.
  const context = [
    [
      "X",
      "X",
      ["X", "X"],
      null,
      null,
      1,
      1,
      taiwan.ceid,
      null,
      1,
      null,
      null,
      null,
      null,
      null,
      0,
      1,
    ],
    "X",
    "X",
    1,
    [1, 1, 1],
    1,
    1,
    null,
    0,
    0,
    null,
    0,
  ];
  const payload = JSON.stringify([
    "garturlreq",
    context,
    id,
    Number(time),
    signature,
  ]);
  const endpoint = new URL("/_/DotsSplashUi/data/batchexecute", google);
  endpoint.search = new URLSearchParams({
    ...taiwan,
    rpcids: "Fbv4je",
  }).toString();
  const response = await request(endpoint, {
    method: "POST",
    body: new URLSearchParams({
      "f.req": JSON.stringify([[["Fbv4je", payload, null, "generic"]]]),
    }),
  });
  if (!response.ok) throw new Error("Google News publisher link unavailable");
  const frames = await readLimited(response, 50_000);
  for (const line of frames
    .split("\n")
    .filter((line) => line.startsWith("[["))) {
    const frame = JSON.parse(line).find((part) => part[1] === "Fbv4je");
    const result = typeof frame?.[2] === "string" ? JSON.parse(frame[2]) : [];
    if (result[0] === "garturlres" && typeof result[1] === "string") {
      const resolved = publicURL(result[1]);
      if (hosts.has(hostname(resolved))) return resolved;
    }
  }
  throw new Error("Google News publisher domain did not match");
}

function canRead(url, policies) {
  let policy = policies.get(url.origin);
  if (!policy) {
    policy = (async () => {
      const addresses = await lookup(url.hostname, { all: true });
      if (
        !addresses.length ||
        addresses.some(({ address }) => !publicIP(address))
      )
        throw new Error("Publisher does not resolve to a public address");
      const file = new URL("/robots.txt", url);
      const response = await request(file);
      if (response.status === 404 || response.status === 410)
        return robotsParser(file.href, "");
      if (!response.ok) throw new Error("Publisher robots policy unavailable");
      return robotsParser(file.href, await readLimited(response, 100_000));
    })();
    policies.set(url.origin, policy);
  }
  return policy.then((rules) => rules.isAllowed(url.href, bot) === true);
}

async function readArticle(url, hosts, policies) {
  for (let hops = 0; hops < 3; hops++) {
    if (!hosts.has(hostname(url)) || !(await canRead(url, policies)))
      return null;
    const r = await request(url);
    if (r.status >= 300 && r.status < 400 && r.headers.has("location")) {
      url = publicURL(new URL(r.headers.get("location"), url));
      continue;
    }
    if (!r.ok || !/text\/html/i.test(r.headers.get("content-type") || ""))
      return null;
    const article = parseArticle(await readLimited(r, 2_000_000));
    if (article.canonical) {
      try {
        const canonical = publicURL(new URL(article.canonical, url));
        if (hostname(canonical) === hostname(url)) url = canonical;
      } catch {
        // Keep the publisher URL when its canonical value is invalid.
      }
    }
    return { url, article };
  }
  return null;
}

export function parseArticle(html) {
  const $ = load(html);
  const records = $('script[type="application/ld+json"]')
    .toArray()
    .flatMap((node) => {
      try {
        return groups(JSON.parse($(node).text())).flatMap((item) => [
          item,
          ...groups(item?.["@graph"]),
        ]);
      } catch {
        return [];
      }
    });
  const metadata = records.find((item) =>
    groups(item?.["@type"]).some((type) => /article$/i.test(String(type))),
  );
  const author = groups(metadata?.author)
    .map((entry) => (typeof entry === "string" ? entry : entry?.name))
    .filter((name) => typeof name === "string")
    .join("、");
  let body =
    typeof metadata?.articleBody === "string"
      ? clean(load(metadata.articleBody, null, false).text())
      : "";
  if (!body) {
    $(
      "script, style, nav, header, footer, aside, form, figure, .related-news",
    ).remove();
    const container = $(
      '[itemprop="articleBody"], #newsContent, .article-body, .article-content',
    ).first();
    body = clean(
      container.length
        ? container.text()
        : $("article p")
            .toArray()
            .map((p) => $(p).text())
            .join(" "),
    );
  }
  return {
    body,
    author,
    date:
      metadata?.datePublished ||
      $('meta[property="article:published_time"]').attr("content"),
    canonical: $('link[rel="canonical"]').attr("href"),
  };
}

function candidates(feed, topic) {
  if (/<!DOCTYPE|<!ENTITY/i.test(feed.xml)) return [];
  const rows = groups(parser.parse(feed.xml)?.rss?.channel?.item);
  const seen = new Set();
  return rows
    .flatMap((row) => {
      const title = clean(row.title);
      const date = Date.parse(row.pubDate);
      if (
        !title ||
        title.includes("藍新資訊") ||
        !Number.isFinite(date) ||
        date < Date.parse(topic.from) - 8 * 3600000 ||
        date >= Date.parse(topic.to) + 16 * 3600000 ||
        seen.has(title)
      )
        return [];
      seen.add(title);
      const hosts = new Set();
      const scope = feed.site?.split("/")[0];
      try {
        for (const raw of [
          row.source?.["@_url"] || "",
          scope ? "https://" + scope : "",
        ]) {
          if (raw) hosts.add(hostname(publicURL(raw)));
        }
        if (feed.official) hosts.add(hostname(publicURL(row.link)));
        if (!hosts.size) return [];
      } catch {
        return [];
      }
      const publisher = clean(row.source?.["#text"] || row.source);
      const headline =
        publisher && title.endsWith(" - " + publisher)
          ? title.slice(0, -publisher.length - 3)
          : title;
      const topicHeading =
        /ai.{0,8}(導購|購物)|代理式|萬事達卡|mastercard|buytalk agent/i.test(
          headline,
        );
      const score = newsKeywords(
        headline,
        topic.id,
        topic.query,
        topic.issue,
        topic.issueAliases,
      ).length
        ? topicHeading
          ? 3
          : 1
        : topicHeading
          ? 4
          : 0;
      return [
        {
          title: headline,
          link: row.link,
          date: row.pubDate,
          publisher: feed.name || publisher,
          hosts,
          score,
        },
      ];
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, feed.site ? 4 : 8);
}

export function keywordExcerpt(body, topic) {
  const normalized = body.normalize("NFKC");
  const words = newsKeywords(
    normalized,
    topic.id,
    topic.query,
    topic.issue,
    topic.issueAliases,
  );
  if (!words.length) return "";
  const positions = words.map((word) =>
    normalized.toLowerCase().indexOf(word.toLowerCase()),
  );
  if (topic.id === "newebpay" && words.includes("藍新"))
    positions.push(normalized.search(agentCommerce));
  return [...new Set(positions)]
    .sort((a, b) => a - b)
    .map((position) =>
      normalized.slice(Math.max(0, position - 10), position + 30),
    )
    .join(" … ")
    .slice(0, 400);
}

export async function collectBodyMatches(topic, feeds) {
  const valid = feeds.flatMap((feed) => {
    try {
      return candidates(feed, topic);
    } catch {
      return [];
    }
  });
  const unique = [
    ...new Map(valid.map((candidate) => [candidate.link, candidate])).values(),
  ]
    .sort((a, b) => b.score - a.score)
    .slice(0, 60);
  const policies = new Map();
  const found = [];
  let readable = 0;
  // Keep simultaneous requests to the same publisher low as RSS feeds overlap.
  await inBatches(unique, 5, async (candidate) => {
    try {
      const original = await publisherURL(candidate.link, candidate.hosts);
      const result = await readArticle(original, candidate.hosts, policies);
      if (!result?.article.body) return;
      readable++;
      const summary = keywordExcerpt(result.article.body, topic);
      if (summary)
        found.push({
          title: candidate.title,
          url: result.url.href,
          rssLink: candidate.link,
          publisher: candidate.publisher,
          date: Number.isFinite(Date.parse(result.article.date))
            ? result.article.date
            : candidate.date,
          author: result.article.author,
          summary,
        });
    } catch {
      // An inaccessible publisher or unavailable redirect leaves its RSS result intact.
    }
  });
  return { matches: found, checked: unique.length, readable };
}
