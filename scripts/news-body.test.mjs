import { it, expect } from "vitest";
import {
  addScopedTitleMatches,
  keywordExcerpt,
  parseArticle,
} from "./news-body.mjs";

it("關鍵字可在原文後段，頁首與站內推薦不算內文", () => {
  const article = parseArticle(`
    <header>藍新金流</header>
    <main><div itemprop="articleBody">
      <p>${"一般文章內容。".repeat(400)}</p><p>藍新科技宣布推出導購服務。</p>
      <aside>NewebPay</aside>
    </div></main>
  `);
  const excerpt = keywordExcerpt(article.body, {
    id: "newebpay",
    query: "藍新金流",
  });
  expect(excerpt).toContain("藍新科技");
  expect(excerpt).not.toMatch(/藍新金流|NewebPay/);
});

it("歷史專題補入分站 RSS 中符合品牌與議題的報導", () => {
  const item = (title, link) =>
    `<item><title>${title}</title><link>${link}</link></item>`;
  const feed = (items) => `<rss><channel>${items}</channel></rss>`;
  const primary = item(
    "藍新科技接待史瓦帝尼代表團",
    "https://news.google.com/rss/articles/one",
  );
  const scoped = [
    primary,
    item(
      "藍新金流分享經驗給史瓦帝尼",
      "https://news.google.com/rss/articles/two",
    ),
    item("史瓦帝尼訪問其他業者", "https://news.google.com/rss/articles/three"),
  ].join("");
  const combined = addScopedTitleMatches(
    feed(primary),
    [{ xml: feed(scoped) }],
    {
      id: "eswatini-202610",
      query: "藍新 史瓦帝尼",
      issue: "史瓦帝尼",
      sites: ["example.com"],
    },
  );
  expect(combined.match(/<item>/g)).toHaveLength(2);
  expect(combined).toContain("articles/two");
  expect(combined).not.toContain("articles/three");
});
