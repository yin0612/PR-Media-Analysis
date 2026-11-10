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
}
export interface NewsTopic {
  id: string;
  name: string;
  query: string;
  from?: string;
  to?: string;
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
    id: "aftee-202604",
    name: "AFTEE 合作露出（2026/4/29–5/14）",
    query: "藍新 AFTEE",
    from: "2026-04-29",
    to: "2026-05-14",
  },
];
