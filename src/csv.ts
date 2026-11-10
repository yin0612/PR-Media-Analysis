import Papa from "papaparse";
import type { ImportRow } from "./domain";
export const fields: (keyof ImportRow)[] = [
  "title",
  "url",
  "publisher",
  "published_at",
  "summary",
  "body",
  "body_status",
  "original_publisher",
  "author",
  "source_channel",
];
export const fieldLabels: Record<keyof ImportRow, string> = {
  title: "標題（必填）",
  url: "網址",
  publisher: "媒體",
  published_at: "發布時間",
  summary: "摘要",
  body: "內文",
  body_status: "內文狀態",
  original_publisher: "原始供稿媒體",
  author: "作者",
  source_channel: "發現管道",
};
const aliases: Record<string, string> = {
  標題: "title",
  新聞標題: "title",
  網址: "url",
  連結: "url",
  媒體: "publisher",
  發布時間: "published_at",
  日期: "published_at",
  刊登日期: "published_at",
  摘要: "summary",
  內文: "body",
  全文: "body",
  內文狀態: "body_status",
  原始供稿媒體: "original_publisher",
  作者: "author",
  記者: "author",
  發現管道: "source_channel",
};
export function readCSV(text: string) {
  const parsed = Papa.parse<Record<string, string>>(
    text.replace(/^\uFEFF/, ""),
    {
      header: true,
      skipEmptyLines: "greedy",
      transformHeader: (h) => h.trim(),
    },
  );
  if (parsed.errors.some((e) => e.type === "Quotes" || e.type === "Delimiter"))
    throw new Error(parsed.errors.map((e) => e.message).join("；"));
  const headers = parsed.meta.fields || [];
  const mapping = Object.fromEntries(
    fields.map((f) => [
      f,
      headers.find((h) => h === f || aliases[h] === f) || "",
    ]),
  ) as Record<keyof ImportRow, string>;
  return {
    headers,
    raw: parsed.data,
    mapping,
    errors: parsed.errors.map((e) => `第 ${(e.row ?? 0) + 2} 行：${e.message}`),
  };
}
export function mapRows(
  raw: Record<string, string>[],
  mapping: Record<keyof ImportRow, string>,
): ImportRow[] {
  return raw.map(
    (row) =>
      Object.fromEntries(
        fields.map((f) => [f, String(row[mapping[f]] ?? "")]),
      ) as unknown as ImportRow,
  );
}
