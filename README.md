# 訊息觀測室

新聞稿露出整理、核心訊息採用覆核與成效報告工具。介面使用繁體中文與台灣用語，依 `PR_MEDIA_ANALYSIS_PLAN.md` 建置。

- 網站：<https://yin0612.github.io/PR-Media-Analysis/>
- 原始碼：<https://github.com/yin0612/PR-Media-Analysis>
- Cloudflare 後端：<https://pr-media-analysis-api.media-monitoring-worker.workers.dev>

## 日常使用：自動新聞露出清單

首頁現在會自動載入真實新聞，不需先建立專案、匯入 Excel 或輸入 AI 存取碼。預設「藍新金流最新新聞」查看近 30 天資料；「AFTEE 合作露出」查看 2026-04-29 至 2026-05-14 的歷史搜尋結果。也能輸入公開關鍵字、調整日期並下載 Excel。

來源為既有 MediaMonitoring 的真實搜尋介面及 Google News RSS。自動結果是候選新聞，不直接等同已確認的發稿成果。RSS 不保證涵蓋完整歷史；沒有記者欄位的來源顯示「來源未提供」。藍新品牌預設排除易混淆的藍新資訊。Google 聚合連結另有標示，不以同標題強行合併原站與聚合頁。

自動新聞基本資料存於 Cloudflare Workers KV，跨瀏覽器可讀。網頁每 5 分鐘讀取；快取超過 30 分鐘時補抓，GitHub Actions 每小時第 37 分鐘收集預設主題（排程可能延後）。部分來源失敗仍保留最後成功資料。原 Excel 與人工資料仍保存在原瀏覽器，不自動上傳。

Cloudflare 執行環境直接取得 Google RSS 曾回應 503，因此 GitHub 收集器取得 RSS 後，以專用 `NEWS_INGEST_KEY` 傳入 `/api/news/ingest`，由後端驗證內容、日期與主題再寫入 KV。此憑證只設定於 GitHub Actions Secrets 與 Worker Secrets，不能用來呼叫 AI；前端不持有。MediaMonitoring 使用同帳號服務綁定讀取，沒有修改原站。

本次因帳號 D1 免費寫入額度與 Worker Cron 名額已滿，使用 KV 與 GitHub 排程，沒有新增付費方案。GitHub 可能因來源限制、排程延遲或公開儲存庫長期無活動而暫停排程；頁面須顯示最後來源更新時間，而不是保證每小時準點到齊。

修改企畫與驗收規格見 [PR_MEDIA_SIMPLIFICATION_PLAN.md](PR_MEDIA_SIMPLIFICATION_PLAN.md)。

## 手動整理：我的 Excel 清單

從首頁右上角進入「我的 Excel 清單」。保留 NO.、日期、媒體、記者及可點擊的新聞標題，不必先填寫新聞稿、核心訊息或執行 AI。

1. 按「匯入 Excel」，選擇 `.xlsx` 或 CSV。
2. 選擇工作表，確認前五筆預覽，再按「匯入這些新聞」。各分頁分開選擇，不自動混入其他舊資料。
3. 日常用「新增一筆」補新聞，按鉛筆修改，按叉號移除（可撤銷）。
4. 按「下載 Excel」取得相同五欄格式，保留新聞標題超連結。

也可以只填名稱建立空白清單。原先建立的專案與報導可直接出現在清單中，已排除資料不顯示。清單總筆數是這張表內的紀錄數，不等同進階分析的期間統計 N。媒體數依填寫名稱計算。

檔案在瀏覽器內解析，不上傳至 GitHub 或 AI 後端。Excel 匯入支援置於前幾列後的欄名、日期及含多段格式文字的標題超連結。CSV 可使用中文「記者」欄。進階分析仍保留在右上角入口。

## 進階分析操作

1. 建立發稿專案，填寫新聞稿定稿、發稿時間、觀測期間與核心訊息。預設觀測 14 日，含發稿當日。
2. 在露出清單手動新增報導，或匯入 UTF-8 CSV。可在匯入視窗下載格式範本、調整中文或英文欄位對應並預覽。
3. 確認專案歸屬，才將候選報導改為「已收錄」。勾選多筆可批次收錄、排除、同文分組、拆群或人工合併同筆；上次分組／合併可撤銷。
4. 確認內文完整性。摘要、摘錄與只有標題的資料可以計入露出，但不納入正式訊息分析分母。
5. 開啟「覆核」，逐項填寫採用判斷、理由、證據、主管引言與資訊偏差。完整／部分採用的原句必須存在於保存段落；無法判定需填寫原因。
6. 在成效總覽檢查數字，再到成效報告填寫觀察、保存快照。從同一份快照下載 CSV 與真正可編輯的 `.docx`。
7. 定期下載完整 JSON 備份。新電腦、新瀏覽器或不同網站來源，需透過 JSON 還原。

## 資料保存與版本

