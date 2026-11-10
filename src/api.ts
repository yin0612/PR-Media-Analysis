import type {
  Project,
  Release,
  MessageSet,
  Body,
  Analysis,
  Snapshot,
} from "./types";
export async function request<T>(
  base: string,
  token: string,
  path: string,
  payload?: unknown,
): Promise<T> {
  if (!base) throw new Error("請先設定 Cloudflare 後端網址");
  const u = new URL(base);
  if (
    u.protocol !== "https:" &&
    !["localhost", "127.0.0.1"].includes(u.hostname)
  )
    throw new Error("後端必須使用 HTTPS");
  const response = await fetch(base.replace(/\/$/, "") + path, {
    method: payload ? "POST" : "GET",
    headers: {
      ...(payload ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: payload ? JSON.stringify(payload) : undefined,
    signal: AbortSignal.timeout(90000),
    credentials: "omit",
  });
  const json = await response
    .json()
    .catch(() => ({ error: "服務未回傳 JSON，請檢查後端網址及登入設定" }));
  if (!response.ok)
    throw new Error(json.error || `服務暫時無法使用（${response.status}）`);
  return json as T;
}
export type AnalysisPayload = {
  project: Project;
  release: Release;
  messageSet: MessageSet;
  body: Body;
  article: { id: string; title: string; url: string; publishedAt: string };
};
export const analyze = (
  base: string,
  token: string,
  payload: AnalysisPayload,
) => request<Analysis>(base, token, "/api/analyses", payload);
export const summarize = (base: string, token: string, snapshot: Snapshot) =>
  request<{ summary: string }>(base, token, "/api/report-summaries", {
    snapshot,
  });
