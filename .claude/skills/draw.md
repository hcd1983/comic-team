# 生圖

使用 Gemini API 根據分鏡腳本生成漫畫圖片。

## 前置條件

- 需要 `output/{slug}/{version}/storyboard.json`（來自 /storyboard），或當前對話中已有確認的分鏡結果
- 若檔案不存在，提示使用者先執行 `/storyboard`
- 環境變數 `GEMINI_API_KEY` 必須已設定

## 生成模式

- **序列生成**（預設）：逐格生成，每格完成品質檢查後再生成下一格
- **平行生成**：同時生成 2 格，適用於角色設定表完整且品質閘門已校準的情況
  - 平行度可配置（預設 2，最大 4）
  - 需注意 Gemini API rate limit
  - 品質閘門仍為逐格檢查

## 流程

1. 讀取 `output/{slug}/{version}/storyboard.json` 和 `output/{slug}/{version}/story-outline.json`
2. 收集角色參考圖：從 story-outline.json 的 characters 中提取所有 `referenceImages` 路徑
3. 逐格呼叫 `gemini_draw` MCP tool 生成圖片：
   - **Prompt 來源**：直接使用分鏡師產出的 `promptTemplate`，按順序拼接為完整 prompt（**控制在 150-200 字以內**）：
     1. `stylePrefix`（畫風 + **no text, no speech bubbles, no dialogue, no words, no letters, no sound effects**）
     2. `composition`（構圖指令，不要寫百分比）
     3. `scene`（場景關鍵元素，精簡描述）
     4. `characters`（角色核心外觀 + 動作表情，用 tag 串而非完整句子）
   - **不要在 prompt 中加入 mood 抒情描述**，也不要加對白或文字內容
   - **必傳參數**：
     - `aspectRatio`：從分鏡的 `aspectRatio` 欄位取得（如 `3:4`、`16:9`、`9:16`）
     - `imageSize`：從分鏡的 `imageSize` 欄位取得（預設 `2K`）
     - `referenceImages`：角色設定圖路徑陣列（每格都傳，維持角色一致性）
   - **輸出路徑**：`output/{slug}/{version}/pages/p{頁碼}_panel{格號}.png`
   - 每格完成後立即回報進度
   - **品質閘門**：每格生成後執行品質檢查（參照 /quality-gate）：
     - 讀取圖片，檢查圖文一致性、跨格一致性、文字殘留
     - PASS → 繼續下一格
     - WARN → 提示問題但繼續
     - FAIL → 修改 prompt 後自動重新生成（最多 2 次），仍失敗標記 `MANUAL_REVIEW`
   - **失敗處理**：API 失敗自動重試 1 次，仍失敗則記錄錯誤並繼續下一格
3. 全部完成後，產出後製文字清單並儲存至 `output/{slug}/{version}/dialogue-overlay.json`：

```json
{
  "pages": [
    {
      "pageNumber": 1,
      "panels": [
        {
          "panelNumber": 1,
          "imagePath": "output/page1_panel1.png",
          "dialogues": [
            {
              "speaker": "說話者名稱",
              "text": "對白內容",
              "position": "上方 / 下方 / 左上 / 右上 / 左下 / 右下",
              "style": "normal / shout / whisper / thought"
            }
          ],
          "soundEffects": []
        }
      ]
    }
  ]
}
```

4. 列出所有結果與後製文字清單：

```
═══ 作畫完成 ═══
✓ 第 1 格：output/page1_panel1.png
✓ 第 2 格：output/page1_panel2.png
✗ 第 3 格：生成失敗（原因）
✓ 第 4 格：output/page1_panel4.png

═══ 後製文字清單 ═══
第 1 格：同事：「阿靜～早安！」(右上, normal)
第 2 格：內心小人：「緊急狀況！！」(中央, shout)
...

後製文字資訊已儲存至 output/{slug}/{version}/dialogue-overlay.json
```

5. 請使用者選擇：
   - **滿意，完成** → 結束
   - **重畫第 N 格** → 只重新生成指定的格數（可指定多格，如「重畫第 2、3 格」）
   - **調整畫風全部重畫** → 使用者提供新畫風描述，所有格重新生成
   - **調整某格的 prompt** → 使用者針對特定格提供額外 prompt 指示後重新生成該格
   - **回退到分鏡** → 提示使用者執行 `/storyboard` 修改分鏡
