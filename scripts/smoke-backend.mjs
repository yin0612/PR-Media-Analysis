import { readFileSync, writeFileSync } from "node:fs";
const base =
  "https://pr-media-analysis-api.media-monitoring-worker.workers.dev";
const token = readFileSync(".local/Cloudflare服務存取碼.txt", "utf8").split(
  /\r?\n/,
)[0];
async function request(path, payload, authorized = true) {
  const res = await fetch(base + path, {
    method: payload ? "POST" : "GET",
    headers: {
      ...(payload ? { "Content-Type": "application/json" } : {}),
      ...(authorized ? { Authorization: "Bearer " + token } : {}),
    },
    body: payload ? JSON.stringify(payload) : undefined,
    signal: AbortSignal.timeout(100000),
  });
  const data = await res.json();
  return { status: res.status, data };
}
console.log("Health:", JSON.stringify(await request("/api/health")));
console.log(
  "Unauthorized API status:",
  (await request("/api/analyses", {}, false)).status,
);
console.log("Session:", JSON.stringify(await request("/api/session", {})));
const project = {
  id: "smoke-project",
  name: "功能驗證（示意）",
  brand: "示意品牌",
  product: "免卡服務",
  releaseId: "release1",
  messageSetId: "set1",
  quote: "",
};
const release = {
  id: "release1",
  projectId: project.id,
  title: "示意品牌推出免卡申請",
  body: "示意品牌推出免卡申請服務。使用者不需要實體卡即可申請。",
};
const body = {
  id: "body1",
  articleId: "article1",
  bodyStatus: "full",
  body: "示意品牌推出免卡申請服務。使用者不需要實體卡即可申請。",
  paragraphs: [
    {
      id: "p1",
      text: "示意品牌推出免卡申請服務。使用者不需要實體卡即可申請。",
    },
  ],
};
const messageSet = {
  id: "set1",
  projectId: project.id,
  version: 1,
  messages: [
    {
      id: "message1",
      text: "不需要實體卡即可申請",
      requiredConditions: "無須實體卡",
      synonyms: "免卡申請",
      exactFacts: "",
    },
  ],
};
const output = await request("/api/analyses", {
  project,
  release,
  messageSet,
  body,
  article: {
    id: "article1",
    title: release.title,
    url: "https://example.com/demo",
    publishedAt: "2026-11-10T02:00:00Z",
  },
});
writeFileSync(".local/backend-smoke.json", JSON.stringify(output, null, 2));
console.log(
  "Real AI smoke:",
  JSON.stringify({
    status: output.status,
    runStatus: output.data.runStatus,
    model: output.data.modelVersion,
    results: output.data.results?.map((r) => ({
      status: r.status,
      evidenceQuotes: r.evidenceQuotes,
    })),
    error: output.data.error,
  }),
);
if (output.status !== 200 || output.data.runStatus !== "completed")
  process.exitCode = 1;
