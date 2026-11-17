export interface NewsItem {
  id: string;
  title: string;
  url: string;
  publisher: string;
  author: string;
  publishedAt: string;
  summary: string;
  linkKind: "publisher" | "aggregator";
  sources: string[];
  bodyKeywords?: string[];
  rssLinks?: string[];
}
export interface NewsTopic {
  id: string;
  name: string;
  query: string;
  from?: string;
  to?: string;
  issue?: string;
  issueAliases?: string[];
}
export interface NewsFeed {
  query: string;
  topicId: string;
  from: string;
  to: string;
  items: NewsItem[];
  lastAttemptAt: string;
  lastSuccessAt: string | null;
  status: "ready" | "partial" | "failed";
  sources: { name: string; ok: boolean; error?: string; updatedAt?: string }[];
  note: string;
}
export const defaultNewsTopics: NewsTopic[] = [
  { id: "newebpay", name: "藍新金流最新新聞", query: "藍新金流" },
  {
    id: "buytalk-202611",
    name: "應援科技｜AI 購物助手",
    query: "藍新 AI購物助手",
    issue: "AI購物助手",
    issueAliases: [
      "應援科技",
      "BuyTalk Agent",
      "AI導購",
      "AI 導購",
      "AI 購物助手",
      "代理式商務",
    ],
    from: "2026-11-12",
    to: "2026-11-19",
  },
  {
    id: "taiwan-mobile-202610",
    name: "台灣大哥大｜先買後付",
    query: "藍新 台灣大",
    issue: "台灣大",
    from: "2026-10-27",
    to: "2026-11-03",
  },
  {
    id: "aftee-202604",
    name: "AFTEE 合作露出（2026/4/29–5/14）",
    query: "藍新 AFTEE",
    from: "2026-04-29",
    to: "2026-05-14",
  },
];
