import { useEffect, useRef, useState } from "react";
import {
  Download,
  FileSpreadsheet,
  RefreshCw,
  Search,
  ExternalLink,
  ArrowRight,
  Bookmark,
} from "lucide-react";
import { defaultNewsTopics } from "./news-types";
import type { NewsFeed } from "./news-types";
import { cleanNewsIssue } from "./news-keywords";
import { request } from "./api";
import { download } from "./export";
import { formatDate, taipeiDate } from "./domain";

type NewsSearch =
  | { topic: string }
  | { issue: string; from: string; to: string }
  | { q: string; from: string; to: string };

interface SavedNewsSearch {
  id: string;
  issue: string;
  from: string;
  to: string;
}

const savedSearchKey = "pr-media-news-searches:v1";
const recentDay = (days = 0) =>
  taipeiDate(new Date(Date.now() + days * 86400000).toISOString());

function readSavedSearches(): SavedNewsSearch[] {
  try {
    const content: unknown = JSON.parse(
      localStorage.getItem(savedSearchKey) || "[]",
    );
    if (!Array.isArray(content)) return [];
    return content.filter(
      (entry) =>
        typeof entry?.id === "string" &&
        typeof entry.issue === "string" &&
        typeof entry.from === "string" &&
        typeof entry.to === "string",
    );
  } catch {
    return [];
  }
}