所有專案、定稿、核心訊息、報導內文、分析、人工覆核及歷次快照均保存在目前瀏覽器的 **IndexedDB**。資料庫名稱包含本工具識別與部署路徑，與其他 GitHub Pages 網站區隔。**本版本沒有雲端同步或多人協作。** 清除網站資料、無痕模式結束或儲存空間被回收，可能移除資料，請定期備份。

定稿或核心訊息更新會另存版本；內文更新會另存內文版本。舊覆核保留但不計入新版本指標。AI 重跑另存分析，不覆寫人工覆核。已保存的報告含凍結的來源、內文、覆核、版本及統計，後續變更不影響舊報告。

JSON 還原前先備份目前資料。還原頁面會顯示備份篇數，確認後完整取代目前工作空間。

## 統計口徑

- **N**：觀測期間內，人工確認收錄並去除同筆重複的篇數。日期不明及期間外資料不進入 N。
- **B**：N 中，具人工確認完整內文且定稿、訊息、內文版本均相符的人工覆核篇數。
- 每項完整採用率＝完整採用篇數／B；部分採用率另算，不合併。語意不明但全文完整且已覆核的項目，留在 B 並列無法判定。
- 分母為零顯示「尚無足夠資料」。計畫書範例 N=20、B=15、完整=9、部分=3，得到 60%、20%、75% 覆蓋率。
- 同文在不同網站刊登各計一篇，群組數另列；每群採第一篇完整且已覆核的代表稿另計訊息採用。內容差異影響判斷時請先拆群。
- 品牌標題採用已確認品牌／別名，分母為 N 中具標題的報導。刊登網站以網域統一，沒有網址時使用已填媒體名稱；未識別網站不推定為同一家。
- 網址只移除 `utm_*`、`fbclid`、`gclid`、`msclkid` 及 fragment，保留文章識別參數。同標題不同網址不自動刪除。Google News 聚合網址保留並提示待確認原站。
- 無網址的相同標題、媒體及日期，只提示疑似重複，可選擇保留。
- 主管引言以原句、轉述、兩者皆有分列，總數按篇計算。資訊偏差由人確認，不會自動聯絡媒體。

## Cloudflare AI 與新聞擷取

已提供可部署的 Worker：`worker/index.ts`。預設使用 Cloudflare **Workers AI** 綁定與 `@cf/meta/llama-3.3-70b-instruct-fp8-fast`，不需在前端輸入 AI 金鑰。實際呼叫會消耗 Cloudflare 帳號的 AI 額度；未設定、額度不足、證據不符或服務錯誤均不會顯示已完成。

前端「資料與服務設定」中，後端網址預設由 GitHub Actions 的公開變數 `VITE_API_URL` 提供。按「測試連線」，然後輸入工作空間服務存取碼並按「驗證存取碼並連線」。存取碼由後端驗證，只留在目前頁面的記憶體，不寫入 IndexedDB 或 JSON 備份；重新整理後需重新驗證。

初次部署時，工作空間存取碼只寫入本機 `.local/Cloudflare服務存取碼.txt`（已排除 Git）。請妥善保管。它是單一工作空間的服務憑證，與 AI 廠商金鑰不同；**不適用多人共用或跨租戶雲端資料保存**。若需多人操作，請擴充登入、成員權限與專案資料授權後再啟用雲端保存。

連線後可使用：

- 建立／編輯專案中的 AI 核心訊息建議，人工確認保存後才啟用。
- 單篇 AI 歸屬與訊息採用分析，包含原句、段落、理由及疑似資訊偏差；前後端均驗證證據。
- 依目前統計快照草擬報告觀察，人工檢視後再保存快照。
- 允許網域的公開文字新聞擷取。擷取結果先標記為摘錄，需人工核對是否完整。

新聞擷取限制為管理者在 `EXTRACT_ALLOWED_HOSTS` 明確列出的主機，檢查公開 DNS、IP、每次重新導向與 robots 限制，限制大小及逾時。不繞過登入、付費牆或來源禁止規則。動態頁面可能無法取得完整文字，請手動補件。允許清單不是新聞授權，請依來源使用條件操作。

後端只處理當次請求，不保存企業稿件或報導資料，不將請求內容寫入應用紀錄；分析結果由前端保存。Worker 限制每個工作空間每分鐘 10 次呼叫。CORS 只允許設定的前端來源；GitHub 同一網域下的網站共用 origin，CORS 不作為身分驗證，仍必須驗證服務存取碼或 Access JWT。

### 後端設定

`worker/wrangler.jsonc` 保存公開設定：

| 設定 | 用途 |
| --- | --- |
| ALLOWED_ORIGINS | 精確前端 origin，逗號分隔 |
| EXTRACT_ALLOWED_HOSTS | 可擷取的精確新聞主機，逗號分隔 |
| AI_MODEL | Workers AI 模型名稱，或自訂服務模型名稱 |
| AI_API_BASE | 選用的 OpenAI 相容 API 根路徑；由管理者設定 |
| ACCESS_TEAM_DOMAIN / ACCESS_AUD / ALLOWED_EMAILS | 選用 Cloudflare Access 登入 |

