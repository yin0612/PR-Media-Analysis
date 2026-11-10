export type Adoption = "full" | "partial" | "absent" | "undetermined";
export type Inclusion = "pending" | "included" | "excluded";
export type BodyStatus = "title_only" | "summary_only" | "full" | "failed";
export type RunStatus =
  "not_configured" | "pending" | "running" | "completed" | "failed" | "stale";
export type ReportType =
  "near_release" | "rewritten" | "extended_reporting" | "undetermined";
export interface Project {
  id: string;
  name: string;
  brand: string;
  brandAliases: string[];
  product: string;
  partners: string;
  releaseAt: string;
  periodStart: string;
  periodEnd: string;
  timezone: string;
  status: "active" | "archived";
  releaseId: string;
  messageSetId: string;
  searchTerms: string;
  excludeTerms: string;
  trackedMedia: string[];
  quote: string;
  createdAt: string;
  updatedAt: string;
}
export interface Release {
  id: string;
  projectId: string;
  version: number;
  title: string;
  body: string;
  createdAt: string;
}
export interface Message {
  id: string;
  text: string;
  requiredConditions: string;
  synonyms: string;
  exactFacts: string;
}
export interface MessageSet {
  id: string;
  projectId: string;
  version: number;
  messages: Message[];
  createdAt: string;
}
export interface Article {
  id: string;
  url: string;
  canonicalUrl: string;
  title: string;
  publisher: string;
  publisherDomain: string;
  originalPublisher: string;
  author: string;
  publishedAt: string;
  discoverySources: string[];
  bodyId: string;
  createdAt: string;
  updatedAt: string;
}
export interface Body {
  id: string;
  articleId: string;
  version: number;
  summary: string;
  body: string;
  bodyStatus: BodyStatus;
  sourceType: string;
  paragraphs: { id: string; text: string }[];
  createdAt: string;
}
export interface Link {
  id: string;
  projectId: string;
  articleId: string;
  inclusionStatus: Inclusion;
  inclusionReason: string;
  aiRecommendation: string;
  aiReason: string;
  groupId: string;
  reportType: ReportType;
  brandRole: string;
  channelType: string;
  createdAt: string;
  updatedAt: string;
}
export interface Result {
  messageId: string;
  messageVersion: number;
  status: Adoption;
  reason: string;
  evidenceQuotes: string[];
  paragraphIds: string[];
  reviewedBodyVersionId: string;
  coverage: string;
  undeterminedReason: string;
}
export interface Discrepancy {
  original: string;
  reported: string;
  reason: string;
  status: string;
}
export interface Analysis {
  id: string;
  projectId: string;
  articleId: string;
  releaseId: string;
  messageSetId: string;
  bodyId: string;
  runStatus: RunStatus;
  modelVersion: string;
  analyzedAt: string;
  results: Result[];
  discrepancies: Discrepancy[];
  quoteAdoption: string;
  error?: string;
  recommendation?: string;
  recommendationReason?: string;
}
export interface Review {
  id: string;
  projectId: string;
  articleId: string;
  analysisId: string;
  releaseId: string;
  messageSetId: string;
  bodyId: string;
  results: Result[];
  quoteAdoption: string;
  discrepancies: Discrepancy[];
  reviewer: string;
  reason: string;
  reviewedAt: string;
  originalResult: Result[];
}
export interface MetricMessage {
  id: string;
  text: string;
  full: number;
  partial: number;
  absent: number;
  undetermined: number;
}
export interface Metrics {
  N: number;
  B: number;
  websites: number;
  originalPublishers: number;
  groups: number;
  groupB: number;
  groupPending: number;
  messages: MetricMessage[];
  groupMessages: MetricMessage[];
  titleBrand: number;
  titleDenominator: number;
  quote: number;
  quoteExact: number;
  quoteParaphrase: number;
  quoteBoth: number;
  missingBody: number;
  pendingAnalysis: number;
  pendingReview: number;
  stale: number;
  missingDate: number;
  discrepancies: number;
  types: Record<string, number>;
  trend: { date: string; count: number }[];
  media: { name: string; count: number }[];
}
export interface FrozenRow {
  article: Article;
  body: Body | undefined;
  link: Link;
  review: Review | undefined;
  analysis: Analysis | undefined;
}
export interface Snapshot {
  id: string;
  projectId: string;
  project: Project;
  release: Release;
  messageSet: MessageSet;
  createdAt: string;
  cutoffAt: string;
  period: { start: string; end: string };
  definitionVersion: string;
  frozenRows: FrozenRow[];
  frozenMetrics: Metrics;
  summary: string;
  sourceVersionIds: string[];
}
export interface Activity {
  id: string;
  at: string;
  label: string;
}
export interface Database {
  schemaVersion: 1;
  projects: Project[];
  releases: Release[];
  messageSets: MessageSet[];
  articles: Article[];
  bodies: Body[];
  links: Link[];
  analyses: Analysis[];
  reviews: Review[];
  reports: Snapshot[];
  activities: Activity[];
  settings: { apiUrl: string };
}
