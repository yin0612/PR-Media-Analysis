import type {
  Database,
  Project,
  Article,
  Body,
  Link,
  Review,
  Metrics,
  Result,
  MessageSet,
  Snapshot,
} from "./types";
export const uid = () => crypto.randomUUID();
export const now = () => new Date().toISOString();
export const emptyDB = (): Database => ({
  schemaVersion: 1,
  projects: [],
  releases: [],
  messageSets: [],
  articles: [],
  bodies: [],
  links: [],
  analyses: [],
  reviews: [],
  reports: [],
  activities: [],
  settings: { apiUrl: "" },
});
export const labels: Record<string, string> = {
  full: "完整採用",
  partial: "部分採用",
  absent: "未採用",
  undetermined: "無法判定",
  pending: "待確認",
  included: "已收錄",
  excluded: "已排除",
  title_only: "僅標題",
  summary_only: "摘要／摘錄",
  failed: "失敗",
  near_release: "近似原稿",
  rewritten: "改寫整理",
  extended_reporting: "延伸採訪",
  not_configured: "AI 未設定",
  running: "分析中",
  completed: "AI 已完成",
  stale: "需重新分析",
};
export const taipeiDate = (v: string) =>
  v ? new Date(v).toLocaleDateString("sv-SE", { timeZone: "Asia/Taipei" }) : "";
export const formatDate = (v: string) =>
  v && !Number.isNaN(Date.parse(v))
    ? new Date(v).toLocaleString("zh-TW", {
        timeZone: "Asia/Taipei",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })
    : "日期待確認";
