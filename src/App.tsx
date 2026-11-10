import { useEffect, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  Archive,
  BarChart3,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  Cloud,
  Cog,
  Database as DatabaseIcon,
  Download,
  FileDown,
  FileText,
  FolderOpen,
  Layers3,
  Link2,
  LoaderCircle,
  Menu,
  Plus,
  Radio,
  Search,
  ShieldCheck,
  Sparkles,
  Upload,
  Undo2,
  X,
} from "lucide-react";
import type {
  Analysis,
  Article,
  Database,
  Inclusion,
  Link,
  Project,
  Snapshot,
} from "./types";
import {
  canonicalize,
  createSnapshot,
  currentAnalysis,
  currentReview,
  emptyDB,
  formatDate,
  importRows,
  inspectRow,
  labels,
  log,
  makeBody,
  metrics,
  now,
  parseDate,
  ratio,
  taipeiDate,
  uid,
  validateBackup,
  validateResults,
} from "./domain";
import type { ImportRow } from "./domain";
import { load, save } from "./storage";
import { ArticleForm, Field, ProjectForm, ReviewForm } from "./forms";
import { fields, fieldLabels, mapRows, readCSV } from "./csv";
import { download, exportCSV, exportWord } from "./export";
import { analyze, request, summarize } from "./api";
import SimpleWorkspace from "./SimpleWorkspace";
type Page =
  "simple" | "projects" | "overview" | "articles" | "reports" | "settings";
type Modal =
  | { type: "project"; id?: string }
  | { type: "article"; id?: string }
  | { type: "review"; id: string }
  | { type: "import" }
  | null;