export default function AutoNews({
  apiUrl,
  onLocal,
}: {
  apiUrl: string;
  onLocal: () => void;
}) {
  const [feed, setFeed] = useState<NewsFeed | null>(null);
  const [topic, setTopic] = useState("newebpay");
  const [query, setQuery] = useState("");
  const [brandOnly, setBrandOnly] = useState(true);
  const [from, setFrom] = useState(() => recentDay(-29));
  const [to, setTo] = useState(() => recentDay());
  const [saved, setSaved] = useState(readSavedSearches);
  const [saveNotice, setSaveNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);
  const ticket = useRef(0);
  const active = useRef<NewsSearch>({ topic: "newebpay" });
  async function load(input = active.current) {
    const id = ++ticket.current;
    active.current = input;
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams(input);
      const value = await request<NewsFeed>(apiUrl, "", "/api/news?" + params);
      if (id !== ticket.current) return;
      setFeed(value);
    } catch (e) {
      if (id === ticket.current) setError((e as Error).message);
    } finally {
      if (id === ticket.current) setLoading(false);
    }
  }
  useEffect(() => {
    void load();
    const timer = setInterval(() => {
      void load();
    }, 5 * 60000);
    return () => {
      clearInterval(timer);
      ticket.current++;
    };
  }, [apiUrl]);
  function selectTopic(id: string) {
    const preset = defaultNewsTopics.find((entry) => entry.id === id);
    const savedTopic = saved.find((entry) => entry.id === id);
    setSaveNotice("");
    if (preset) {
      setTopic(id);
      setQuery(preset.issue || "");
      setBrandOnly(true);
      setFrom(preset.from || recentDay(-29));
      setTo(preset.to && preset.to < recentDay() ? preset.to : recentDay());
      void load({ topic: id });
    } else if (savedTopic) {
      setTopic(id);
      setQuery(savedTopic.issue);
      setBrandOnly(true);
      setFrom(savedTopic.from);
      setTo(savedTopic.to);
      void load({
        issue: savedTopic.issue,
        from: savedTopic.from,
        to: savedTopic.to,
      });
    }
  }

  function runSearch(save: boolean) {
    const issue = brandOnly ? cleanNewsIssue(query) : query.trim();
    setSaveNotice("");
    if (issue.length < 2 || (brandOnly && /[<>"]/.test(issue))) {
      setError(
        brandOnly
          ? "請填寫至少兩個字的公開議題關鍵字。"
          : "請填寫至少兩個字的關鍵字。",
      );
      return;
    }
    if (
      !from ||
      !to ||
      from > to ||
      to > recentDay() ||
      Date.parse(to) - Date.parse(from) > 365 * 86400000
    ) {
      setError("請選擇不超過一年的有效新聞期間。");
      return;
    }
    let id = "";
    if (brandOnly) {
      const current = readSavedSearches();
      id =
        current.find(
          (entry) =>
            entry.issue.toLowerCase() === issue.toLowerCase() &&
            entry.from === from &&
            entry.to === to,
        )?.id || "";
      if (save) {
        const next = id
          ? current
          : [...current, { id: crypto.randomUUID(), issue, from, to }];
        id ||= next.at(-1)!.id;
        try {
          localStorage.setItem(savedSearchKey, JSON.stringify(next));
          setSaved(next);
          setSaveNotice("已儲存在此瀏覽器，可從上方選單再開啟。");
        } catch {
          setSaveNotice("此瀏覽器目前無法儲存專題。");
          id = "";
        }
      } else setSaved(current);
    }
    setTopic(id);
    void load(brandOnly ? { issue, from, to } : { q: issue, from, to });
  }

  function removeSavedTopic() {
    const next = readSavedSearches().filter((entry) => entry.id !== topic);
    try {
      localStorage.setItem(savedSearchKey, JSON.stringify(next));
      setSaved(next);
      setTopic("");
      setSaveNotice("已從此瀏覽器移除專題。");
    } catch {
      setSaveNotice("此瀏覽器目前無法移除專題。");
    }
  }
  async function exportExcel() {
    if (!feed) return;
    setExporting(true);
    try {
      const { Workbook } = await import("exceljs");
      const book = new Workbook();
      const sheet = book.addWorksheet("自動新聞清單");
      sheet.columns = [
        { width: 8 },
        { width: 15 },
        { width: 23 },
        { width: 20 },
        { width: 90 },
        { width: 25 },
      ];
      sheet.mergeCells("A1:F1");
      sheet.getCell("A1").value = `${feed.query} 新聞搜尋結果（待確認露出）`;
      sheet.getCell("A1").font = { size: 17, bold: true };
      sheet.getRow(1).height = 34;
      sheet.mergeCells("A2:F2");
      sheet.getCell("A2").value =
        `期間 ${feed.from} 至 ${feed.to}／更新 ${formatDate(feed.lastSuccessAt || "")}／來源 ${feed.sources.map((s) => s.name).join("、")}`;
      sheet.getRow(2).height = 26;
      sheet.addRow([]);
      sheet.addRow(["NO.", "日期", "媒體", "記者", "標題", "資料來源"]);
      sheet.getRow(4).font = { bold: true, color: { argb: "FF284968" } };
      sheet.getRow(4).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFE8EFF7" },
      };
      feed.items.forEach((a, i) => {
        const row = sheet.addRow([
          i + 1,
          new Date(taipeiDate(a.publishedAt) + "T00:00:00Z"),
          a.publisher,
          a.author || "未提供",
          { text: a.title, hyperlink: a.url },
          [
            ...a.sources,
            ...(a.bodyKeywords?.length
              ? [`內文命中 ${a.bodyKeywords.join("、")}`]
              : []),
          ].join(" · "),
        ]);
        row.getCell(2).numFmt = "yyyy/mm/dd";
        row.getCell(5).font = { color: { argb: "FF235B9B" }, underline: true };
        row.alignment = { wrapText: true, vertical: "middle" };
        row.height = Math.max(32, Math.ceil(a.title.length / 42) * 20);
      });
      sheet.views = [{ state: "frozen", ySplit: 4 }];
      sheet.autoFilter = "A4:F" + Math.max(4, feed.items.length + 4);
      const bytes = await book.xlsx.writeBuffer();
      download(
        new Blob([new Uint8Array(bytes)]),
        `${feed.query.replace(/[<>:"/\\|?*]/g, "_")}-自動新聞.xlsx`,
      );
    } catch {
      setError("Excel 下載失敗，請稍後重試。");
    } finally {
      setExporting(false);
    }
  }
  return (
    <div className="simple-app auto-news">
      <header className="simple-top">
        <a href="#/simple">
          <FileSpreadsheet size={23} />
          新聞露出清單
        </a>
        <button className="text-button" onClick={onLocal}>
          我的 Excel 清單 <ArrowRight size={14} />
        </button>
      </header>
      <main className="simple-main">
        <div className="simple-heading">
          <div>
            <h1>自動新聞露出清單</h1>
            <p>選擇追蹤主題，或輸入議題和日期查找藍新露出。</p>
          </div>
        </div>
        <div className="simple-controls">
          <label className="simple-list-select">
            <span>追蹤主題</span>
            <select
              aria-label="自動新聞主題"
              value={topic}
              onChange={(e) => selectTopic(e.target.value)}
            >
              {!topic && <option value="">本次搜尋</option>}
              <optgroup label="自動更新">
                {defaultNewsTopics.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </optgroup>
              {saved.length > 0 && (
                <optgroup label="此瀏覽器的專題">
                  {saved.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.issue}（{entry.from} 至 {entry.to}）
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </label>
          <div className="button-row">
            <button
              className="secondary"
              disabled={loading}
              onClick={() => void load()}
            >
              <RefreshCw size={16} className={loading ? "spin" : ""} />
              {loading ? "載入中…" : "更新清單"}
            </button>
            <button
              className="primary"
              disabled={!feed?.items.length || exporting || loading}
              onClick={exportExcel}
            >
              <Download size={16} />
              下載 Excel
            </button>
          </div>
        </div>
        <form
          className="auto-search"
          onSubmit={(e) => {
            e.preventDefault();
            runSearch(false);
          }}
        >
          <div className="auto-search-fields">
            <label>
              搜尋範圍
              <select
                value={brandOnly ? "newebpay" : "all"}
                onChange={(e) => setBrandOnly(e.target.value === "newebpay")}
              >
                <option value="newebpay">藍新</option>
                <option value="all">不限品牌</option>
              </select>
            </label>
            <label className="auto-issue">
              {brandOnly ? "議題關鍵字" : "新聞關鍵字"}
              <input
                required
                minLength={2}
                maxLength={brandOnly ? 80 : 100}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={
                  brandOnly
                    ? "例如 應援、AI導購、台灣大"
                    : "輸入品牌或新聞關鍵字"
                }
              />
            </label>
            <label>
              開始日期
              <input
                type="date"
                required
                value={from}
                max={to || recentDay()}
                onChange={(e) => setFrom(e.target.value)}
              />
            </label>
            <label>
              結束日期
              <input
                type="date"
                required
                value={to}
                min={from}
                max={recentDay()}
                onChange={(e) => setTo(e.target.value)}
              />
            </label>
          </div>
          <div className="auto-search-actions">
            <button className="primary" disabled={loading}>
              <Search size={16} /> 搜尋新聞
            </button>
            {brandOnly && (
              <button
                className="secondary"
                type="button"
                disabled={loading}
                onClick={(e) => {
                  if (e.currentTarget.form?.reportValidity()) runSearch(true);
                }}
              >
                <Bookmark size={16} /> 儲存專題
              </button>
            )}
            {saved.some((entry) => entry.id === topic) && (
              <button
                className="text-button"
                type="button"
                onClick={removeSavedTopic}
              >
                移除專題
              </button>
            )}
            {saveNotice && <span role="status">{saveNotice}</span>}
          </div>
        </form>
        {error && (
          <div className="simple-notice auto-warning" role="alert">
            {error}
            {feed && "；下方保留上次成功載入的結果。"}
          </div>
        )}
        <section className="simple-sheet">
          <div className="simple-sheet-heading">
            <div>
              <h2>
                {feed
                  ? `${feed.query} · 新聞搜尋結果`
                  : loading
                    ? "正在載入新聞…"
                    : "自動新聞"}
              </h2>
              <p>
                {feed ? (
                  <>
                    找到 <strong>{feed.items.length}</strong> 則 ·{" "}
                    <strong>
                      {new Set(feed.items.map((a) => a.publisher)).size}
                    </strong>{" "}
                    家媒體
                    <span>
                      {feed.from} 至 {feed.to}
                    </span>
                  </>
                ) : (
                  "正從已串接來源讀取真實新聞資料。"
                )}
              </p>
            </div>
            <div className="auto-freshness">
              <span className="status-dot" />
              {feed?.lastSuccessAt
                ? `資料更新 ${formatDate(feed.lastSuccessAt)}`
                : "等待來源回應"}
            </div>
          </div>
          {feed?.items.length ? (
            <div className="table-scroll">
              <table
                className="simple-table auto-table"
                role="table"
                aria-label="新聞搜尋結果"
              >
                <thead role="rowgroup">
                  <tr role="row">
                    <th role="columnheader">NO.</th>
                    <th role="columnheader">日期</th>
                    <th role="columnheader">媒體</th>
                    <th role="columnheader">記者</th>
                    <th role="columnheader">標題</th>
                  </tr>
                </thead>
                <tbody role="rowgroup">
                  {feed.items.map((a, i) => (
                    <tr key={a.id} role="row">
                      <td role="cell">{i + 1}</td>
                      <td role="cell">
                        {taipeiDate(a.publishedAt).replaceAll("-", "/")}
                      </td>
                      <td role="cell">{a.publisher}</td>
                      <td role="cell">
                        <span className="auto-mobile-label" aria-hidden="true">
                          記者：
                        </span>
                        {a.author || "來源未提供"}
                      </td>
                      <td role="cell">
                        <a href={a.url} target="_blank" rel="noreferrer">
                          {a.title}
                          <ExternalLink size={12} />
                        </a>
                        <small className="auto-row-source">
                          {a.sources.join("、")}
                          {a.linkKind === "aggregator"
                            ? " · Google 聚合連結"
                            : ""}
                          {a.bodyKeywords?.length
                            ? ` · 內文命中 ${a.bodyKeywords.join("、")}`
                            : ""}
                        </small>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="simple-empty">
              <Search size={30} />
              <h3>
                {loading ? "正在向新聞來源查詢" : "目前沒有找到符合的新聞"}
              </h3>
              <p>
                {loading
                  ? "首次搜尋需要一些時間，取得後會自動顯示。"
                  : "可以修改關鍵字或展開日期範圍。歷史 RSS 可能無法找回所有舊報導。"}
              </p>
            </div>
          )}
          {feed && (
            <div className="auto-source-status">
              <span>
                來源：
                {feed.sources
                  .map(
                    (s) =>
                      `${s.name}（${s.ok ? "已連線" : "暫時無法更新"}${s.updatedAt ? " · " + formatDate(s.updatedAt) : ""}）`,
                  )
                  .join("、")}
              </span>
              {feed.status !== "ready" && <strong>部分資料可能尚未更新</strong>}
              <p>{feed.note}</p>
            </div>
          )}
        </section>
        <footer className="simple-footer">
          <span>
            自動新聞保存於雲端 · 網頁每 5 分鐘檢查更新 · 背景每小時更新預設主題
          </span>
          <button className="text-button" onClick={onLocal}>
            管理手動／Excel 清單
          </button>
        </footer>
      </main>
    </div>
  );
}