export function parseDate(v: string): string {
  if (!v.trim()) return "";
  const s = v.trim().replaceAll("/", "-");
  const zoned = /^\d{4}-\d{1,2}-\d{1,2}$/.test(s)
    ? s + "T00:00:00+08:00"
    : /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/.test(s)
      ? s.replace(" ", "T") + (s.length === 16 ? ":00" : "") + "+08:00"
      : s;
  const time = Date.parse(zoned);
  return Number.isNaN(time) ? "" : new Date(time).toISOString();
}
export function defaultPeriod(date: string) {
  const start = new Date(date + "T00:00:00+08:00");
  return {
    start: start.toISOString(),
    end: new Date(+start + 14 * 86400000 - 1).toISOString(),
  };
}
export function canonicalize(raw: string): string {
  if (!raw.trim()) return "";
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    throw new Error("網址格式不正確");
  }
  if (!["http:", "https:"].includes(u.protocol) || u.username || u.password)
    throw new Error("僅接受不含帳密的 HTTP／HTTPS 網址");
  for (const k of [...u.searchParams.keys()])
    if (
      /^utm_/i.test(k) ||
      ["fbclid", "gclid", "msclkid"].includes(k.toLowerCase())
    )
      u.searchParams.delete(k);
  u.hash = "";
  u.searchParams.sort();
  return u.toString();
}
export function log(db: Database, label: string) {
  db.activities.unshift({ id: uid(), at: now(), label });
  db.activities = db.activities.slice(0, 100);
}
export interface ImportRow {
  title: string;
  url: string;
  publisher: string;
  published_at: string;
  summary: string;
  body: string;
  body_status: string;
  original_publisher: string;
  author: string;
  source_channel: string;
}
export function inspectRow(db: Database, row: ImportRow) {
  let canonical = "";
  try {
    canonical = canonicalize(row.url);
  } catch (e) {
    return { kind: "error", reason: (e as Error).message };
  }
  if (!row.title.trim()) return { kind: "error", reason: "缺少標題" };
  if (canonical && db.articles.some((a) => a.canonicalUrl === canonical))
    return { kind: "duplicate", reason: "相同正規化網址；將保留發現管道" };
  const suspect =
    !canonical &&
    db.articles.some(
      (a) =>
        !a.url &&
        a.title === row.title &&
        a.publisher === row.publisher &&
        a.publishedAt === parseDate(row.published_at),
    );
  return {
    kind: suspect ? "suspect" : "new",
    reason: suspect
      ? "缺網址且指紋相似，請確認是否重複"
      : !parseDate(row.published_at)
        ? "日期缺漏／無法辨識，將列待確認"
        : canonical?.includes("news.google.com")
          ? "聚合網址尚待確認原站"
          : "可匯入",
  };
}
export function importRows(
  db: Database,
  projectId: string,
  rows: ImportRow[],
  skipSuspects = true,
) {
  const outcome = { added: 0, updated: 0, skipped: 0, failed: [] as string[] };
  for (const [i, row] of rows.entries()) {
    const check = inspectRow(db, row);
    if (check.kind === "error") {
      outcome.failed.push(`第 ${i + 1} 筆：${check.reason}`);
      continue;
    }
    if (check.kind === "suspect" && skipSuspects) {
      outcome.skipped++;
      continue;
    }
    const canonical = canonicalize(row.url);
    let article = canonical
      ? db.articles.find((a) => a.canonicalUrl === canonical)
      : undefined;
    if (article) {
      const source = row.source_channel || "手動／CSV";
      if (!article.discoverySources.includes(source)) {
        article.discoverySources.push(source);
        article.updatedAt = now();
        outcome.updated++;
      } else outcome.skipped++;
    } else {
      const id = uid();
      const bodyId = uid();
      const stamp = now();
      article = {
        id,
        url: row.url.trim(),
        canonicalUrl: canonical,
        title: row.title.trim(),
        publisher: row.publisher.trim(),
        publisherDomain: canonical
          ? new URL(canonical).hostname.toLowerCase().replace(/^www\./, "")
          : "",
        originalPublisher: row.original_publisher,
        author: row.author,
        publishedAt: parseDate(row.published_at),
        discoverySources: [row.source_channel || "手動／CSV"],
        bodyId,
        createdAt: stamp,
        updatedAt: stamp,
      };
      db.articles.push(article);
      db.bodies.push(
        makeBody(id, bodyId, 1, row.summary, row.body, row.body_status),
      );
      outcome.added++;
    }
    if (
      !db.links.some(
        (l) => l.articleId === article!.id && l.projectId === projectId,
      )
    ) {
      db.links.push({
        id: uid(),
        projectId,
        articleId: article.id,
        inclusionStatus: "pending",
        inclusionReason: "",
        aiRecommendation: "pending",
        aiReason: "AI 尚未執行",
        groupId: "",
        reportType: "undetermined",
        brandRole: "待判定",
        channelType: "媒體原站",
        createdAt: now(),
        updatedAt: now(),
      });
    }
  }
  log(
    db,
    `匯入：新增 ${outcome.added}、更新 ${outcome.updated}、略過 ${outcome.skipped}、失敗 ${outcome.failed.length}`,
  );
  return outcome;
}
export function makeBody(
  articleId: string,
  id: string,
  version: number,
  summary: string,
  body: string,
  status: string,
): Body {
  const bodyStatus =
    body.trim() && status === "full"
      ? "full"
      : body.trim() || summary.trim()
        ? "summary_only"
        : status === "failed"
          ? "failed"
          : "title_only";
  return {
    id,
    articleId,
    version,
    summary,
    body,
    bodyStatus,
    sourceType: "人工確認／匯入",
    paragraphs: body
      .split(/\n\s*\n|\n/)
      .filter((x) => x.trim())
      .map((text, i) => ({ id: `p${i + 1}`, text: text.trim() })),
    createdAt: now(),
  };
}
export function currentReview(
  db: Database,
  p: Project,
  a: Article,
): Review | undefined {
  return [...db.reviews]
    .reverse()
    .find(
      (r) =>
        r.projectId === p.id &&
        r.articleId === a.id &&
        r.bodyId === a.bodyId &&
        r.releaseId === p.releaseId &&
        r.messageSetId === p.messageSetId,
    );
}
export function currentAnalysis(db: Database, p: Project, a: Article) {
  return [...db.analyses]
    .reverse()
    .find(
      (r) =>
        r.projectId === p.id &&
        r.articleId === a.id &&
        r.bodyId === a.bodyId &&
        r.releaseId === p.releaseId &&
        r.messageSetId === p.messageSetId,
    );
}
export function validateResults(
  results: Result[],
  set: MessageSet,
  body: Body,
) {
  if (
    results.length !== set.messages.length ||
    new Set(results.map((r) => r.messageId)).size !== set.messages.length
  )
    throw new Error("每項核心訊息都必須有一項結果");
  for (const m of set.messages) {
    const r = results.find((r) => r.messageId === m.id);
    if (!r || !["full", "partial", "absent", "undetermined"].includes(r.status))
      throw new Error("分析結果結構不完整");
    if (r.messageVersion !== set.version || r.reviewedBodyVersionId !== body.id)
      throw new Error("分析版本不符");
    if (!r.reason?.trim()) throw new Error("請填寫每項判斷的理由");
    if (!Array.isArray(r.evidenceQuotes) || !Array.isArray(r.paragraphIds))
      throw new Error("證據欄位格式不正確");
    if (r.status === "full" || r.status === "partial") {
      if (
        !r.evidenceQuotes.length ||
        r.evidenceQuotes.some((q) => !q.trim() || !body.body.includes(q))
      )
        throw new Error("完整／部分採用必須提供存在於內文的證據原句");
      if (
        !r.paragraphIds.length ||
        r.paragraphIds.some(
          (id) => !body.paragraphs.some((p) => p.id === id),
        ) ||
        r.evidenceQuotes.some(
          (q) =>
            !r.paragraphIds.some((id) =>
              body.paragraphs.find((p) => p.id === id)?.text.includes(q),
            ),
        )
      )
        throw new Error("證據段落不符，請使用單一段落中的原句");
    }
    if (
      r.status === "absent" &&
      (body.bodyStatus !== "full" || r.coverage !== "全文")
    )
      throw new Error("只有確認完整內文且檢視全文後才能判為未採用");
    if (r.status === "undetermined" && !r.undeterminedReason?.trim())
      throw new Error("無法判定時請說明原因");
  }
}
export function metrics(db: Database, p: Project): Metrics {
  const set = db.messageSets.find((s) => s.id === p.messageSetId)!;
  const all = db.links
    .filter((l) => l.projectId === p.id && l.inclusionStatus === "included")
    .map((link) => ({
      link,
      article: db.articles.find((a) => a.id === link.articleId)!,
    }));
  const rows = all.filter(
    ({ article: a }) =>
      a.publishedAt &&
      a.publishedAt >= p.periodStart &&
      a.publishedAt <= p.periodEnd,
  );
  const analyzed = rows.filter(
    ({ article: a }) =>
      db.bodies.find((b) => b.id === a.bodyId)?.bodyStatus === "full" &&
      !!currentReview(db, p, a),
  );
  const messageCounts = (rr: typeof analyzed) =>
    set.messages.map((m) => {
      const res = rr.map(
        ({ article: a }) =>
          currentReview(db, p, a)!.results.find((r) => r.messageId === m.id)
            ?.status || "undetermined",
      );
      return {
        id: m.id,
        text: m.text,
        full: res.filter((s) => s === "full").length,
        partial: res.filter((s) => s === "partial").length,
        absent: res.filter((s) => s === "absent").length,
        undetermined: res.filter((s) => s === "undetermined").length,
      };
    });
  const groupKeys = [
    ...new Set(rows.map((r) => r.link.groupId || r.article.id)),
  ];
  const groupRows = groupKeys
    .map((k) => analyzed.find((r) => (r.link.groupId || r.article.id) === k))
    .filter((r): r is (typeof analyzed)[number] => !!r);
  const media = new Map<string, number>();
  const dates = new Map<string, number>();
  for (const { article: a } of rows) {
    const name =
      a.publisherDomain ||
      a.publisher.trim().toLowerCase() ||
      `未識別網站 ${a.id.slice(0, 6)}`;
    media.set(name, (media.get(name) || 0) + 1);
    const day = taipeiDate(a.publishedAt);
    dates.set(day, (dates.get(day) || 0) + 1);
  }
  const oldReview = ({ article: a }: (typeof rows)[number]) =>
    db.reviews.some((r) => r.projectId === p.id && r.articleId === a.id) &&
    !currentReview(db, p, a);
  const quotes = analyzed.map(
    ({ article: a }) => currentReview(db, p, a)!.quoteAdoption,
  );
  return {
    N: rows.length,
    B: analyzed.length,
    websites: media.size,
    originalPublishers: new Set(
      rows.map((r) => r.article.originalPublisher).filter(Boolean),
    ).size,
    groups: groupKeys.length,
    groupB: groupRows.length,
    groupPending: groupKeys.length - groupRows.length,
    messages: messageCounts(analyzed),
    groupMessages: messageCounts(groupRows),
    titleBrand: rows.filter(
      (r) =>
        r.article.title &&
        [p.brand, ...p.brandAliases]
          .filter(Boolean)
          .some((b) =>
            r.article.title.toLocaleLowerCase().includes(b.toLocaleLowerCase()),
          ),
    ).length,
    titleDenominator: rows.filter((r) => r.article.title.trim()).length,
    quote: quotes.filter((q) => ["exact", "paraphrase", "both"].includes(q))
      .length,
    quoteExact: quotes.filter((q) => q === "exact").length,
    quoteParaphrase: quotes.filter((q) => q === "paraphrase").length,
    quoteBoth: quotes.filter((q) => q === "both").length,
    missingBody: rows.filter(
      (r) =>
        db.bodies.find((b) => b.id === r.article.bodyId)?.bodyStatus !== "full",
    ).length,
    pendingAnalysis: rows.filter(
      (r) =>
        db.bodies.find((b) => b.id === r.article.bodyId)?.bodyStatus ===
          "full" &&
        !currentReview(db, p, r.article) &&
        currentAnalysis(db, p, r.article)?.runStatus !== "completed",
    ).length,
    pendingReview: rows.filter(
      (r) =>
        db.bodies.find((b) => b.id === r.article.bodyId)?.bodyStatus ===
          "full" && !currentReview(db, p, r.article),
    ).length,
    stale: rows.filter(oldReview).length,
    missingDate: all.filter((r) => !r.article.publishedAt).length,
    discrepancies: analyzed.filter((r) =>
      currentReview(db, p, r.article)!.discrepancies.some((d) =>
        ["確認需處理", "處理中"].includes(d.status),
      ),
    ).length,
    types: rows.reduce<Record<string, number>>((acc, r) => {
      acc[r.link.reportType] = (acc[r.link.reportType] || 0) + 1;
      return acc;
    }, {}),
    trend: [...dates].sort().map(([date, count]) => ({ date, count })),
    media: [...media]
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count })),
  };
}
export const ratio = (n: number, d: number) =>
  d ? `${Math.round((n / d) * 1000) / 10}%` : "尚無足夠資料";