function route() {
  const [page, id] = location.hash.replace(/^#\/?/, "").split("/");
  return {
    page: ([
      "simple",
      "projects",
      "overview",
      "articles",
      "reports",
      "settings",
    ].includes(page)
      ? page
      : "simple") as Page,
    id: id || "",
  };
}
function Badge({ text, tone = "neutral" }: { text: string; tone?: string }) {
  return <span className={`badge ${tone}`}>{text}</span>;
}
function Empty({
  icon: Icon = FolderOpen,
  title,
  children,
  action,
}: {
  icon?: typeof FolderOpen;
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Icon size={30} />
      </div>
      <h2>{title}</h2>
      <p>{children}</p>
      {action}
    </div>
  );
}
function Metric({
  title,
  value,
  note,
  icon: Icon,
}: {
  title: string;
  value: string | number;
  note: string;
  icon: typeof FileText;
}) {
  return (
    <div className="metric">
      <div className="between">
        <span>{title}</span>
        <Icon size={18} />
      </div>
      <strong className={String(value).length > 9 ? "small-value" : ""}>
        {value}
      </strong>
      <small>{note}</small>
    </div>
  );
}
export default function App() {
  const [db, setDb] = useState<Database>(emptyDB);
  const dbRef = useRef(db);
  const queue = useRef(Promise.resolve());
  const [ready, setReady] = useState(false);
  const [saveState, setSaveState] = useState("載入資料中");
  const [view, setView] = useState(route);
  const [modal, setModal] = useState<Modal>(null);
  const [toast, setToast] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("date-desc");
  const [selected, setSelected] = useState<string[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [summary, setSummary] = useState("");
  const [busy, setBusy] = useState("");
  const [token, setToken] = useState("");
  const [service, setService] = useState("尚未連線");
  const [menu, setMenu] = useState(false);
  const [undo, setUndo] = useState<{ links: Link[]; label: string } | null>(
    null,
  );
  const authNonce = useRef("");
  const restoreRef = useRef<HTMLInputElement>(null);
  const [restore, setRestore] = useState<Database | null>(null);
  useEffect(() => {
    load()
      .then((d) => {
        dbRef.current = d;
        setDb(d);
        setReady(true);
        setSaveState("已儲存於此瀏覽器");
      })
      .catch(() => {
        setSaveState("無法讀取本機資料");
        setToast("無法開啟資料庫，請確認瀏覽器未封鎖網站儲存空間。");
      });
    const listener = () => {
      setView(route());
      setSearch("");
      setFilter("all");
      setSelected([]);
      setMenu(false);
    };
    window.addEventListener("hashchange", listener);
    return () => window.removeEventListener("hashchange", listener);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 9000);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (!modal) return;
    const previous = document.activeElement as HTMLElement;
    const listener = (e: KeyboardEvent) => {
      if (e.key === "Escape") setModal(null);
      if (e.key === "Tab") {
        const nodes = Array.from(
          document.querySelectorAll<HTMLElement>(
            ".modal button,.modal input,.modal select,.modal textarea,.modal a[href],.modal summary",
          ),
        ).filter((el) => !el.hasAttribute("disabled"));
        const first = nodes[0],
          last = nodes.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", listener);
    const timer = setTimeout(
      () =>
        document
          .querySelector<HTMLElement>(".modal input,.modal button")
          ?.focus(),
      50,
    );
    return () => {
      clearTimeout(timer);
      document.removeEventListener("keydown", listener);
      previous?.focus();
    };
  }, [modal]);
  useEffect(() => {
    const fn = (event: MessageEvent) => {
      try {
        if (
          event.origin !== new URL(db.settings.apiUrl).origin ||
          !authNonce.current ||
          event.data?.nonce !== authNonce.current ||
          event.data?.type !== "pr-auth"
        )
          return;
        setToken(event.data.token);
        authNonce.current = "";
        setService("已登入 Cloudflare");
        setToast("登入完成，登入憑證只保留於本次開啟的網頁。");
      } catch {
        /* No configured backend. */
      }
    };
    window.addEventListener("message", fn);
    return () => window.removeEventListener("message", fn);
  }, [db.settings.apiUrl]);
  const notify = (s: string) => setToast(s);
  function commit(d: Database) {
    for (const r of d.analyses) {
      const p = d.projects.find((p) => p.id === r.projectId);
      const a = d.articles.find((a) => a.id === r.articleId);
      if (
        r.runStatus === "completed" &&
        (r.releaseId !== p?.releaseId ||
          r.messageSetId !== p?.messageSetId ||
          r.bodyId !== a?.bodyId)
      )
        r.runStatus = "stale";
    }
    dbRef.current = d;
    setDb(d);
    setSaveState("儲存中…");
    queue.current = queue.current
      .then(() => save(d))
      .then(() => setSaveState("已儲存於此瀏覽器"))
      .catch(() => {
        setSaveState("儲存失敗，請立即備份");
        notify("本機儲存失敗，請先匯出 JSON 備份，避免關閉頁面後遺失資料。");
      });
  }
  function mutate(fn: (d: Database) => void) {
    const d = structuredClone(dbRef.current);
    fn(d);
    commit(d);
  }
  function nav(page: Page, id = view.id) {
    location.hash =
      page === "projects" ? "#/projects" : `#/${page}${id ? "/" + id : ""}`;
  }
  const project = db.projects.find((p) => p.id === view.id);
  const m = project ? metrics(db, project) : null;
  const release = project
    ? db.releases.find((r) => r.id === project.releaseId)
    : null;
  const messageSet = project
    ? db.messageSets.find((r) => r.id === project.messageSetId)
    : null;
  function batch(status: Inclusion) {
    mutate((d) => {
      d.links
        .filter((l) => selected.includes(l.id))
        .forEach((l) => {
          l.inclusionStatus = status;
          l.inclusionReason = "人工批次" + labels[status];
          l.updatedAt = now();
        });
      log(d, `批次${labels[status]} ${selected.length} 篇`);
    });
    setSelected([]);
    notify(`已${labels[status]}`);
  }
  function grouping(split = false) {
    if (selected.length < (split ? 1 : 2)) return;
    setUndo({
      links: structuredClone(db.links.filter((l) => selected.includes(l.id))),
      label: split ? "拆分群組" : "同文分組",
    });
    const group = uid();
    mutate((d) => {
      d.links
        .filter((l) => selected.includes(l.id))
        .forEach((l) => {
          l.groupId = split ? "" : group;
          l.updatedAt = now();
        });
      log(
        d,
        split ? "人工拆分同文群組" : `人工建立同文群組 ${selected.length} 篇`,
      );
    });
    setSelected([]);
    notify(split ? "已拆分為獨立稿件" : "已建立同文群組；各網站刊登仍各計一篇");
  }
  function merge() {
    const links = db.links.filter((l) => selected.includes(l.id));
    if (links.length < 2) return;
    setUndo({ links: structuredClone(links), label: "合併同筆" });
    mutate((d) => {
      const first = d.articles.find((a) => a.id === links[0].articleId)!;
      for (const l of links.slice(1)) {
        const a = d.articles.find((a) => a.id === l.articleId)!;
        first.discoverySources = [
          ...new Set([...first.discoverySources, ...a.discoverySources]),
        ];
        const link = d.links.find((x) => x.id === l.id)!;
        link.inclusionStatus = "excluded";
        link.inclusionReason = `人工確認為同筆重複，合併至 ${first.id}`;
      }
      log(d, `人工合併同筆 ${links.length} 篇；保留原始紀錄`);
    });
    setSelected([]);
    notify("已保留第一筆，其餘標記為重複排除；可撤銷。");
  }
  async function runAI(a: Article) {
    if (!project) return;
    if (!db.settings.apiUrl || !token) {
      notify("請到服務設定填寫 Cloudflare 後端並登入；目前仍可使用人工覆核。");
      return;
    }
    const body = db.bodies.find((b) => b.id === a.bodyId)!;
    if (body.bodyStatus !== "full") {
      notify("請先補齊並確認完整內文，才能執行 AI 訊息分析。");
      return;
    }
    setBusy(a.id);
    const run: Analysis = {
      id: uid(),
      projectId: project.id,
      articleId: a.id,
      releaseId: project.releaseId,
      messageSetId: project.messageSetId,
      bodyId: a.bodyId,
      runStatus: "running",
      modelVersion: "",
      analyzedAt: now(),
      results: [],
      discrepancies: [],
      quoteAdoption: "undetermined",
    };
    mutate((d) => {
      d.analyses.push(run);
    });
    try {
      const result = await analyze(db.settings.apiUrl, token, {
        project,
        release: release!,
        messageSet: messageSet!,
        body,
        article: {
          id: a.id,
          title: a.title,
          url: a.url,
          publishedAt: a.publishedAt,
        },
      });
      validateResults(result.results, messageSet!, body);
      mutate((d) => {
        Object.assign(
          d.analyses.find((x) => x.id === run.id)!,
          result,
          {
            id: run.id,
            projectId: project.id,
            articleId: a.id,
            releaseId: project.releaseId,
            messageSetId: project.messageSetId,
            bodyId: body.id,
            runStatus: "completed",
          },
        );
        const l = d.links.find(
          (l) => l.projectId === project.id && l.articleId === a.id,
        );
        if (l) {
          l.aiRecommendation = result.recommendation || "pending";
          l.aiReason = result.recommendationReason || "";
        }
      });
      notify("AI 分析完成，請開啟人工覆核；既有人工結果已保留。");
    } catch (err) {
      mutate((d) => {
        const r = d.analyses.find((x) => x.id === run.id)!;
        r.runStatus = "failed";
        r.error = (err as Error).message;
      });
      notify("AI 分析失敗：" + (err as Error).message);
    } finally {
      setBusy("");
    }
  }
  async function extract(a: Article) {
    if (!db.settings.apiUrl || !token) {
      notify("請先在服務設定連線並登入 Cloudflare 後端");
      return;
    }
    if (!a.url) {
      notify("請先補上原文網址");
      return;
    }
    setBusy(a.id);
    try {
      const result = await request<{
        body: string;
        summary: string;
        sourceType: string;
      }>(db.settings.apiUrl, token, "/api/articles/extract", { url: a.url });
      mutate((d) => {
        const article = d.articles.find((x) => x.id === a.id)!;
        const count = d.bodies.filter((x) => x.articleId === a.id).length;
        const b = makeBody(
          a.id,
          uid(),
          count + 1,
          result.summary || "",
          result.body,
          "summary_only",
        );
        b.sourceType = result.sourceType;
        d.bodies.push(b);
        article.bodyId = b.id;
        article.updatedAt = now();
      });
      notify("已擷取可讀文字，先標記為摘錄；請檢查來源並人工確認是否完整。");
    } catch (err) {
      notify(
        "擷取失敗：" + (err as Error).message + "。可使用「編輯」手動貼入。",
      );
    } finally {
      setBusy("");
    }
  }
  function createReport() {
    if (!project) return;
    const snapshot = createSnapshot(db, project, summary);
    mutate((d) => {
      d.reports.push(snapshot);
      log(d, `保存 ${project.name} 報告快照`);
    });
    setSummary("");
    notify("報告快照已凍結，可從同一份快照匯出 Word 與 CSV。");
  }
  const linkRows = project
    ? db.links
        .filter((l) => l.projectId === project.id)
        .map((link) => ({
          link,
          article: db.articles.find((a) => a.id === link.articleId)!,
        }))
    : [];
  const filtered = linkRows
    .filter(
      ({ link: l, article: a }) =>
        `${a.title} ${a.publisher} ${a.url}`
          .toLowerCase()
          .includes(search.toLowerCase()) &&
        (filter === "all" ||
          l.inclusionStatus === filter ||
          (filter === "missing" &&
            db.bodies.find((b) => b.id === a.bodyId)?.bodyStatus !== "full") ||
          (filter === "unreviewed" && !currentReview(db, project!, a))),
    )
    .sort((a, b) =>
      sort === "title"
        ? a.article.title.localeCompare(b.article.title, "zh-TW")
        : sort === "date-asc"
          ? a.article.publishedAt.localeCompare(b.article.publishedAt)
          : b.article.publishedAt.localeCompare(a.article.publishedAt),
    );
  const projects = db.projects.filter(
    (p) =>
      (showArchived || p.status === "active") &&
      `${p.name} ${p.brand}`.toLowerCase().includes(search.toLowerCase()),
  );
  const titles: Record<Page, string> = {
    simple: "新聞露出清單",
    projects: "發稿專案",
    overview: "成效總覽",
    articles: "露出清單",
    reports: "成效報告",
    settings: "資料與服務設定",
  };
  if (!ready)
    return (
      <div className="loading">
        <Radio size={34} />
        <h2>訊息觀測室</h2>
        <p>{saveState}</p>
      </div>
    );
  if (view.page === "simple")
    return (
      <SimpleWorkspace
        db={db}
        saveState={saveState}
        onCommit={commit}
        onAdvanced={() => nav("projects")}
      />
    );
  return (
    <div className="app">
      <aside className={`sidebar ${menu ? "open" : ""}`}>
        <button className="settings-link" onClick={() => nav("simple")}>
          ← 返回簡易露出清單
        </button>
        <a className="brand" href="#/projects">
          <div className="brand-mark">
            <Radio size={24} />
          </div>
          <div>
            <strong>訊息觀測室</strong>
            <span>PR MEDIA INTELLIGENCE</span>
          </div>
        </a>
        <div className="workspace-label">
          公關工作空間 <span>LOCAL</span>
        </div>
        <nav>
          <button
            className={view.page === "projects" ? "active" : ""}
            onClick={() => nav("projects")}
          >
            <FolderOpen size={19} />
            發稿專案{" "}
            <span className="nav-count">
              {db.projects.filter((p) => p.status === "active").length}
            </span>
          </button>
          {project && (
            <>
              <div className="nav-project">
                <small>目前專案</small>
                <strong>{project.name}</strong>
              </div>
              {(
                [
                  { page: "overview", icon: BarChart3, label: "成效總覽" },
                  { page: "articles", icon: FileText, label: "露出清單" },
                  { page: "reports", icon: ClipboardCheck, label: "成效報告" },
                ] as const
              ).map((n) => (
                <button
                  key={n.page}
                  className={view.page === n.page ? "active" : ""}
                  onClick={() => nav(n.page)}
                >
                  <n.icon size={19} />
                  {n.label}
                  {n.page === "articles" && (
                    <span className="nav-count">{linkRows.length}</span>
                  )}
                </button>
              ))}
            </>
          )}
        </nav>
        <div className="sidebar-bottom">
          <div className="local-card">
            <ShieldCheck size={19} />
            <strong>本機資料模式</strong>
            <p>
              工作資料保存在目前瀏覽器，
              <br />
              請定期下載備份。
            </p>
            <button
              onClick={() =>
                download(
                  JSON.stringify(db, null, 2),
                  `PR備份-${taipeiDate(now())}.json`,
                )
              }
            >
              <Download size={14} />
              匯出備份
            </button>
          </div>
          <button
            className={
              view.page === "settings"
                ? "settings-link active"
                : "settings-link"
            }
            onClick={() => nav("settings")}
          >
            <Cog size={18} />
            資料與服務設定
          </button>
          <div className="profile">
            <div>PR</div>
            <span>
              公關工作者<small>獨立工作空間</small>
            </span>
            <span className="online-dot" />
          </div>
        </div>
      </aside>
      <div className="main-wrap">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="mobile-menu icon-button"
              aria-label="開啟選單"
              onClick={() => setMenu(!menu)}
            >
              <Menu size={22} />
            </button>
            <span>工作空間</span>
            <ChevronRight size={13} />
            <strong>{titles[view.page]}</strong>
          </div>
          <div className="topbar-right">
            <span className="saved">
              <span
                className={`status-dot ${saveState.includes("失敗") ? "bad" : ""}`}
              />
              {saveState}
            </span>
            <span className="service-pill">
              <Cloud size={14} />
              {token ? "服務已登入" : "AI 未連線"}
            </span>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                {view.page === "projects"
                  ? "PRESS RELEASE WORKSPACE"
                  : project
                    ? project.brand + " / " + project.name
                    : "WORKSPACE SETTINGS"}
              </div>
              <h1>
                {titles[view.page]}
                <span className="title-dot">.</span>
              </h1>
              <p>
                {view.page === "projects"
                  ? "讓每一次發稿，都有可追溯的成果。"
                  : view.page === "settings"
                    ? "管理瀏覽器資料、備份與 Cloudflare 後端連線。"
                    : project
                      ? `${formatDate(project.periodStart)} — ${formatDate(project.periodEnd)} · 台北時間`
                      : "請先選擇一個發稿專案。"}
              </p>
            </div>
            {view.page === "projects" ? (
              <button
                className="primary"
                onClick={() => setModal({ type: "project" })}
              >
                <Plus size={17} />
                建立發稿專案
              </button>
            ) : project && view.page !== "settings" ? (
              <button
                className="secondary"
                onClick={() => setModal({ type: "project", id: project.id })}
              >
                <Cog size={16} />
                專案設定
              </button>
            ) : null}
          </div>
          {view.page === "projects" && (
            <>
              <div className="workspace-intro">
                <div className="intro-copy">
                  <span className="eyebrow">從露出整理，到訊息成效</span>
                  <h2>看見報導，也看清訊息的去向。</h2>
                  <p>
                    將新聞稿、報導與覆核結果集中在同一個專案，
                    <br className="desktop-only" />
                    用有依據的數據，回顧每次溝通的成果。
                  </p>
                  <div className="intro-tags">
                    <span>
                      <FileText size={14} />
                      報導匯入
                    </span>
                    <span>
                      <ClipboardCheck size={14} />
                      證據覆核
                    </span>
                    <span>
                      <BarChart3 size={14} />
                      成效報告
                    </span>
                  </div>
                </div>
                <div className="intro-illustration" aria-hidden="true">
                  <div className="orbit orbit-one" />
                  <div className="orbit orbit-two" />
                  <div className="illustration-document">
                    <span />
                    <span />
                    <span />
                    <div className="mini-bars">
                      <i />
                      <i />
                      <i />
                      <i />
                      <i />
                    </div>
                    <div className="mini-check">
                      <Check size={16} />
                    </div>
                  </div>
                  <div className="floating-chip">
                    <Radio size={16} />
                    訊息有跡可循
                  </div>
                </div>
              </div>
              <div className="stats-grid">
                <Metric
                  title="進行中專案"
                  value={
                    db.projects.filter((p) => p.status === "active").length
                  }
                  note="持續觀測發稿成果"
                  icon={FolderOpen}
                />
                <Metric
                  title="已確認露出"
                  value={
                    new Set(
                      db.links
                        .filter((l) => l.inclusionStatus === "included")
                        .filter((l) => {
                          const p = db.projects.find(
                            (p) => p.id === l.projectId,
                          )!;
                          const a = db.articles.find(
                            (a) => a.id === l.articleId,
                          )!;
                          return (
                            p.status === "active" &&
                            a.publishedAt >= p.periodStart &&
                            a.publishedAt <= p.periodEnd &&
                            !!a.publishedAt
                          );
                        })
                        .map((l) => l.articleId),
                    ).size
                  }
                  note="進行中專案跨案按報導去重"
                  icon={FileText}
                />
                <Metric
                  title="待確認報導"
                  value={
                    db.links.filter(
                      (l) =>
                        l.inclusionStatus === "pending" &&
                        db.projects.find((p) => p.id === l.projectId)
                          ?.status === "active",
                    ).length
                  }
                  note="確認歸屬後才納入統計"
                  icon={ClipboardCheck}
                />
                <Metric
                  title="已保存報告"
                  value={db.reports.length}
                  note="保留產出當下的資料快照"
                  icon={Layers3}
                />
              </div>
              <section className="panel">
                <div className="panel-heading">
                  <div>
                    <h2>
                      我的發稿專案{" "}
                      <span className="count">{projects.length}</span>
                    </h2>
                    <p>以每一篇已發出的新聞稿為起點。</p>
                  </div>
                  <div className="toolbar">
                    <label className="search">
                      <Search size={16} />
                      <input
                        aria-label="搜尋專案"
                        placeholder="搜尋專案或品牌"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                    </label>
                    <label className="check-label">
                      <input
                        type="checkbox"
                        checked={showArchived}
                        onChange={(e) => setShowArchived(e.target.checked)}
                      />
                      包含封存
                    </label>
                  </div>
                </div>
                {projects.length ? (
                  <div className="project-grid">
                    {projects.map((p) => {
                      const pm = metrics(db, p);
                      const pending = db.links.filter(
                        (l) =>
                          l.projectId === p.id &&
                          l.inclusionStatus === "pending",
                      ).length;
                      return (
                        <button
                          className="project-card"
                          key={p.id}
                          onClick={() => nav("overview", p.id)}
                        >
                          <div className="between">
                            <span className="project-icon">
                              <FolderOpen size={22} />
                            </span>
                            <Badge
                              text={
                                p.status === "archived" ? "已封存" : "進行中"
                              }
                              tone={
                                p.status === "archived" ? "neutral" : "blue"
                              }
                            />
                          </div>
                          <small>{p.brand}</small>
                          <h3>{p.name}</h3>
                          <p>發稿 {taipeiDate(p.releaseAt)}</p>
                          <div className="project-card-stats">
                            <div>
                              <strong>{pm.N}</strong>
                              <span>確認露出</span>
                            </div>
                            <div>
                              <strong>{pending + pm.pendingReview}</strong>
                              <span>待確認／覆核</span>
                            </div>
                            <ArrowRight size={18} />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <Empty
                    title={search ? "沒有符合的專案" : "開始你的第一個發稿專案"}
                    action={
                      <button
                        className="primary"
                        onClick={() => setModal({ type: "project" })}
                      >
                        <Plus size={16} />
                        建立發稿專案
                      </button>
                    }
                  >
                    貼上新聞稿定稿、設定核心訊息，再匯入相關報導。
                    <br />
                    沒有 AI 金鑰，也能完成整理、覆核與匯出。
                  </Empty>
                )}
              </section>
              <div className="footer-note">
                <ShieldCheck size={15} />
                專案資料保存在此瀏覽器；AI
                與擷取只處理當次請求，請定期下載資料備份。
              </div>
            </>
          )}
          {view.page === "overview" && project && m && (
            <>
              <div className="stats-grid">
                <Metric
                  title="已確認露出 N"
                  value={m.N}
                  note={`${m.websites} 個刊登網站 · ${m.groups} 個同文群組`}
                  icon={FileText}
                />
                <Metric
                  title="人工覆核完成 B"
                  value={m.B}
                  note="完整內文＋目前版本覆核完成"
                  icon={ClipboardCheck}
                />
                <Metric
                  title="分析覆蓋率"
                  value={ratio(m.B, m.N)}
                  note={`${m.B} / ${m.N} 篇 · 待補內文 ${m.missingBody}`}
                  icon={BarChart3}
                />
                <Metric
                  title="待人工覆核"
                  value={m.pendingReview}
                  note={`過時覆核 ${m.stale} · 日期待確認 ${m.missingDate}`}
                  icon={Layers3}
                />
              </div>
              <div className="notice between">
                <span>
                  統計只含觀測期間內人工收錄的報導。AI
                  結果經人工覆核後，才納入正式訊息比例。
                </span>
                <button className="text-button" onClick={() => nav("articles")}>
                  整理露出 <ArrowRight size={14} />
                </button>
              </div>
              <div className="dashboard-grid">
                <section className="panel">
                  <div className="panel-heading">
                    <div>
                      <h2>核心訊息採用</h2>
                      <p>完整與部分採用分列 · 母體 B = {m.B}</p>
                    </div>
                    <span className="legend">
                      <i />
                      完整 <i />
                      部分
                    </span>
                  </div>
                  <div className="adoption-list">
                    {m.messages.map((x, i) => (
                      <div className="adoption-item" key={x.id}>
                        <div className="between">
                          <strong>
                            <span className="muted">0{i + 1}</span> {x.text}
                          </strong>
                          <b>{ratio(x.full, m.B)}</b>
                        </div>
                        <div className="progress-bar">
                          <span
                            style={{
                              width: `${m.B ? (x.full / m.B) * 100 : 0}%`,
                            }}
                          />
                          <span
                            style={{
                              width: `${m.B ? (x.partial / m.B) * 100 : 0}%`,
                            }}
                          />
                        </div>
                        <small>
                          完整 {x.full}/{m.B} · 部分 {x.partial}/{m.B}（
                          {ratio(x.partial, m.B)}） · 未採用 {x.absent} ·
                          無法判定 {x.undetermined}
                        </small>
                      </div>
                    ))}
                  </div>
                </section>
                <section className="panel">
                  <div className="panel-heading">
                    <div>
                      <h2>資料處理進度</h2>
                      <p>每一步都保留判斷依據。</p>
                    </div>
                  </div>
                  <div className="pipeline">
                    {[
                      ["確認收錄", m.N, "納入觀測期間的報導"],
                      ["待補完整內文", m.missingBody, "可列露出，不判採用"],
                      [
                        "待分析／人工判讀",
                        m.pendingAnalysis,
                        "可直接進行人工覆核",
                      ],
                      ["待覆核", m.pendingReview, "含尚未分析的完整內文"],
                      ["覆核完成", m.B, "納入正式訊息採用比例"],
                    ].map(([name, count, hint], i) => (
                      <div key={name}>
                        <span className={`step ${i === 4 ? "done" : ""}`}>
                          {i === 4 ? <Check size={14} /> : i + 1}
                        </span>
                        <div>
                          <strong>{name}</strong>
                          <small>{hint}</small>
                        </div>
                        <b>{count}</b>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
              <div className="dashboard-grid">
                <section className="panel">
                  <div className="panel-heading">
                    <div>
                      <h2>每日露出趨勢</h2>
                      <p>依台北時間的刊登日期計算</p>
                    </div>
                  </div>
                  {m.trend.length ? (
                    <div className="trend-chart">
                      {m.trend.map((x) => (
                        <div key={x.date} className="trend-column">
                          <b>{x.count}</b>
                          <div
                            style={{
                              height: Math.max(
                                6,
                                (x.count /
                                  Math.max(...m.trend.map((x) => x.count))) *
                                  130,
                              ),
                            }}
                          />
                          <small>{x.date.slice(5)}</small>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="chart-empty">
                      <BarChart3 size={25} />
                      <span>確認收錄後將顯示露出趨勢</span>
                    </div>
                  )}
                </section>
                <section className="panel">
                  <div className="panel-heading">
                    <div>
                      <h2>刊登媒體</h2>
                      <p>依刊登網域統一；供稿媒體另存</p>
                    </div>
                  </div>
                  <div className="media-list">
                    {m.media.length ? (
                      m.media.map((x, i) => (
                        <div key={x.name}>
                          <span>{String(i + 1).padStart(2, "0")}</span>
                          <strong>{x.name}</strong>
                          <b>{x.count} 篇</b>
                        </div>
                      ))
                    ) : (
                      <p className="muted">尚無已確認露出。</p>
                    )}
                    {project.trackedMedia.map((name) => (
                      <div key={name}>
                        <strong>{name}</strong>
                        <span>
                          {linkRows.some(
                            (r) =>
                              r.link.inclusionStatus === "included" &&
                              r.article.publishedAt >= project.periodStart &&
                              r.article.publishedAt <= project.periodEnd &&
                              [
                                r.article.publisher,
                                r.article.publisherDomain,
                              ].some(
                                (v) => v.toLowerCase() === name.toLowerCase(),
                              ),
                          )
                            ? "已查得"
                            : "尚未查得"}
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
              <section className="panel">
                <div className="panel-heading">
                  <div>
                    <h2>補充成效指標</h2>
                    <p>訊息與引言使用 B；品牌標題使用有完整標題的 N。</p>
                  </div>
                </div>
                <div className="supplement-grid">
                  <div>
                    <span>品牌標題出現率</span>
                    <strong>{ratio(m.titleBrand, m.titleDenominator)}</strong>
                    <small>
                      {m.titleBrand}/{m.titleDenominator} 篇
                    </small>
                  </div>
                  <div>
                    <span>主管引言採用率</span>
                    <strong>{ratio(m.quote, m.B)}</strong>
                    <small>
                      原句 {m.quoteExact} · 轉述 {m.quoteParaphrase} · 皆有{" "}
                      {m.quoteBoth}
                    </small>
                  </div>
                  <div>
                    <span>需處理資訊偏差</span>
                    <strong>{m.discrepancies} 篇</strong>
                    <small>已人工確認需處理／處理中</small>
                  </div>
                  <div>
                    <span>原始供稿媒體</span>
                    <strong>{m.originalPublishers} 家</strong>
                    <small>依已填寫的原始來源計算</small>
                  </div>
                </div>
              </section>
              <details className="panel details-panel">
                <summary>同文群組代表稿與報導類型</summary>
                <p>
                  已覆核代表稿 {m.groupB} 群／全部 {m.groups} 群；待處理{" "}
                  {m.groupPending}{" "}
                  群。每群採第一筆完整且已覆核的稿件，訊息差異影響判斷時請先拆群。
                </p>
                {m.groupMessages.map((x) => (
                  <p key={x.id}>
                    {x.text}：完整 {x.full}/{m.groupB}（
                    {ratio(x.full, m.groupB)}）；部分 {x.partial}/{m.groupB}（
                    {ratio(x.partial, m.groupB)}）。
                  </p>
                ))}
                <p>
                  報導類型（N={m.N}）：
                  {Object.entries(m.types)
                    .map(([k, v]) => `${labels[k]} ${v} 篇`)
                    .join("；") || "尚無資料"}
                </p>
              </details>
            </>
          )}
          {view.page === "articles" && project && (
            <>
              <div className="article-actions">
                <div className="tabs">
                  {[
                    ["all", "全部", linkRows.length],
                    [
                      "pending",
                      "待確認",
                      linkRows.filter(
                        (r) => r.link.inclusionStatus === "pending",
                      ).length,
                    ],
                    [
                      "included",
                      "已收錄",
                      linkRows.filter(
                        (r) => r.link.inclusionStatus === "included",
                      ).length,
                    ],
                    [
                      "excluded",
                      "已排除",
                      linkRows.filter(
                        (r) => r.link.inclusionStatus === "excluded",
                      ).length,
                    ],
                  ].map(([key, name, count]) => (
                    <button
                      key={key}
                      className={filter === key ? "selected" : ""}
                      onClick={() => {
                        setFilter(String(key));
                        setSelected([]);
                      }}
                    >
                      {name}
                      <span>{count}</span>
                    </button>
                  ))}
                </div>
                <div className="button-row">
                  <button
                    className="secondary"
                    onClick={() => setModal({ type: "import" })}
                  >
                    <Upload size={16} />
                    匯入 CSV
                  </button>
                  <button
                    className="primary"
                    onClick={() => setModal({ type: "article" })}
                  >
                    <Plus size={16} />
                    新增報導
                  </button>
                </div>
              </div>
              <section className="panel">
                <div className="table-toolbar">
                  <label className="search">
                    <Search size={16} />
                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="搜尋標題、媒體、網址"
                      aria-label="搜尋報導"
                    />
                  </label>
                  <div className="toolbar">
                    <select
                      aria-label="報導篩選"
                      value={filter}
                      onChange={(e) => setFilter(e.target.value)}
                    >
                      {[
                        ["all", "所有狀態"],
                        ["pending", "待確認"],
                        ["included", "已收錄"],
                        ["excluded", "已排除"],
                        ["missing", "待補完整內文"],
                        ["unreviewed", "尚未覆核"],
                      ].map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label="排序"
                      value={sort}
                      onChange={(e) => setSort(e.target.value)}
                    >
                      <option value="date-desc">日期由新到舊</option>
                      <option value="date-asc">日期由舊到新</option>
                      <option value="title">標題排序</option>
                    </select>
                  </div>
                </div>
                {selected.length > 0 && (
                  <div className="batch-toolbar">
                    <strong>已選 {selected.length} 篇</strong>
                    <button onClick={() => batch("included")}>批次收錄</button>
                    <button onClick={() => batch("excluded")}>批次排除</button>
                    <button onClick={() => batch("pending")}>重設待確認</button>
                    <button
                      disabled={selected.length < 2}
                      onClick={() => grouping()}
                    >
                      同文分組
                    </button>
                    <button onClick={() => grouping(true)}>拆分群組</button>
                    <button disabled={selected.length < 2} onClick={merge}>
                      合併同筆重複
                    </button>
                  </div>
                )}
                {undo && (
                  <div className="notice between">
                    <span>上次操作：{undo.label}</span>
                    <button
                      className="text-button"
                      onClick={() => {
                        mutate((d) => {
                          for (const old of undo.links) {
                            const l = d.links.find((x) => x.id === old.id);
                            if (l)
                              Object.assign(l, {
                                groupId: old.groupId,
                                inclusionStatus: old.inclusionStatus,
                                inclusionReason: old.inclusionReason,
                              });
                          }
                          log(d, "撤銷" + undo.label);
                        });
                        setUndo(null);
                      }}
                    >
                      <Undo2 size={14} />
                      撤銷
                    </button>
                  </div>
                )}
                {filtered.length ? (
                  <div className="table-scroll">
                    <table className="articles-table">
                      <thead>
                        <tr>
                          <th>
                            <input
                              type="checkbox"
                              aria-label="全選目前清單"
                              checked={filtered.every((r) =>
                                selected.includes(r.link.id),
                              )}
                              onChange={(e) =>
                                setSelected(
                                  e.target.checked
                                    ? filtered.map((r) => r.link.id)
                                    : [],
                                )
                              }
                            />
                          </th>
                          <th>報導／刊登資訊</th>
                          <th>歸屬確認</th>
                          <th>內文／覆核</th>
                          <th>類型／群組</th>
                          <th>操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map(({ link: l, article: a }) => {
                          const body = db.bodies.find(
                            (b) => b.id === a.bodyId,
                          )!;
                          const review = currentReview(db, project, a);
                          const ai = currentAnalysis(db, project, a);
                          const hasOld = db.reviews.some(
                            (r) =>
                              r.articleId === a.id &&
                              r.projectId === project.id,
                          );
                          return (
                            <tr key={l.id}>
                              <td>
                                <input
                                  type="checkbox"
                                  aria-label={`選取 ${a.title}`}
                                  checked={selected.includes(l.id)}
                                  onChange={(e) =>
                                    setSelected(
                                      e.target.checked
                                        ? [...selected, l.id]
                                        : selected.filter((id) => id !== l.id),
                                    )
                                  }
                                />
                              </td>
                              <td className="article-title-cell">
                                <button
                                  className="article-title"
                                  onClick={() =>
                                    setModal({ type: "review", id: a.id })
                                  }
                                >
                                  {a.title}
                                </button>
                                <div className="article-meta">
                                  {a.publisher ||
                                    a.publisherDomain ||
                                    "媒體待確認"}
                                  <span>·</span>
                                  {formatDate(a.publishedAt)}
                                </div>
                                {a.canonicalUrl.includes("news.google.com") && (
                                  <small className="warning-text">
                                    聚合網址，待確認原站
                                  </small>
                                )}
                                {a.publishedAt &&
                                  (a.publishedAt < project.periodStart ||
                                    a.publishedAt > project.periodEnd) && (
                                    <small className="warning-text">
                                      觀測期間外，不納入期間統計
                                    </small>
                                  )}
                                <small className="muted">
                                  發現：{a.discoverySources.join("、")}
                                </small>
                              </td>
                              <td>
                                <select
                                  aria-label={`${a.title} 歸屬`}
                                  value={l.inclusionStatus}
                                  className={`status-select ${l.inclusionStatus}`}
                                  onChange={(e) =>
                                    mutate((d) => {
                                      const link = d.links.find(
                                        (x) => x.id === l.id,
                                      )!;
                                      link.inclusionStatus = e.target
                                        .value as Inclusion;
                                      link.inclusionReason = "人工確認歸屬";
                                      link.updatedAt = now();
                                    })
                                  }
                                >
                                  {["pending", "included", "excluded"].map(
                                    (k) => (
                                      <option key={k} value={k}>
                                        {labels[k]}
                                      </option>
                                    ),
                                  )}
                                </select>
                                <small className="muted" title={l.aiReason}>
                                  {l.aiRecommendation === "pending"
                                    ? "AI 尚未建議"
                                    : `AI：${l.aiRecommendation === "included" ? "建議收錄" : l.aiRecommendation === "excluded" ? "建議排除" : "待確認"}`}
                                </small>
                              </td>
                              <td>
                                <Badge
                                  text={
                                    body.bodyStatus === "full"
                                      ? "完整內文"
                                      : labels[body.bodyStatus]
                                  }
                                  tone={
                                    body.bodyStatus === "full"
                                      ? "blue"
                                      : "neutral"
                                  }
                                />
                                <small
                                  className={
                                    review
                                      ? "success-text"
                                      : hasOld
                                        ? "warning-text"
                                        : "muted"
                                  }
                                >
                                  {review
                                    ? "✓ 人工已覆核"
                                    : hasOld
                                      ? "版本變更 · 需重新覆核"
                                      : ai?.runStatus === "completed"
                                        ? "AI 完成 · 待覆核"
                                        : ai?.runStatus === "failed"
                                          ? "AI 失敗 · 可重試"
                                          : ai?.runStatus === "running"
                                            ? "分析中"
                                            : "尚未分析／覆核"}
                                </small>
                                {ai?.error && (
                                  <small className="error" title={ai.error}>
                                    服務錯誤
                                  </small>
                                )}
                              </td>
                              <td>
                                <select
                                  aria-label={`${a.title} 報導類型`}
                                  value={l.reportType}
                                  onChange={(e) =>
                                    mutate((d) => {
                                      d.links.find(
                                        (x) => x.id === l.id,
                                      )!.reportType = e.target
                                        .value as Link["reportType"];
                                    })
                                  }
                                >
                                  {[
                                    "undetermined",
                                    "near_release",
                                    "rewritten",
                                    "extended_reporting",
                                  ].map((k) => (
                                    <option key={k} value={k}>
                                      {labels[k]}
                                    </option>
                                  ))}
                                </select>
                                <small className="muted">
                                  {l.groupId
                                    ? `群組 ${l.groupId.slice(0, 6)}`
                                    : "獨立稿件"}
                                </small>
                              </td>
                              <td>
                                <div className="row-actions">
                                  <button
                                    className="text-button"
                                    onClick={() =>
                                      setModal({ type: "review", id: a.id })
                                    }
                                  >
                                    覆核 <ChevronRight size={13} />
                                  </button>
                                  <button
                                    className="text-button muted"
                                    onClick={() =>
                                      setModal({ type: "article", id: a.id })
                                    }
                                  >
                                    編輯
                                  </button>
                                  <button
                                    className="text-button muted"
                                    disabled={!!busy}
                                    onClick={() => runAI(a)}
                                  >
                                    {busy === a.id ? (
                                      <LoaderCircle
                                        size={13}
                                        className="spin"
                                      />
                                    ) : (
                                      <Sparkles size={13} />
                                    )}
                                    AI 分析
                                  </button>
                                  <button
                                    className="text-button muted"
                                    disabled={!!busy}
                                    onClick={() => extract(a)}
                                  >
                                    擷取內文
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <Empty
                    icon={FileText}
                    title={
                      linkRows.length
                        ? "沒有符合條件的報導"
                        : "把第一篇露出帶進來"
                    }
                    action={
                      <div className="button-row">
                        <button
                          className="secondary"
                          onClick={() => setModal({ type: "import" })}
                        >
                          <Upload size={16} />
                          匯入 CSV
                        </button>
                        <button
                          className="primary"
                          onClick={() => setModal({ type: "article" })}
                        >
                          <Plus size={16} />
                          手動新增
                        </button>
                      </div>
                    }
                  >
                    支援既有監測資料與手動輸入；匯入後先確認專案歸屬。
                  </Empty>
                )}
                <div className="table-footer">
                  共 {filtered.length} 筆 · 同文轉載保留各刊登頁面 ·
                  相同網址自動去重
                </div>
              </section>
              <div className="notice">
                <BookOpen size={17} />
                同文分組保留各篇露出；「合併同筆重複」會保留第一筆並排除其餘選取項目，請確認它們是同一則刊登資料。
              </div>
            </>
          )}
          {view.page === "reports" && project && m && (
            <>
              <section className="panel report-builder">
                <div className="panel-heading">
                  <div>
                    <h2>建立階段／結案報告</h2>
                    <p>先凍結資料，再以同一份快照匯出 Word 與 CSV。</p>
                  </div>
                  <Badge text="人工確認資料" tone="blue" />
                </div>
                <div className="report-builder-content">
                  <div className="snapshot-preview">
                    <div>
                      <strong>{m.N}</strong>
                      <span>確認露出</span>
                    </div>
                    <div>
                      <strong>{m.B}</strong>
                      <span>覆核完成</span>
                    </div>
                    <div>
                      <strong>{ratio(m.B, m.N)}</strong>
                      <span>分析覆蓋率</span>
                    </div>
                  </div>
                  <Field
                    label="觀察與後續建議"
                    hint="摘要不會自動產生因果結論，可自行撰寫或連線後請 AI 草擬。"
                  >
                    <textarea
                      rows={5}
                      value={summary}
                      onChange={(e) => setSummary(e.target.value)}
                      placeholder="記錄核心訊息表現、資料限制與下次發稿可調整之處…"
                    />
                  </Field>
                  <div className="between">
                    <button
                      className="secondary"
                      disabled={!!busy}
                      onClick={async () => {
                        if (!token) {
                          notify("請先設定並登入 Cloudflare 後端");
                          return;
                        }
                        setBusy("summary");
                        try {
                          const result = await summarize(
                            db.settings.apiUrl,
                            token,
                            createSnapshot(db, project, summary),
                          );
                          setSummary(result.summary);
                          notify("已產生 AI 草稿，請檢視後再保存快照。");
                        } catch (e) {
                          notify((e as Error).message);
                        } finally {
                          setBusy("");
                        }
                      }}
                    >
                      <Sparkles size={16} />
                      AI 草擬觀察
                    </button>
                    <button className="primary" onClick={createReport}>
                      <Layers3 size={16} />
                      保存報告快照
                    </button>
                  </div>
                </div>
              </section>
              <section className="panel">
                <div className="panel-heading">
                  <div>
                    <h2>
                      歷次報告{" "}
                      <span className="count">
                        {
                          db.reports.filter((r) => r.projectId === project.id)
                            .length
                        }
                      </span>
                    </h2>
                    <p>後續修改訊息、內文或覆核，不會改變已保存的快照。</p>
                  </div>
                </div>
                {db.reports.filter((r) => r.projectId === project.id).length ? (
                  <div className="report-list">
                    {db.reports
                      .filter((r) => r.projectId === project.id)
                      .slice()
                      .reverse()
                      .map((s) => (
                        <div className="report-row" key={s.id}>
                          <span className="report-icon">
                            <FileText size={23} />
                          </span>
                          <div className="grow">
                            <h3>{s.project.name} · 成效報告</h3>
                            <p>
                              {formatDate(s.createdAt)} · N={s.frozenMetrics.N}
                              ／B={s.frozenMetrics.B} · 快照 {s.id.slice(0, 8)}
                            </p>
                            <details>
                              <summary>檢視快照摘要與統計</summary>
                              <p>{s.summary || "尚未填寫摘要"}</p>
                              {s.frozenMetrics.messages.map((x) => (
                                <p key={x.id}>
                                  {x.text}：完整 {x.full}/{s.frozenMetrics.B}（
                                  {ratio(x.full, s.frozenMetrics.B)}），部分{" "}
                                  {x.partial}/{s.frozenMetrics.B}（
                                  {ratio(x.partial, s.frozenMetrics.B)}）
                                </p>
                              ))}
                            </details>
                          </div>
                          <div className="button-row">
                            <button
                              className="secondary"
                              onClick={() => exportCSV(s)}
                            >
                              <Download size={15} />
                              CSV
                            </button>
                            <button
                              className="primary"
                              disabled={!!busy}
                              onClick={async () => {
                                setBusy(s.id);
                                try {
                                  await exportWord(s);
                                } catch {
                                  notify("Word 匯出失敗，請重試");
                                } finally {
                                  setBusy("");
                                }
                              }}
                            >
                              <FileDown size={15} />
                              Word 報告
                            </button>
                          </div>
                        </div>
                      ))}
                  </div>
                ) : (
                  <Empty icon={Layers3} title="保留每個階段的成果">
                    保存第一份快照後，就能下載可編輯的 Word 報告與 CSV 明細。
                  </Empty>
                )}
              </section>
            </>
          )}
          {view.page === "settings" && (
            <div className="settings-grid">
              <section className="panel">
                <div className="panel-heading">
                  <div>
                    <h2>
                      <DatabaseIcon size={19} />
                      本機資料與備份
                    </h2>
                    <p>工作資料不會提交至 GitHub 儲存庫。</p>
                  </div>
                </div>
                <div className="settings-content">
                  <div className="storage-summary">
                    <ShieldCheck size={25} />
                    <div>
                      <strong>{saveState}</strong>
                      <p>
                        {db.projects.length} 個專案 · {db.articles.length}{" "}
                        篇報導 · {db.reports.length} 份報告
                      </p>
                    </div>
                  </div>
                  <p className="muted">
                    資料保存在目前瀏覽器的
                    IndexedDB。更換電腦、瀏覽器或網址時，請先備份再還原。清除網站資料會移除本機紀錄。
                  </p>
                  <div className="button-row">
                    <button
                      className="primary"
                      onClick={() =>
                        download(
                          JSON.stringify(db, null, 2),
                          `PR備份-${taipeiDate(now())}.json`,
                        )
                      }
                    >
                      <Download size={16} />
                      下載完整 JSON 備份
                    </button>
                    <button
                      className="secondary"
                      onClick={() => restoreRef.current?.click()}
                    >
                      <Upload size={16} />
                      還原備份
                    </button>
                    <input
                      ref={restoreRef}
                      type="file"
                      accept=".json,application/json"
                      hidden
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        if (!file) return;
                        try {
                          setRestore(
                            validateBackup(JSON.parse(await file.text())),
                          );
                        } catch (err) {
                          notify("無法還原：" + (err as Error).message);
                        }
                      }}
                    />
                  </div>
                  {restore && (
                    <div className="notice warning">
                      <p>
                        備份包含 {restore.projects.length} 個專案、
                        {restore.articles.length} 篇報導、
                        {restore.reports.length}{" "}
                        份快照。還原會取代目前資料，請先下載備份。
                      </p>
                      <div className="button-row">
                        <button
                          className="primary"
                          onClick={() => {
                            commit(restore);
                            setRestore(null);
                            setToken("");
                            notify("備份已還原");
                            nav("projects");
                          }}
                        >
                          確認取代並還原
                        </button>
                        <button
                          className="secondary"
                          onClick={() => setRestore(null)}
                        >
                          取消
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </section>
              <section className="panel">
                <div className="panel-heading">
                  <div>
                    <h2>
                      <Cloud size={19} />
                      Cloudflare 服務
                    </h2>
                    <p>AI 分析與新聞擷取使用獨立後端。</p>
                  </div>
                  <Badge text={service} tone={token ? "green" : "neutral"} />
                </div>
                <form
                  className="settings-content"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    const url = String(f.get("apiUrl"))
                      .trim()
                      .replace(/\/$/, "");
                    try {
                      if (url) {
                        const u = new URL(url);
                        if (
                          u.protocol !== "https:" &&
                          !["localhost", "127.0.0.1"].includes(u.hostname)
                        )
                          throw new Error();
                        if (
                          u.username ||
                          u.password ||
                          u.search ||
                          u.hash ||
                          u.pathname !== "/"
                        )
                          throw new Error();
                      }
                      mutate((d) => {
                        d.settings.apiUrl = url;
                      });
                      setToken("");
                      setService("尚未連線");
                      notify("已儲存後端網址");
                    } catch {
                      notify(
                        "請填寫 HTTPS 後端根網址，不含路徑、帳密或查詢參數",
                      );
                    }
                  }}
                >
                  <Field
                    label="後端網址"
                    hint="例如 https://pr-media-api.你的子網域.workers.dev"
                  >
                    <input
                      type="url"
                      name="apiUrl"
                      key={db.settings.apiUrl}
                      defaultValue={db.settings.apiUrl}
                      placeholder="https://pr-media-api.example.com"
                    />
                  </Field>
                  <div className="button-row">
                    <button className="primary">儲存設定</button>
                    <button
                      type="button"
                      className="secondary"
                      onClick={async () => {
                        try {
                          const health = await request<{
                            aiConfigured: boolean;
                            authConfigured: boolean;
                            extractionConfigured: boolean;
                          }>(db.settings.apiUrl, "", "/api/health");
                          setService(
                            health.aiConfigured
                              ? "AI 已設定，等待登入"
                              : "後端正常 · AI 未設定",
                          );
                          notify(
                            `後端正常；登入${health.authConfigured ? "已設定" : "尚未設定"}；AI ${health.aiConfigured ? "已設定" : "未設定"}；擷取${health.extractionConfigured ? "已設定" : "未設定"}`,
                          );
                        } catch (err) {
                          setService("連線失敗");
                          notify((err as Error).message);
                        }
                      }}
                    >
                      測試連線
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => {
                        if (!db.settings.apiUrl) {
                          notify("請先儲存後端網址");
                          return;
                        }
                        authNonce.current = uid();
                        window.open(
                          db.settings.apiUrl +
                            "/auth?origin=" +
                            encodeURIComponent(location.origin) +
                            "&nonce=" +
                            encodeURIComponent(authNonce.current),
                          "pr-cloudflare-login",
                          "width=540,height=700",
                        );
                      }}
                    >
                      登入 Cloudflare
                    </button>
                    {token && (
                      <button
                        type="button"
                        className="text-button"
                        onClick={() => {
                          setToken("");
                          setService("已登出");
                        }}
                      >
                        登出服務
                      </button>
                    )}
                  </div>
                  <div className="service-access">
                    <Field
                      label="工作空間服務存取碼"
                      hint="由後端驗證，只保留於本次頁面；請勿輸入 AI 金鑰。"
                    >
                      <input
                        id="service-access-code"
                        type="password"
                        autoComplete="off"
                        placeholder="貼上專用服務存取碼"
                      />
                    </Field>
                    <button
                      type="button"
                      className="secondary"
                      onClick={async () => {
                        const el = document.getElementById(
                          "service-access-code",
                        ) as HTMLInputElement;
                        const code = el.value.trim();
                        if (!code) {
                          notify("請先貼上服務存取碼");
                          return;
                        }
                        try {
                          await request(
                            db.settings.apiUrl,
                            code,
                            "/api/session",
                            {},
                          );
                          setToken(code);
                          el.value = "";
                          setService("服務已連線");
                          notify("服務存取驗證完成，可以使用 AI 與新聞擷取");
                        } catch (err) {
                          notify((err as Error).message);
                        }
                      }}
                    >
                      驗證存取碼並連線
                    </button>
                  </div>
                  <div className="notice">
                    AI 使用 Cloudflare Workers AI 綁定，或由 Cloudflare Worker
                    Secrets
                    設定其他服務金鑰。服務登入憑證只存在本次網頁記憶體，重新整理後需再次登入。目前沒有雲端同步或多人協作。
                  </div>
                  <details>
                    <summary>後端部署與連線步驟</summary>
                    <ol>
                      <li>
                        依儲存庫 README 部署 worker/，填寫允許的前端來源，並設定
                        SERVICE_ACCESS_KEY。
                      </li>
                      <li>
                        使用專用存取碼連線；也可選用 Cloudflare Access，只保護
                        /auth* 並設定 team domain、audience 與使用者。
                      </li>
                      <li>
                        預設使用 Workers AI，無須另填 AI
                        金鑰；可調整模型及允許擷取的新聞網域。
                      </li>
                      <li>儲存網址後測試連線，再登入以使用 AI 與擷取。</li>
                    </ol>
                  </details>
                </form>
              </section>
              <section className="panel">
                <div className="panel-heading">
                  <div>
                    <h2>操作與統計口徑</h2>
                    <p>每份成效資料都能回到來源。</p>
                  </div>
                </div>
                <div className="settings-content">
                  <ol className="help-list">
                    <li>建立發稿專案，確認新聞稿定稿、核心訊息與觀測期間。</li>
                    <li>匯入 CSV 或手動新增，檢查日期與來源後人工收錄。</li>
                    <li>確認完整內文，逐項填入判斷、證據及理由，完成覆核。</li>
                    <li>檢查成效總覽，保存快照後匯出 Word 與 CSV。</li>
                  </ol>
                  <p className="muted">
                    N＝期間內確認收錄並去重的篇數。B＝N
                    中完整內文、目前版本人工覆核完成的篇數。完整／部分採用分開除以
                    B；分母為零時顯示尚無足夠資料。同文轉載各計一篇，另列群組數。
                  </p>
                  <div className="button-row">
                    <a
                      className="secondary"
                      href="https://yin0612.github.io/MediaMonitoring/#/"
                      target="_blank"
                      rel="noreferrer"
                    >
                      MediaMonitoring <ArrowRight size={14} />
                    </a>
                    <a
                      className="secondary"
                      href="https://yin0612.github.io/for_SoftWorld/#hero"
                      target="_blank"
                      rel="noreferrer"
                    >
                      產業監測 <ArrowRight size={14} />
                    </a>
                  </div>
                  <small className="muted">
                    既有監測網站目前透過 CSV
                    或手動匯入銜接，尚未串接自動資料介面。
                  </small>
                </div>
              </section>
              <section className="panel">
                <div className="panel-heading">
                  <div>
                    <h2>近期操作紀錄</h2>
                    <p>歸屬、分組與報告操作的追溯紀錄。</p>
                  </div>
                </div>
                <div className="activity-list">
                  {db.activities.length ? (
                    db.activities.slice(0, 15).map((a) => (
                      <div key={a.id}>
                        <span className="status-dot" />
                        <p>
                          {a.label}
                          <small>{formatDate(a.at)}</small>
                        </p>
                      </div>
                    ))
                  ) : (
                    <p className="muted">開始作業後會記錄在這裡。</p>
                  )}
                </div>
              </section>
            </div>
          )}
          {!project &&
            ["overview", "articles", "reports"].includes(view.page) && (
              <Empty
                title="請先選擇發稿專案"
                action={
                  <button className="primary" onClick={() => nav("projects")}>
                    前往專案列表
                  </button>
                }
              >
                從專案列表開啟一個專案，或建立新的發稿專案。
              </Empty>
            )}
          <footer className="page-footer">
            <span>
              訊息觀測室 <span>PR Media Intelligence</span>
            </span>
            <span>資料有依據，溝通有方向。</span>
          </footer>
        </main>
      </div>
      {toast && (
        <div className="toast" role="status">
          <span>{toast}</span>
          <button
            className="icon-button"
            onClick={() => setToast("")}
            aria-label="關閉通知"
          >
            <X size={16} />
          </button>
        </div>
      )}
      {modal && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setModal(null);
          }}
        >
          <section
            className={`modal ${modal.type === "review" ? "wide" : ""}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
          >
            <div className="modal-heading">
              <div>
                <span className="eyebrow">
                  {modal.type === "review" ? "EVIDENCE & REVIEW" : "WORKSPACE"}
                </span>
                <h2 id="modal-title">
                  {modal.type === "project"
                    ? modal.id
                      ? "編輯發稿專案"
                      : "建立發稿專案"
                    : modal.type === "article"
                      ? modal.id
                        ? "編輯報導與內文"
                        : "新增報導"
                      : modal.type === "import"
                        ? "匯入媒體露出"
                        : "報導與訊息覆核"}
                </h2>
              </div>
              <button
                className="icon-button"
                onClick={() => setModal(null)}
                aria-label="關閉視窗"
              >
                <X size={22} />
              </button>
            </div>
            <div className="modal-body">
              {modal.type === "project" && (
                <>
                  <ProjectForm
                    db={db}
                    onSuggest={async (title, body) => {
                      if (!token)
                        throw new Error("請先在服務設定登入或驗證存取碼");
                      const result = await request<{
                        messages: {
                          text: string;
                          requiredConditions: string;
                          synonyms: string;
                          exactFacts: string;
                        }[];
                      }>(
                        db.settings.apiUrl,
                        token,
                        "/api/key-messages/suggest",
                        { release: { title, body } },
                      );
                      return result.messages.map((m) => ({
                        id: uid(),
                        text: String(m.text),
                        requiredConditions: String(m.requiredConditions || ""),
                        synonyms: String(m.synonyms || ""),
                        exactFacts: String(m.exactFacts || ""),
                      }));
                    }}
                    project={db.projects.find((p) => p.id === modal.id)}
                    onCancel={() => setModal(null)}
                    onSave={(d, id) => {
                      log(
                        d,
                        modal.id
                          ? "更新專案；保留稿件與訊息版本"
                          : "建立發稿專案",
                      );
                      commit(d);
                      setModal(null);
                      nav("overview", id);
                      notify("專案已儲存");
                    }}
                  />
                  {modal.id && (
                    <button
                      className="text-button archive-button"
                      onClick={() => {
                        mutate((d) => {
                          const p = d.projects.find((p) => p.id === modal.id)!;
                          p.status =
                            p.status === "active" ? "archived" : "active";
                          p.updatedAt = now();
                          log(
                            d,
                            p.status === "archived" ? "封存專案" : "恢復專案",
                          );
                        });
                        setModal(null);
                        nav("projects");
                      }}
                    >
                      <Archive size={15} />
                      {db.projects.find((p) => p.id === modal.id)?.status ===
                      "archived"
                        ? "恢復專案"
                        : "封存專案（保留資料）"}
                    </button>
                  )}
                </>
              )}
              {modal.type === "article" && project && (
                <ArticleForm
                  article={db.articles.find((a) => a.id === modal.id)}
                  body={db.bodies.find(
                    (b) =>
                      b.id ===
                      db.articles.find((a) => a.id === modal.id)?.bodyId,
                  )}
                  onCancel={() => setModal(null)}
                  onSave={(row) => {
                    const r = {
                      ...Object.fromEntries(fields.map((f) => [f, ""])),
                      ...row,
                    } as unknown as ImportRow;
                    if (modal.id) {
                      const canonical = canonicalize(r.url);
                      if (
                        canonical &&
                        db.articles.some(
                          (a) =>
                            a.id !== modal.id && a.canonicalUrl === canonical,
                        )
                      )
                        throw new Error(
                          "此網址已存在，請使用既有報導或人工合併",
                        );
                      mutate((d) => {
                        const a = d.articles.find((a) => a.id === modal.id)!;
                        const old = d.bodies.find((b) => b.id === a.bodyId)!;
                        const b = makeBody(
                          a.id,
                          uid(),
                          d.bodies.filter((x) => x.articleId === a.id).length +
                            1,
                          r.summary,
                          r.body,
                          r.body_status,
                        );
                        if (
                          old.body !== b.body ||
                          old.summary !== b.summary ||
                          old.bodyStatus !== b.bodyStatus ||
                          a.title !== r.title
                        ) {
                          d.bodies.push(b);
                          a.bodyId = b.id;
                        }
                        Object.assign(a, {
                          title: r.title,
                          url: r.url,
                          canonicalUrl: canonical,
                          publisher: r.publisher,
                          publisherDomain: canonical
                            ? new URL(canonical).hostname.replace(/^www\./, "")
                            : "",
                          publishedAt: parseDate(r.published_at),
                          originalPublisher: r.original_publisher,
                          author: r.author,
                          updatedAt: now(),
                          discoverySources: [
                            ...new Set([
                              ...a.discoverySources,
                              ...r.source_channel.split(",").filter(Boolean),
                            ]),
                          ],
                        });
                        log(d, "更新報導；內文變動保留舊版本");
                      });
                    } else {
                      const check = inspectRow(db, r);
                      if (check.kind === "error") throw new Error(check.reason);
                      mutate((d) => {
                        importRows(d, project.id, [r], false);
                      });
                    }
                    setModal(null);
                    notify("報導已儲存；請確認歸屬與完整內文");
                  }}
                />
              )}
              {modal.type === "review" &&
                project &&
                db.articles.find((a) => a.id === modal.id) && (
                  <>
                    <div className="review-classification">
                      <Field label="品牌角色">
                        <select
                          value={
                            db.links.find(
                              (l) =>
                                l.projectId === project.id &&
                                l.articleId === modal.id,
                            )?.brandRole
                          }
                          onChange={(e) =>
                            mutate((d) => {
                              d.links.find(
                                (l) =>
                                  l.projectId === project.id &&
                                  l.articleId === modal.id,
                              )!.brandRole = e.target.value;
                            })
                          }
                        >
                          {["待判定", "主題主角", "共同主角", "順帶提及"].map(
                            (x) => (
                              <option key={x}>{x}</option>
                            ),
                          )}
                        </select>
                      </Field>
                      <Field label="刊登管道">
                        <select
                          value={
                            db.links.find(
                              (l) =>
                                l.projectId === project.id &&
                                l.articleId === modal.id,
                            )?.channelType
                          }
                          onChange={(e) =>
                            mutate((d) => {
                              d.links.find(
                                (l) =>
                                  l.projectId === project.id &&
                                  l.articleId === modal.id,
                              )!.channelType = e.target.value;
                            })
                          }
                        >
                          {["媒體原站", "入口網站轉載", "其他網站"].map((x) => (
                            <option key={x}>{x}</option>
                          ))}
                        </select>
                      </Field>
                    </div>
                    <ReviewForm
                      key={modal.id}
                      db={db}
                      project={project}
                      article={db.articles.find((a) => a.id === modal.id)!}
                      onSave={(result) => {
                        mutate((d) => {
                          const a = d.articles.find((a) => a.id === modal.id)!;
                          const ai = currentAnalysis(d, project, a);
                          d.reviews.push({
                            id: uid(),
                            projectId: project.id,
                            articleId: modal.id,
                            analysisId: ai?.id || "",
                            releaseId: project.releaseId,
                            messageSetId: project.messageSetId,
                            bodyId: a.bodyId,
                            ...result,
                            reviewedAt: now(),
                            originalResult:
                              currentReview(d, project, a)?.results ||
                              ai?.results ||
                              [],
                          });
                          log(d, "完成人工訊息覆核");
                        });
                        setModal(null);
                        notify("人工覆核已保存");
                      }}
                    />
                  </>
                )}
              {modal.type === "import" && project && (
                <CSVImport
                  db={db}
                  onImport={(rows, skip) => {
                    let result: ReturnType<typeof importRows> | undefined;
                    mutate((d) => {
                      result = importRows(d, project.id, rows, skip);
                    });
                    notify(
                      `新增 ${result!.added}、更新 ${result!.updated}、略過 ${result!.skipped}、失敗 ${result!.failed.length}。${result!.failed.join("；")}`,
                    );
                    setModal(null);
                  }}
                />
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
function CSVImport({
  db,
  onImport,
}: {
  db: Database;
  onImport: (rows: ImportRow[], skip: boolean) => void;
}) {
  const [parsed, setParsed] = useState<ReturnType<typeof readCSV> | null>(null);
  const [error, setError] = useState("");
  const [skip, setSkip] = useState(true);
  const rows = parsed ? mapRows(parsed.raw, parsed.mapping) : [];
  const checks = rows.map((r) => inspectRow(db, r));
  return (
    <div>
      <div className="notice">
        <Upload size={18} />
        UTF-8 CSV，支援中文欄名、引號、逗號及多行內文。匯入後預設待確認。
      </div>
      <label className="file-drop">
        <Upload size={28} />
        <strong>選擇媒體露出 CSV</strong>
        <span>只需標題即可匯入，其他資料可稍後補齊</span>
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            try {
              setParsed(readCSV(await file.text()));
              setError("");
            } catch (err) {
              setError((err as Error).message);
            }
          }}
        />
      </label>
      <button
        className="text-button"
        onClick={() =>
          download(
            "\uFEFFtitle,url,publisher,published_at,summary,body,body_status,original_publisher,author,source_channel\r\n示意標題（請替換）,https://example.com/news/1,示意媒體,2026-11-10 10:00,示意摘要,,title_only,,,手動整理\r\n",
            "媒體露出匯入範本.csv",
            "text/csv;charset=utf-8",
          )
        }
      >
        <ArrowDownToLine size={15} />
        下載匯入範本（示意）
      </button>
      {error && <p className="error">{error}</p>}
      {parsed && (
        <>
          <h3 className="spaced-title">確認欄位對應</h3>
          <div className="form-grid">
            {fields.map((f) => (
              <Field label={fieldLabels[f]} key={f}>
                <select
                  value={parsed.mapping[f]}
                  onChange={(e) =>
                    setParsed({
                      ...parsed,
                      mapping: { ...parsed.mapping, [f]: e.target.value },
                    })
                  }
                >
                  <option value="">不匯入此欄</option>
                  {parsed.headers.map((h) => (
                    <option key={h}>{h}</option>
                  ))}
                </select>
              </Field>
            ))}
          </div>
          <div className="notice">
            共 {rows.length} 筆 · 新資料{" "}
            {checks.filter((c) => c.kind === "new").length} · 相同網址{" "}
            {checks.filter((c) => c.kind === "duplicate").length} · 疑似重複{" "}
            {checks.filter((c) => c.kind === "suspect").length} · 失敗{" "}
            {checks.filter((c) => c.kind === "error").length}
          </div>
          {parsed.errors.map((s, i) => (
            <p className="error" key={i}>
              {s}
            </p>
          ))}
          <label className="check-label">
            <input
              type="checkbox"
              checked={skip}
              onChange={(e) => setSkip(e.target.checked)}
            />
            略過缺網址且指紋相似的報導（取消勾選可保留）
          </label>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>標題</th>
                  <th>媒體</th>
                  <th>檢查結果</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 30).map((r, i) => (
                  <tr key={i}>
                    <td>{r.title || "缺少標題"}</td>
                    <td>{r.publisher}</td>
                    <td className={checks[i].kind === "error" ? "error" : ""}>
                      {checks[i].reason}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length > 30 && (
            <small className="muted">預覽前 30 筆；確認後匯入全部資料。</small>
          )}
          <div className="modal-footer">
            <button
              className="primary"
              disabled={
                !parsed.mapping.title || !rows.length || !!parsed.errors.length
              }
              onClick={() => onImport(rows, skip)}
            >
              <Check size={16} />
              確認匯入 {rows.length} 筆
            </button>
          </div>
        </>
      )}
    </div>
  );
}
