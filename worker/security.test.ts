import { it, expect } from "vitest";
import { publicIP, publicUrl } from "./security";
import worker from "./index";
it("阻擋內網、回環、metadata、IP與重新導向未授權網域", () => {
  for (const u of [
    "http://localhost/",
    "http://127.0.0.1/",
    "http://169.254.169.254/",
    "http://10.0.0.1/",
    "http://[::1]/",
    "https://metadata.google.internal/",
    "https://example.com:8080/",
    "https://user:pass@example.com/",
    "https://other.example.com/",
  ])
    expect(() => publicUrl(u, "example.com")).toThrow();
  expect(publicUrl("https://example.com/news", "example.com").hostname).toBe(
    "example.com",
  );
  for (const ip of [
    "10.0.0.1",
    "127.0.0.1",
    "169.254.169.254",
    "192.168.1.1",
    "100.64.0.1",
    "::1",
    "fd00::1",
    "fe80::1",
  ])
    expect(publicIP(ip)).toBe(false);
  expect(publicIP("1.1.1.1")).toBe(true);
});
const env = {
  ALLOWED_ORIGINS: "https://yin0612.github.io",
  ALLOWED_EMAILS: "",
  ACCESS_TEAM_DOMAIN: "",
  ACCESS_AUD: "",
  SERVICE_ACCESS_KEY: "test-access-code",
  AI_MODEL: "test",
  AI_API_BASE: "https://api.openai.com/v1",
  EXTRACT_ALLOWED_HOSTS: "example.com",
  RATE_LIMITER: { limit: async () => ({ success: true }) },
};
it("沒有憑證的使用者無法呼叫 AI 或擷取", async () => {
  for (const path of [
    "/api/analyses",
    "/api/articles/extract",
    "/api/report-summaries",
  ]) {
    const r = await worker.fetch(
      new Request("https://api.example.com" + path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      }),
      env,
    );
    expect(r.status).toBe(401);
  }
});
it("後端驗證存取碼，阻擋錯誤來源", async () => {
  const request = (origin: string, code: string) =>
    new Request("https://api.example.com/api/session", {
      method: "POST",
      headers: {
        Origin: origin,
        Authorization: "Bearer " + code,
        "Content-Type": "application/json",
      },
      body: "{}",
    });
  expect(
    (
      await worker.fetch(
        request("https://evil.example", "test-access-code"),
        env,
      )
    ).status,
  ).toBe(403);
  expect(
    (await worker.fetch(request("https://yin0612.github.io", "wrong"), env))
      .status,
  ).toBe(401);
  expect(
    (
      await worker.fetch(
        request("https://yin0612.github.io", "test-access-code"),
        env,
      )
    ).status,
  ).toBe(200);
});
it("無 AI 綁定時回傳未設定；不偽造分析", async () => {
  const r = await worker.fetch(
    new Request("https://api.example.com/api/key-messages/suggest", {
      method: "POST",
      headers: {
        Authorization: "Bearer test-access-code",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ release: { body: "示意新聞稿" } }),
    }),
    env,
  );
  expect(r.status).toBe(503);
});