export function createSnapshot(
  db: Database,
  p: Project,
  summary: string,
): Snapshot {
  const rows = db.links
    .filter((l) => l.projectId === p.id && l.inclusionStatus === "included")
    .map((link) => ({
      link,
      article: db.articles.find((a) => a.id === link.articleId)!,
    }))
    .filter(
      ({ article: a }) =>
        a.publishedAt &&
        a.publishedAt >= p.periodStart &&
        a.publishedAt <= p.periodEnd,
    )
    .map(({ link, article }) => ({
      link,
      article,
      body: db.bodies.find((b) => b.id === article.bodyId),
      review: currentReview(db, p, article),
      analysis: currentAnalysis(db, p, article),
    }));
  return structuredClone({
    id: uid(),
    projectId: p.id,
    project: p,
    release: db.releases.find((r) => r.id === p.releaseId)!,
    messageSet: db.messageSets.find((s) => s.id === p.messageSetId)!,
    createdAt: now(),
    cutoffAt: now(),
    period: { start: p.periodStart, end: p.periodEnd },
    definitionVersion: "1.0-reviewed-full-taipei",
    frozenRows: rows,
    frozenMetrics: metrics(db, p),
    summary,
    sourceVersionIds: [
      p.releaseId,
      p.messageSetId,
      ...rows.map((r) => r.article.bodyId),
      ...rows.flatMap((r) => (r.review ? [r.review.id] : [])),
    ],
  });
}
export function validateBackup(value: unknown): Database {
  const d = value as Database;
  if (
    !d ||
    d.schemaVersion !== 1 ||
    !d.settings ||
    typeof d.settings.apiUrl !== "string"
  )
    throw new Error("不支援的備份格式");
  for (const k of [
    "projects",
    "releases",
    "messageSets",
    "articles",
    "bodies",
    "links",
    "analyses",
    "reviews",
    "reports",
    "activities",
  ] as const) {
    if (!Array.isArray(d[k])) throw new Error(`備份缺少 ${k}`);
    if (
      d[k].some((x) => !x || typeof x.id !== "string") ||
      new Set(d[k].map((x) => x.id)).size !== d[k].length
    )
      throw new Error(`備份 ${k} 識別碼無效`);
  }
  for (const p of d.projects) {
    if (
      !d.releases.some((r) => r.id === p.releaseId && r.projectId === p.id) ||
      !d.messageSets.some(
        (s) => s.id === p.messageSetId && s.projectId === p.id,
      )
    )
      throw new Error("備份的專案版本關聯不完整");
  }
  for (const a of d.articles) {
    if (!d.bodies.some((b) => b.id === a.bodyId && b.articleId === a.id))
      throw new Error("備份的報導內文關聯不完整");
  }
  for (const l of d.links) {
    if (
      !d.projects.some((p) => p.id === l.projectId) ||
      !d.articles.some((a) => a.id === l.articleId)
    )
      throw new Error("備份的報導關聯不完整");
  }
  return d;
}
