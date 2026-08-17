# 孩子睡眠與情緒觀察工具

「安睡角落」製作的裝置本機版 PWA，用來記錄孩子的睡眠、情緒、特殊事件與日常觀察。

## 資料與隱私

- 不需登入。
- 使用者輸入的資料只儲存在目前裝置與瀏覽器的 `localStorage`。
- 專案原始碼不包含使用者的孩子資料、紀錄或備份檔。
- 本機版 PWA 不使用 Google Analytics 或其他第三方分析追蹤，也不設定分析 Cookie。
- 不傳送孩子資料、紀錄內容或功能使用紀錄；安睡角落無法透過本工具查看使用者的裝置內資料。
- 更換網域、瀏覽器或裝置前，請先在工具內下載「完整家庭備份」，再到新版本匯入。

## GitHub Pages

專案已設定 GitHub Actions。推送到 `main` 分支後，會自動建立靜態網站並部署到 GitHub Pages。

預計網址：

`https://sleep-tight-corner.github.io/sleep-emotion-tracker/`

## 本機開發

需求：Node.js 22.13.0 以上版本。

```bash
npm ci
npm run dev
```

驗證 GitHub Pages 靜態輸出：

```bash
GITHUB_PAGES=true NEXT_PUBLIC_BASE_PATH=/sleep-emotion-tracker npm run build:github
```

## 著作權

Copyright © 2026 江佩俞。保留所有權利。

本專案並非開放原始碼授權。詳細條款請見 [LICENSE](./LICENSE)。
