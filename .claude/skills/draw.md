# 生圖

使用 Gemini API 根據分鏡腳本生成漫畫圖片。

## 前置條件

- 需要 `output/storyboard.json`（來自 /storyboard），或當前對話中已有確認的分鏡結果
- 若檔案不存在，提示使用者先執行 `/storyboard`
- 環境變數 `GEMINI_API_KEY` 必須已設定

## 流程

1. 讀取 `output/storyboard.json`
2. 可選：詢問使用者畫風偏好（預設：日系漫畫風格，黑白線稿，清晰的線條）
3. 逐格呼叫 `gemini_draw` MCP tool 生成圖片：
   - **Prompt 組合順序**：
     1. 畫風描述（使用者指定或預設）
     2. 鏡頭角度（來自分鏡 cameraAngle）
     3. 畫面描述（來自分鏡 description）
     4. 情緒氛圍（來自分鏡 emotion）
     5. 對白氣泡說明（若 dialogue 不為空，加入「畫面中包含文字氣泡，內容為：XXX」）
   - **輸出路徑**：`output/page{頁碼}_panel{格號}.png`
   - 每格完成後立即回報進度
   - **失敗處理**：自動重試 1 次，仍失敗則記錄錯誤並繼續下一格
4. 全部完成後，列出所有結果：

```
═══ 作畫完成 ═══
✓ 第 1 格：output/page1_panel1.png
✓ 第 2 格：output/page1_panel2.png
✗ 第 3 格：生成失敗（原因）
✓ 第 4 格：output/page1_panel4.png
```

5. 請使用者選擇：
   - **滿意，完成** → 結束
   - **重畫第 N 格** → 只重新生成指定的格數（可指定多格，如「重畫第 2、3 格」）
   - **調整畫風全部重畫** → 使用者提供新畫風描述，所有格重新生成
   - **調整某格的 prompt** → 使用者針對特定格提供額外 prompt 指示後重新生成該格
   - **回退到分鏡** → 提示使用者執行 `/storyboard` 修改分鏡