機密一律使用 Worker Secrets：

```sh
pnpm exec wrangler secret put SERVICE_ACCESS_KEY --config worker/wrangler.jsonc
# 選用其他 OpenAI 相容服務時，設定 AI_API_KEY 並調整 AI_MODEL。
pnpm exec wrangler secret put AI_API_KEY --config worker/wrangler.jsonc
```

可選擇啟用 Cloudflare Access：建立 Self-hosted application，只保護後端 `/auth*`，填寫 team domain、audience 與允許的 email。API 路徑由 Worker 自行驗證 Bearer JWT，不要把整個 `/api/*` 加上會攔截預檢的互動式登入門。網站「登入 Cloudflare」會開啟登入視窗，以精確 origin、一次性 nonce 及 postMessage 交付 JWT；Worker 驗證簽章、issuer、audience、效期及使用者名單。專用服務碼與 Access 可並存。

### API

| 介面 | 行為 |
| --- | --- |
| GET /api/health | 公開服務設定狀態，不回傳機密 |
| POST /api/session | 驗證服務存取碼或 Access JWT |
| POST /api/key-messages/suggest | 建議核心訊息 |
| POST /api/articles/extract | 擷取允許公開來源的文字 |
| POST /api/analyses | 同步執行並回傳結構化分析；不建立伺服器工作資料庫 |
| POST /api/report-summaries | 依凍結統計草擬觀察 |

除 health 外均須授權。`GET /api/analyses/{id}` 目前不提供，工作狀態與結果由前端本機保存。未提供 D1/R2、排程或背景佇列。

## 開發與部署

需要 Node.js 24 與 pnpm 11.25.0。套件精確鎖定於 `package.json` 與 `pnpm-lock.yaml`，建置腳本只允許 esbuild 與 workerd 必要安裝流程。

```sh
pnpm install --frozen-lockfile
pnpm dev
pnpm test
pnpm build
pnpm worker:check
```

設定 `.env.local`（已排除 Git），可參照 `.env.example`。前端環境變數都是公開資訊，**絕不可放入 AI 金鑰、服務存取碼或私密稿件**。

### GitHub Pages

推送 `main` 後，`.github/workflows/deploy.yml` 會執行測試與生產建置，再部署 GitHub Pages。儲存庫 Settings → Pages 的來源設為 GitHub Actions。Actions Variables 設定 `VITE_API_URL` 為後端根網址。此工作流程只建置前端，不將 AI 呼叫變成 Actions API。

`VITE_BASE_PATH=/PR-Media-Analysis/` 支援專案子路徑；使用 hash 路由，直接開啟與重新整理均可運作。若改為自己的網域，將 base 改為 `/`。前端可移轉 Cloudflare Pages：建置 `pnpm build`、產物 `dist`、base `/`；本次部署仍為 GitHub Pages 前端＋Worker 後端。

### Cloudflare Worker

```sh
pnpm exec wrangler login
pnpm worker:deploy
# 自動建立本機工作空間碼並透過 stdin 寫入 Worker Secret：
node scripts/configure-access.mjs
```

`scripts/configure-access.mjs` 若本機檔案已存在會沿用，重新設定可先另存保管舊碼，再自行建立新的隨機碼並更新 Secret。不要將該檔案或真實 `.dev.vars` 上傳。

## 驗證與目前範圍

已實作階段 A：專案、版本、CSV／手動匯入、去重、人工歸屬、同文分組與撤銷、證據覆核、引言／偏差、IndexedDB、備份還原、儀表板及快照 CSV／Word 匯出。核心測試涵蓋計畫書的關鍵統計與版本規則、CSV 安全、證據驗證及後端授權。

本次建置的 20 項測試及 GitHub Actions 均通過；另實際測試建案、報導收錄、證據覆核、快照保存與 Word 下載。Word 檔案已驗證為含標準 OOXML 的 `.docx`；本機缺少 LibreOffice，尚未完成逐頁列印版面檢查，正式報告請以 Word 開啟確認。中央社首頁的擷取測試正確依 robots 限制回傳待手動補件，並未繞過來源限制。

階段 B 已提供真實 Workers AI、歸屬建議、證據驗證、摘要與公開來源擷取。一次合成資料的真實 AI 呼叫不代表已達到規劃的 90% 歸屬精確率、85% 訊息一致率或 30% 省時目標。**仍需使用者提供 3 件歷史專案及至少 60 篇已標記報導完成正式驗收。**

目前未實作：私有工作資料雲端同步、多人專案權限、通知與跨案比較頁。自動新聞已串接 MediaMonitoring 與 Google News RSS；既有兩站維持不變。

來源文件：[Vite GitHub Pages 部署](https://vite.dev/guide/static-deploy)、[Cloudflare Workers AI JSON Mode](https://developers.cloudflare.com/workers-ai/features/json-mode/)、[Worker 限流](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)、[Cloudflare Access JWT 驗證](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/)。

