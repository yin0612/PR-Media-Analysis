import type { Database, Project, Article } from "./types";
import {
  defaultPeriod,
  importRows,
  now,
  parseDate,
  taipeiDate,
  uid,
} from "./domain";
import type { ImportRow } from "./domain";
export interface ExposureSheet {
  name: string;
  title: string;
  rows: ImportRow[];
}
export function excelText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  )
    return String(value);
  if (typeof value === "object") {
    const v = value as {
      richText?: { text: unknown }[];
      text?: unknown;
      result?: unknown;
    };
    if (Array.isArray(v.richText))
      return v.richText.map((t) => excelText(t.text)).join("");
    if (v.text !== undefined) return excelText(v.text);
    if (v.result !== undefined) return excelText(v.result);
  }
  return "";
}
export function createList(
  db: Database,
  name: string,
  dates: string[] = [],
): Project {
  const date = dates.map(parseDate).filter(Boolean).sort()[0] || now();
  const period = defaultPeriod(taipeiDate(date));
  const last = dates.map(parseDate).filter(Boolean).sort().at(-1);
  const id = uid(),
    releaseId = uid(),
    messageSetId = uid();
  const p: Project = {
    id,
    name,
    brand: "",
    brandAliases: [],
    product: "",
    partners: "",
    releaseAt: date,
    periodStart: period.start,
    periodEnd:
      last && last > period.end
        ? defaultPeriod(taipeiDate(last)).end
        : period.end,
    timezone: "Asia/Taipei",
    status: "active",
    releaseId,
    messageSetId,
    searchTerms: "",
    excludeTerms: "",
    trackedMedia: [],
    quote: "",
    createdAt: now(),
    updatedAt: now(),
  };
  db.projects.push(p);
  db.releases.push({
    id: releaseId,
    projectId: id,
    version: 1,
    title: name,
    body: "",
    createdAt: now(),
  });
  db.messageSets.push({
    id: messageSetId,
    projectId: id,
    version: 1,
    messages: [],
    createdAt: now(),
  });
  return p;
}
export function addToList(db: Database, projectId: string, rows: ImportRow[]) {
  const old = new Set(db.links.map((l) => l.id));
  const result = importRows(db, projectId, rows);
  for (const l of db.links) {
    if (l.projectId === projectId && !old.has(l.id)) {
      l.inclusionStatus = "included";
      l.inclusionReason = "使用者加入新聞露出清單";
    }
  }
  return result;
}
export function listRows(db: Database, projectId: string): Article[] {
  return db.links
    .filter(
      (l) => l.projectId === projectId && l.inclusionStatus !== "excluded",
    )
    .map((l) => db.articles.find((a) => a.id === l.articleId)!)
    .sort((a, b) =>
      (a.publishedAt || "9999").localeCompare(b.publishedAt || "9999"),
    );
}
export function blankRow(): ImportRow {
  return {
    title: "",
    url: "",
    publisher: "",
    published_at: "",
    summary: "",
    body: "",
    body_status: "title_only",
    original_publisher: "",
    author: "",
    source_channel: "露出清單",
  };
}
export async function readExposureExcel(
  buffer: ArrayBuffer,
): Promise<ExposureSheet[]> {
  const { Workbook } = await import("exceljs");
  const book = new Workbook();
  await book.xlsx.load(buffer as Parameters<typeof book.xlsx.load>[0]);
  return book.worksheets.map((sheet) => {
    let header = 0;
    const columns: Record<string, number> = {};
    sheet.eachRow((row, n) => {
      if (header || n > 30) return;
      const found: Record<string, number> = {};
      row.eachCell((cell, c) => {
        const text = excelText(cell.value).trim();
        if (["標題", "新聞標題"].includes(text)) found.title = c;
        if (["媒體", "媒體名稱"].includes(text)) found.publisher = c;
        if (["日期", "刊登日期", "發布時間"].includes(text))
          found.published_at = c;
        if (["記者", "作者", "記者／作者"].includes(text)) found.author = c;
        if (["網址", "連結", "新聞連結"].includes(text)) found.url = c;
      });
      if (found.title && found.publisher) {
        header = n;
        Object.assign(columns, found);
      }
    });
    const rows: ImportRow[] = [];
    if (header)
      sheet.eachRow((row, n) => {
        if (n <= header) return;
        const title = row.getCell(columns.title);
        const titleText = excelText(title.value).trim();
        const publisherText = excelText(
          row.getCell(columns.publisher).value,
        ).trim();
        if (
          !titleText ||
          ["標題", "新聞標題"].includes(titleText) ||
          (!publisherText && /^\d+$/.test(titleText))
        )
          return;
        const date = columns.published_at
          ? row.getCell(columns.published_at)
          : null;
        const dateText =
          date?.value instanceof Date
            ? date.value.toISOString().slice(0, 10)
            : excelText(date?.value);
        const value = title.value;
        const hyperlink =
          value && typeof value === "object" && "hyperlink" in value
            ? String(value.hyperlink)
            : "";
        const url = columns.url
          ? excelText(row.getCell(columns.url).value)
          : hyperlink;
        rows.push({
          ...blankRow(),
          title: titleText,
          publisher: publisherText,
          published_at: dateText,
          author: columns.author
            ? excelText(row.getCell(columns.author).value).trim()
            : "",
          url,
          source_channel: `Excel／${sheet.name}`,
        });
      });
    return {
      name: sheet.name,
      title: excelText(sheet.getCell("A1").value).trim() || sheet.name,
      rows,
    };
  });
}
