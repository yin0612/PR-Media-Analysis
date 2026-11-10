import { expect, it } from "vitest";
import { Workbook } from "exceljs";
import { emptyDB } from "./domain";
import {
  addToList,
  blankRow,
  createList,
  listRows,
  readExposureExcel,
  excelText,
} from "./simple-data";
it("保留標題超連結內的多段格式文字", () => {
  expect(
    excelText({
      text: { richText: [{ text: "示意品牌" }, { text: "推出新服務" }] },
      hyperlink: "https://example.com",
    }),
  ).toBe("示意品牌推出新服務");
});
it("Excel 欄名在第4列，保留標題超連結、日期、記者及獨立分頁", async () => {
  const book = new Workbook();
  const s = book.addWorksheet("測試分頁");
  s.addRow(["示意新聞露出"]);
  s.addRow(["更新時間"]);
  s.addRow(["網路"]);
  s.addRow(["NO.", "日期", "媒體", "記者", "標題"]);
  s.addRow([
    1,
    new Date("2026-04-29T00:00:00Z"),
    "示意媒體",
    "示意記者",
    { text: "示意標題", hyperlink: "https://example.com/news?id=1" },
  ]);
  book.addWorksheet("空白範本");
  s.addRow([null, null, null, null, 1]);
  const buffer = await book.xlsx.writeBuffer();
  const result = await readExposureExcel(new Uint8Array(buffer).buffer);
  expect(result[0].rows).toHaveLength(1);
  expect(result[0].rows[0]).toMatchObject({
    title: "示意標題",
    url: "https://example.com/news?id=1",
    publisher: "示意媒體",
    author: "示意記者",
    published_at: "2026-04-29",
  });
  expect(result[1].rows).toHaveLength(0);
});
it("只填清單名稱即可記錄，重複匯入不增加資料、不需採用覆核", () => {
  const d = emptyDB();
  const p = createList(d, "示意清單", ["2026-04-29"]);
  const row = {
    ...blankRow(),
    title: "示意標題",
    url: "https://example.com/story",
    published_at: "2026-04-29",
    publisher: "示意媒體",
  };
  addToList(d, p.id, [row]);
  addToList(d, p.id, [row]);
  expect(listRows(d, p.id)).toHaveLength(1);
  expect(d.links[0].inclusionStatus).toBe("included");
  expect(d.messageSets[0].messages).toHaveLength(0);
  expect(d.reviews).toHaveLength(0);
});
it("只從目前清單移除；同篇新聞在其他清單仍保留，可撤銷", () => {
  const d = emptyDB();
  const a = createList(d, "清單A"),
    b = createList(d, "清單B");
  const row = {
    ...blankRow(),
    title: "示意標題",
    url: "https://example.com/story",
  };
  addToList(d, a.id, [row]);
  addToList(d, b.id, [row]);
  d.links[0].inclusionStatus = "excluded";
  expect(listRows(d, a.id)).toHaveLength(0);
  expect(listRows(d, b.id)).toHaveLength(1);
  d.links[0].inclusionStatus = "included";
  expect(listRows(d, a.id)).toHaveLength(1);
});
