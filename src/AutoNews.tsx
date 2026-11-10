import { useEffect, useRef, useState } from "react";
import {
  Download,
  FileSpreadsheet,
  RefreshCw,
  Search,
  ExternalLink,
  ArrowRight,
} from "lucide-react";
import { defaultNewsTopics } from "./news-types";
import type { NewsFeed } from "./news-types";
import { request } from "./api";
import { download } from "./export";
import { formatDate, taipeiDate } from "./domain";
export default function AutoNews({
  apiUrl,
  onLocal,
}: {
  apiUrl: string;
  onLocal: () => void;
}) {
  const [feed, setFeed] = useState<NewsFeed | null>(null);
  const [topic, setTopic] = useState("newebpay");
  const [query, setQuery] = useState("藍新金流");
  const [from, setFrom] = useState(
    taipeiDate(new Date(Date.now() - 29 * 86400000).toISOString()),
  );
  const [to, setTo] = useState(taipeiDate(new Date().toISOString()));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);
  const ticket = useRef(0);
  const active = useRef({
    topic: "newebpay",
    query: "藍新金流",
    from: "",
    to: "",
  });
  async function load(input = active.current) {
    const id = ++ticket.current;
    active.current = input;
    setLoading(true);
    setError("");
    try {
      const params = input.topic
        ? new URLSearchParams({ topic: input.topic })
        : new URLSearchParams({
            q: input.query,
            from: input.from,
            to: input.to,
          });
      const value = await request<NewsFeed>(apiUrl, "", "/api/news?" + params);
      if (id !== ticket.current) return;
      setFeed(value);
      setFrom(value.from);
      setTo(value.to);
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
          a.sources.join("、"),
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
    <div className="simple-app">
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
            <p>開啟就能看新聞。選主題、點標題、下載表格，不必建立專案。</p>
          </div>
        </div>
        <div className="simple-controls">
          <label className="simple-list-select">
            <span>看哪個主題</span>
            <select
              aria-label="自動新聞主題"
              value={topic}
              onChange={(e) => {
                const t = defaultNewsTopics.find(
                  (t) => t.id === e.target.value,
                )!;
                setTopic(t.id);
                setQuery(t.query);
                void load({
                  topic: t.id,
                  query: t.query,
                  from: t.from || "",
                  to: t.to || "",
                });
              }}
            >
              {defaultNewsTopics.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
              {!topic && <option value="">自訂搜尋</option>}
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
              disabled={!feed?.items.length || exporting}
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
            setTopic("");
            void load({ topic: "", query, from, to });
          }}
        >
          <div className="auto-search-row">
            <label className="search">
              <Search size={17} />
              <input
                aria-label="新聞關鍵字"
                required
                minLength={2}
                maxLength={100}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="輸入品牌或新聞關鍵字"
              />
            </label>
            <button className="secondary" disabled={loading}>
              搜尋新聞
            </button>
          </div>
          <details>
            <summary>
              調整搜尋日期（目前 {from} 至 {to}）
            </summary>
            <div className="auto-dates">
              <label>
                開始日期
                <input
                  type="date"
                  required
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                />
              </label>
              <label>
                結束日期
                <input
                  type="date"
                  required
                  value={to}
                  max={taipeiDate(new Date().toISOString())}
                  onChange={(e) => setTo(e.target.value)}
                />
              </label>
              <span>調整後按「搜尋新聞」套用。</span>
            </div>
          </details>
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
              <table className="simple-table">
                <thead>
                  <tr>
                    <th>NO.</th>
                    <th>日期</th>
                    <th>媒體</th>
                    <th>記者</th>
                    <th>標題</th>
                  </tr>
                </thead>
                <tbody>
                  {feed.items.map((a, i) => (
                    <tr key={a.id}>
                      <td>{i + 1}</td>
                      <td>{taipeiDate(a.publishedAt).replaceAll("-", "/")}</td>
                      <td>{a.publisher}</td>
                      <td className={!a.author ? "muted" : ""}>
                        {a.author || "來源未提供"}
                      </td>
                      <td>
                        <a href={a.url} target="_blank" rel="noreferrer">
                          {a.title}
                          <ExternalLink size={12} />
                        </a>
                        <small className="auto-row-source">
                          {a.sources.join("、")}
                          {a.linkKind === "aggregator"
                            ? " · Google 聚合連結"
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
