import { ingestRSS, newsQuery } from "./news";
import type { NewsEnv, NewsQuery } from "./news";
import type { NewsFeed } from "../src/news-types";

export interface SearchEnv extends NewsEnv {
  NEWS_DISPATCH_TOKEN?: string;
}

interface SearchJob {
  id: string;
  query: NewsQuery;
  status: "queued" | "running" | "complete" | "failed";
  createdAt: string;
  updatedAt: string;
  error?: string;
  feed?: NewsFeed;
}

const jobPrefix = "search:v1:";
const lifetime = 86400;

async function save(env: SearchEnv, job: SearchJob) {
  await env.NEWS_CACHE!.put(jobPrefix + job.id, JSON.stringify(job), {
    expirationTtl: lifetime,
  });
}

export async function searchStatus(
  env: SearchEnv,
  id: string,
): Promise<SearchJob> {
  if (!/^[a-f0-9]{64}$/.test(id)) throw new Error("查詢編號不正確");
  const job = (await env.NEWS_CACHE!.get(
    jobPrefix + id,
    "json",
  )) as SearchJob | null;
  if (!job) throw new Error("查詢已過期，請重新搜尋");
  if (
    ["queued", "running"].includes(job.status) &&
    Date.now() - Date.parse(job.createdAt) > 10 * 60000
  ) {
    return {
      ...job,
      status: "failed",
      error: "新聞收集等候逾時，請按更新清單重試。",
    };
  }
  return job;
}

export async function startSearch(env: SearchEnv, input: unknown) {
  if (!env.NEWS_CACHE || !env.NEWS_DISPATCH_TOKEN)
    throw new Error("即時新聞收集服務尚未設定");
  if (!input || typeof input !== "object") throw new Error("搜尋條件不正確");
  const value = input as Record<string, unknown>;
  const url = new URL("https://news.invalid/");
  for (const name of ["topic", "issue", "q", "from", "to"])
    if (typeof value[name] === "string")
      url.searchParams.set(name, value[name]);
  if (
    !url.searchParams.has("topic") &&
    !url.searchParams.has("issue") &&
    !url.searchParams.has("q")
  )
    throw new Error("請輸入議題或新聞關鍵字");
  const query = newsQuery(url);
  const bucket = Math.floor(Date.now() / (5 * 60000));
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(query.key + ":" + bucket),
  );
  const id = Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
  const existing = (await env.NEWS_CACHE.get(
    jobPrefix + id,
    "json",
  )) as SearchJob | null;
  if (existing && existing.status !== "failed") return existing;
  const at = new Date().toISOString();
  const job: SearchJob = {
    id,
    query,
    createdAt: at,
    updatedAt: at,
    status: "queued",
  };
  await save(env, job);
  try {
    const response = await fetch(
      "https://api.github.com/repos/yin0612/PR-Media-Analysis/actions/workflows/update-news.yml/dispatches",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer " + env.NEWS_DISPATCH_TOKEN,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "PRMediaNewsCollector",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ref: "main",
          inputs: {
            search_id: id,
            search_json: JSON.stringify({
              ...(query.topicId
                ? { topic: query.topicId }
                : query.issue
                  ? { issue: query.issue }
                  : { q: query.query }),
              from: query.from,
              to: query.to,
            }),
          },
        }),
        signal: AbortSignal.timeout(15000),
      },
    );
    if (!response.ok) throw new Error("DISPATCH_" + response.status);
  } catch {
    job.status = "failed";
    job.error = "新聞收集暫時無法啟動，請稍後重試。";
    await save(env, job);
  }
  return job;
}

export async function updateSearch(
  env: SearchEnv,
  input: Record<string, unknown>,
) {
  const job = await searchStatus(env, String(input.searchId || ""));
  if (job.status === "complete") return job;
  job.updatedAt = new Date().toISOString();
  if (input.stage === "running") {
    job.status = "running";
  } else if (input.stage === "failed") {
    job.status = "failed";
    job.error = "部分新聞來源暫時無法讀取，請稍後重新搜尋。";
  } else if (input.stage === "complete") {
    const result = await ingestRSS(
      env,
      "",
      String(input.xml || ""),
      [],
      input.bodyMatches,
      job.query,
    );
    const feed = (await env.NEWS_CACHE!.get(
      "news:v1:" + job.query.key,
      "json",
    )) as NewsFeed;
    if (!feed || result.status === "failed")
      throw new Error("新聞結果未完成收集");
    job.status = "complete";
    job.feed = feed;
  } else throw new Error("收集狀態不正確");
  await save(env, job);
  return job;
}
