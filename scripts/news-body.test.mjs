import { it, expect } from "vitest";
import { keywordExcerpt, parseArticle } from "./news-body.mjs";

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
