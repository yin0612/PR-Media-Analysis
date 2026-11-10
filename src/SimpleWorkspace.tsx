import { useRef, useState } from "react";
import {
  Plus,
  Upload,
  Download,
  Search,
  ExternalLink,
  Pencil,
  X,
  Check,
  ArrowRight,
  FileSpreadsheet,
  Undo2,
} from "lucide-react";
import type { Article, Database } from "./types";
import type { ImportRow } from "./domain";
import {
  canonicalize,
  formatDate,
  log,
  makeBody,
  now,
  parseDate,
  taipeiDate,
  uid,
  validateBackup,
} from "./domain";
import {
  addToList,
  blankRow,
  createList,
  listRows,
  readExposureExcel,
} from "./simple-data";
import type { ExposureSheet } from "./simple-data";
import { download } from "./export";
import { mapRows, readCSV } from "./csv";
import { Field } from "./forms";
import "./simple.css";
import AutoNews from "./AutoNews";
export default function SimpleWorkspace({
  db,
  saveState,
  onCommit,
  onAdvanced,
}: {
  db: Database;
  saveState: string;
  onCommit: (d: Database) => void;
  onAdvanced: () => void;
}) {
  const [mode, setMode] = useState<"auto" | "local">("auto");
  const lists = db.projects.filter((p) => p.status === "active");
  const [selected, setSelected] = useState(lists[0]?.id || "");
  const project = lists.find((p) => p.id === selected) || lists[0];
  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<
    "new" | "entry" | "import" | "restore" | null
  >(null);
  const [editId, setEditId] = useState("");
  const [sheets, setSheets] = useState<ExposureSheet[]>([]);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [target, setTarget] = useState("new");
  const [importName, setImportName] = useState("");
  const [undo, setUndo] = useState<{ id: string; status: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const restoreRef = useRef<HTMLInputElement>(null);
  const [restore, setRestore] = useState<Database | null>(null);
  const all = project ? listRows(db, project.id) : [];
  const rows = all.filter((a) =>
    `${a.title} ${a.publisher} ${a.author}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const media = new Set(all.map((a) => a.publisher.trim()).filter(Boolean));
  function mutate(fn: (d: Database) => void) {
    const d = structuredClone(db);
    fn(d);
    onCommit(d);
  }
  function close() {
    setDialog(null);
    setEditId("");
  }
  async function readFile(file: File) {
    setBusy(true);
    setNotice("");
    try {
      if (file.size > 20 * 1024 * 1024)
        throw new Error("檔案超過 20 MB，請先移除不需要的圖片或工作表");
      let values: ExposureSheet[];
      if (file.name.toLowerCase().endsWith(".csv")) {
        const parsed = readCSV(await file.text());
        if (parsed.errors.length) throw new Error(parsed.errors.join("；"));
        if (!parsed.mapping.title) throw new Error("找不到標題欄位");
        values = [
          {
            name: "CSV",
            title: file.name.replace(/\.csv$/i, ""),
            rows: mapRows(parsed.raw, parsed.mapping),
          },
        ];
      } else values = await readExposureExcel(await file.arrayBuffer());
      if (!values.some((s) => s.rows.length))
        throw new Error("找不到露出清單，請確認工作表含「媒體」與「標題」欄位");
      setSheets(values);
      const index = values.findIndex((s) => s.rows.length);
      setSheetIndex(index);
      const name = `${values[index].title}｜${values[index].name}`;
      setImportName(name);
      setTarget(lists.find((p) => p.name === name)?.id || "new");
      setDialog("import");
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function exportExcel() {
    if (!project) return;
    setBusy(true);
    try {
      const { Workbook } = await import("exceljs");
      const book = new Workbook();
      const sheet = book.addWorksheet("新聞露出清單");
      sheet.columns = [
        { width: 8 },
        { width: 15 },
        { width: 23 },
        { width: 23 },
        { width: 88 },
      ];
      sheet.mergeCells("A1:E1");
      sheet.getCell("A1").value = project.name;
      sheet.getCell("A1").font = { size: 18, bold: true };
      sheet.getRow(1).height = 38;
      sheet.mergeCells("A2:E2");
      sheet.getCell("A2").value =
        `資料更新時間：${taipeiDate(now()).replaceAll("-", ".")}　共 ${all.length} 則／${media.size} 家媒體（依媒體名稱）`;
      sheet.getRow(2).height = 27;
      sheet.addRow([]);
      sheet.addRow(["NO.", "日期", "媒體", "記者", "標題"]);
      sheet.getRow(4).height = 28;
      sheet.getRow(4).eachCell((c) => {
        c.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFE8EFF7" },
        };
        c.font = { bold: true, color: { argb: "FF264768" } };
      });
      all.forEach((a, i) => {
        const date = a.publishedAt
          ? new Date(taipeiDate(a.publishedAt) + "T00:00:00Z")
          : null;
        const row = sheet.addRow([
          i + 1,
          date,
          a.publisher,
          a.author,
          a.url ? { text: a.title, hyperlink: canonicalize(a.url) } : a.title,
        ]);
        row.getCell(2).numFmt = "yyyy/mm/dd";
        if (a.url)
          row.getCell(5).font = {
            color: { argb: "FF235B9B" },
            underline: true,
          };
        row.alignment = { vertical: "middle", wrapText: true };
        row.height = Math.max(32, Math.ceil(a.title.length / 42) * 20);
        row.eachCell(
          (c) =>
            (c.border = {
              bottom: { style: "thin", color: { argb: "FFE4EAF0" } },
            }),
        );
      });
      sheet.views = [{ state: "frozen", ySplit: 4 }];
      sheet.autoFilter = "A4:E" + Math.max(4, all.length + 4);
      sheet.pageSetup = {
        orientation: "landscape",
        paperSize: 9,
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        printTitlesRow: "1:4",
      };
      const bytes = await book.xlsx.writeBuffer();
      download(
        new Blob([new Uint8Array(bytes)], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }),
        project.name.replace(/[<>:"/\\|?*]/g, "_") + ".xlsx",
      );
      setNotice("已下載 Excel，保留日期、媒體、記者及標題連結。");
    } catch (e) {
      setNotice("下載失敗：" + (e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const edited = db.articles.find((a) => a.id === editId);
  const chosen = sheets[sheetIndex];
  if (mode === "auto")
    return (
      <AutoNews
        apiUrl={
          db.settings.apiUrl ||
          import.meta.env.VITE_API_URL ||
          "https://pr-media-analysis-api.media-monitoring-worker.workers.dev"
        }
        onLocal={() => setMode("local")}
      />
    );
  return (
    <div className="simple-app">
      <header className="simple-top">
        <a href="#/simple">
          <FileSpreadsheet size={23} />
          新聞露出清單
        </a>
        <div className="button-row">
          <button className="text-button" onClick={() => setMode("auto")}>
            自動新聞
          </button>
          <button className="text-button" onClick={onAdvanced}>
            進階分析 <ArrowRight size={14} />
          </button>
        </div>
      </header>
      <main className="simple-main">
        <div className="simple-heading">
          <div>
            <h1>你的新聞露出，一張表就好。</h1>
            <p>和 Excel 一樣：日期、媒體、記者、標題。點標題開啟新聞。</p>
          </div>
          <button className="secondary" onClick={() => setDialog("new")}>
            <Plus size={16} />
            新增清單
          </button>
        </div>
        <div className="simple-controls">
          <label className="simple-list-select">
            <span>目前清單</span>
            <select
              aria-label="目前清單"
              value={project?.id || ""}
              onChange={(e) => {
                setSelected(e.target.value);
                setSearch("");
              }}
            >
              {!lists.length && <option value="">尚未建立清單</option>}
              {lists.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <div className="button-row">
            <button
              className="primary"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
            >
              <Upload size={16} />
              {busy ? "處理中…" : "匯入 Excel"}
            </button>
            <button
              className="secondary"
              disabled={!project}
              onClick={() => {
                setEditId("");
                setDialog("entry");
              }}
            >
              <Plus size={16} />
              新增一筆
            </button>
            <button
              className="secondary"
              disabled={!project || !all.length || busy}
              onClick={exportExcel}
            >
              <Download size={16} />
              下載 Excel
            </button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.csv"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void readFile(file);
            }}
          />
        </div>
        {notice && (
          <div className="simple-notice" role="status">
            <span>{notice}</span>
            <button
              className="icon-button"
              aria-label="關閉通知"
              onClick={() => setNotice("")}
            >
              <X size={16} />
            </button>
          </div>
        )}
        <section className="simple-sheet">
          <div className="simple-sheet-heading">
            <div>
              <h2>{project?.name || "新聞露出總表"}</h2>
              <p>
                {project ? (
                  <>
                    共 <strong>{all.length}</strong> 則新聞 ·{" "}
                    <strong>{media.size}</strong> 家媒體
                    <span>（依媒體名稱）</span>
                  </>
                ) : (
                  "直接匯入你原本的 Excel，或建立一張空白清單。"
                )}
              </p>
            </div>
            {all.length > 0 && (
              <label className="search">
                <Search size={16} />
                <input
                  aria-label="搜尋露出"
                  placeholder="找媒體、記者或標題"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>
            )}
          </div>
          {all.length ? (
            <>
              <div className="table-scroll">
                <table className="simple-table">
                  <thead>
                    <tr>
                      <th>NO.</th>
                      <th>日期</th>
                      <th>媒體</th>
                      <th>記者</th>
                      <th>標題</th>
                      <th>
                        <span className="sr-only">操作</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((a, i) => (
                      <tr key={a.id}>
                        <td>{all.indexOf(a) + 1}</td>
                        <td>
                          {a.publishedAt
                            ? taipeiDate(a.publishedAt).replaceAll("-", "/")
                            : "待補日期"}
                        </td>
                        <td>{a.publisher || "—"}</td>
                        <td>{a.author || "—"}</td>
                        <td>
                          {a.url ? (
                            <a href={a.url} target="_blank" rel="noreferrer">
                              {a.title}
                              <ExternalLink size={12} />
                            </a>
                          ) : (
                            a.title
                          )}
                        </td>
                        <td>
                          <div className="simple-row-actions">
                            <button
                              aria-label={`編輯 ${a.title}`}
                              title="編輯"
                              onClick={() => {
                                setEditId(a.id);
                                setDialog("entry");
                              }}
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              aria-label={`移除 ${a.title}`}
                              title="從清單移除（可撤銷）"
                              onClick={() => {
                                const l = db.links.find(
                                  (l) =>
                                    l.projectId === project!.id &&
                                    l.articleId === a.id,
                                )!;
                                setUndo({
                                  id: l.id,
                                  status: l.inclusionStatus,
                                });
                                mutate((d) => {
                                  const link = d.links.find(
                                    (x) => x.id === l.id,
                                  )!;
                                  link.inclusionStatus = "excluded";
                                  link.inclusionReason = "使用者從簡易清單移除";
                                });
                              }}
                            >
                              <X size={15} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!rows.length && (
                <div className="simple-no-results">
                  找不到符合的新聞，請換個關鍵字。
                </div>
              )}
              <div className="simple-table-footer">
                {search
                  ? `搜尋結果 ${rows.length} 則／全部 ${all.length} 則`
                  : `共 ${all.length} 則`}{" "}
                · 日期由舊到新排列
              </div>
            </>
          ) : (
            <div className="simple-empty">
              <FileSpreadsheet size={36} />
              <h3>
                {project ? "這張清單還沒有新聞" : "把你原本的 Excel 帶進來"}
              </h3>
              <p>
                支援「編號、日期、媒體、記者、標題」格式，
                <br />
                也會保留藏在標題裡的新聞連結。
              </p>
              <button
                className="primary"
                disabled={busy}
                onClick={() => fileRef.current?.click()}
              >
                <Upload size={16} />
                選擇 Excel 檔案
              </button>
              <small>檔案只在你的瀏覽器內讀取。</small>
            </div>
          )}
        </section>
        {undo && (
          <div className="simple-notice">
            <span>已從清單移除一筆。</span>
            <button
              className="text-button"
              onClick={() => {
                mutate((d) => {
                  const link = d.links.find((l) => l.id === undo.id);
                  if (link)
                    link.inclusionStatus =
                      undo.status as typeof link.inclusionStatus;
                });
                setUndo(null);
              }}
            >
              <Undo2 size={14} />
              撤銷移除
            </button>
          </div>
        )}
        <footer className="simple-footer">
          <span>{saveState} · 資料不會自動同步到其他電腦</span>
          <div className="button-row">
            <button
              className="text-button"
              onClick={() =>
                download(
                  JSON.stringify(db, null, 2),
                  `露出清單備份-${taipeiDate(now())}.json`,
                )
              }
            >
              備份全部資料
            </button>
            <button
              className="text-button"
              onClick={() => restoreRef.current?.click()}
            >
              還原備份
            </button>
          </div>
          <input
            ref={restoreRef}
            type="file"
            accept=".json"
            hidden
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              try {
                setRestore(validateBackup(JSON.parse(await file.text())));
                setDialog("restore");
              } catch (err) {
                setNotice((err as Error).message);
              }
            }}
          />
        </footer>
      </main>
      {dialog && (
        <div className="modal-backdrop">
          <section
            className="modal simple-modal"
            role="dialog"
            aria-modal="true"
            aria-label={
              dialog === "entry"
                ? "編輯新聞"
                : dialog === "import"
                  ? "匯入 Excel"
                  : dialog === "new"
                    ? "新增清單"
                    : "還原備份"
            }
          >
            <div className="modal-heading">
              <h2>
                {dialog === "entry"
                  ? editId
                    ? "編輯這筆新聞"
                    : "新增一筆新聞"
                  : dialog === "import"
                    ? "匯入 Excel"
                    : dialog === "new"
                      ? "新增清單"
                      : "還原備份"}
              </h2>
              <button
                className="icon-button"
                aria-label="關閉視窗"
                onClick={close}
              >
                <X size={20} />
              </button>
            </div>
            <div className="modal-body">
              {dialog === "new" && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    mutate((d) => {
                      const p = createList(d, String(f.get("name")).trim());
                      setSelected(p.id);
                    });
                    close();
                  }}
                >
                  <Field label="清單名稱">
                    <input
                      name="name"
                      required
                      autoFocus
                      placeholder="例如：AFTEE 合作新聞露出"
                    />
                  </Field>
                  <p className="simple-hint">
                    只要一個名稱就能開始，不必填寫新聞稿或核心訊息。
                  </p>
                  <div className="modal-footer">
                    <button className="primary">
                      <Plus size={15} />
                      建立清單
                    </button>
                  </div>
                </form>
              )}
              {dialog === "entry" && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    try {
                      const f = new FormData(e.currentTarget);
                      const row = {
                        ...blankRow(),
                        ...Object.fromEntries(f),
                      } as ImportRow;
                      const url = canonicalize(row.url);
                      if (
                        editId &&
                        url &&
                        db.articles.some(
                          (a) => a.id !== editId && a.canonicalUrl === url,
                        )
                      )
                        throw new Error("相同網址已存在，請保留原本的那筆新聞");
                      mutate((d) => {
                        if (editId) {
                          const a = d.articles.find((a) => a.id === editId)!;
                          if (a.title !== row.title) {
                            const old = d.bodies.find(
                              (b) => b.id === a.bodyId,
                            )!;
                            const body = makeBody(
                              a.id,
                              uid(),
                              old.version + 1,
                              old.summary,
                              old.body,
                              old.bodyStatus,
                            );
                            d.bodies.push(body);
                            a.bodyId = body.id;
                          }
                          Object.assign(a, {
                            title: row.title.trim(),
                            publisher: row.publisher.trim(),
                            author: row.author.trim(),
                            publishedAt: parseDate(row.published_at),
                            url: row.url.trim(),
                            canonicalUrl: url,
                            publisherDomain: url
                              ? new URL(url).hostname.replace(/^www\./, "")
                              : "",
                            updatedAt: now(),
                          });
                        } else {
                          const result = addToList(d, project!.id, [row]);
                          if (result.failed.length)
                            throw new Error(result.failed.join("；"));
                          setNotice(
                            result.added
                              ? "已新增一筆新聞"
                              : "相同資料已存在，沒有重複新增。",
                          );
                        }
                      });
                      close();
                    } catch (err) {
                      setNotice((err as Error).message);
                    }
                  }}
                >
                  <div className="form-grid">
                    <Field label="日期">
                      <input
                        name="published_at"
                        type="date"
                        defaultValue={
                          edited?.publishedAt
                            ? taipeiDate(edited.publishedAt)
                            : taipeiDate(now())
                        }
                      />
                    </Field>
                    <Field label="媒體">
                      <input
                        name="publisher"
                        defaultValue={edited?.publisher}
                        placeholder="例如：聯合新聞網"
                      />
                    </Field>
                  </div>
                  <Field label="記者">
                    <input
                      name="author"
                      defaultValue={edited?.author}
                      placeholder="可填記者姓名或轉載來源"
                    />
                  </Field>
                  <Field label="標題">
                    <textarea
                      name="title"
                      rows={2}
                      required
                      defaultValue={edited?.title}
                    />
                  </Field>
                  <Field label="新聞連結">
                    <input
                      name="url"
                      type="url"
                      defaultValue={edited?.url}
                      placeholder="https://…（可稍後補上）"
                    />
                  </Field>
                  <div className="modal-footer">
                    <button className="primary">
                      <Check size={15} />
                      儲存
                    </button>
                  </div>
                </form>
              )}
              {dialog === "import" && chosen && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    try {
                      let added = 0,
                        skipped = 0;
                      mutate((d) => {
                        const p =
                          target === "new"
                            ? createList(
                                d,
                                importName.trim(),
                                chosen.rows.map((r) => r.published_at),
                              )
                            : d.projects.find((p) => p.id === target)!;
                        const result = addToList(d, p.id, chosen.rows);
                        if (result.failed.length)
                          throw new Error(
                            `有 ${result.failed.length} 筆格式問題：${result.failed.slice(0, 3).join("；")}。請修正 Excel 後重試。`,
                          );
                        added = result.added;
                        skipped = result.skipped;
                        setSelected(p.id);
                        log(d, `由 ${chosen.name} 匯入新聞露出清單`);
                      });
                      setSearch("");
                      setNotice(
                        `已匯入「${chosen.name}」${chosen.rows.length} 則；新增 ${added} 則、略過相同資料 ${skipped} 則。`,
                      );
                      close();
                    } catch (err) {
                      setNotice((err as Error).message);
                    }
                  }}
                >
                  <Field
                    label="選擇工作表"
                    hint="只會匯入這張工作表，不會把其他分頁一起混入。"
                  >
                    <select
                      value={sheetIndex}
                      onChange={(e) => {
                        const i = Number(e.target.value);
                        setSheetIndex(i);
                        const name = `${sheets[i].title}｜${sheets[i].name}`;
                        setImportName(name);
                        setTarget(
                          lists.find((p) => p.name === name)?.id || "new",
                        );
                      }}
                    >
                      {sheets.map((s, i) => (
                        <option key={i} value={i} disabled={!s.rows.length}>
                          {s.name}（{s.rows.length} 則）
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="放入哪張清單">
                    <select
                      value={target}
                      onChange={(e) => setTarget(e.target.value)}
                    >
                      <option value="new">建立新清單</option>
                      {lists.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  {target === "new" && (
                    <Field label="新清單名稱">
                      <input
                        required
                        value={importName}
                        onChange={(e) => setImportName(e.target.value)}
                      />
                    </Field>
                  )}
                  <div className="simple-import-summary">
                    預覽前 {Math.min(5, chosen.rows.length)} 則，共{" "}
                    {chosen.rows.length}{" "}
                    則。匯入後會直接出現在清單，不需逐筆覆核。
                  </div>
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>日期</th>
                          <th>媒體</th>
                          <th>標題</th>
                        </tr>
                      </thead>
                      <tbody>
                        {chosen.rows.slice(0, 5).map((r, i) => (
                          <tr key={i}>
                            <td>{r.published_at.slice(0, 10) || "待補"}</td>
                            <td>{r.publisher}</td>
                            <td>{r.title}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="modal-footer">
                    <button className="primary">
                      <Check size={15} />
                      匯入這 {chosen.rows.length} 則新聞
                    </button>
                  </div>
                </form>
              )}
              {dialog === "restore" && restore && (
                <>
                  <p>
                    這份備份有 {restore.projects.length} 張清單、
                    {restore.articles.length}{" "}
                    篇報導。還原將取代目前資料，建議先下載備份。
                  </p>
                  <div className="modal-footer">
                    <button className="secondary" onClick={close}>
                      取消
                    </button>
                    <button
                      className="primary"
                      onClick={() => {
                        onCommit(restore);
                        setSelected(restore.projects[0]?.id || "");
                        setRestore(null);
                        close();
                        setNotice("備份已還原");
                      }}
                    >
                      確認還原
                    </button>
                  </div>
                </>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
