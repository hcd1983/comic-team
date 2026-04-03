# 生圖

使用 Gemini API 根據分鏡腳本生成漫畫圖片。

## 前置條件

- 需要 `output/storyboard.json`（來自 /storyboard），或當前對話中已有確認的分鏡結果
- 若檔案不存在，提示使用者先執行 `/storyboard`
- 環境變數 `GEMINI_API_KEY` 必須已設定

## 流程

1. 讀取 `output/storyboard.json`
2. 逐格呼叫 `gemini_draw` MCP tool 生成圖片：
   - **Prompt 來源**：直接使用分鏡師產出的 `promptTemplate`，按順序拼接為完整 prompt：
     1. `stylePrefix`（畫風 + **no text, no speech bubbles, no dialogue, no words, no letters, no sound effects**）
     2. `composition`（構圖指令）
     3. `scene`（場景描述，引用自 story-outline.json）
     4. `characters`（角色完整外觀描述 + 位置姿態，引用自 story-outline.json）
     5. `mood`（情緒氛圍）
   - **不要在 prompt 中加入任何對白或文字內容**，對白由後製處理
   - **輸出路徑**：`output/page{頁碼}_panel{格號}.png`
   - 每格完成後立即回報進度
   - **品質閘門**：每格生成後執行品質檢查（參照 /quality-gate）：
     - 讀取圖片，檢查圖文一致性、跨格一致性、文字殘留
     - PASS → 繼續下一格
     - WARN → 提示問題但繼續
     - FAIL → 修改 prompt 後自動重新生成（最多 2 次），仍失敗標記 `MANUAL_REVIEW`
   - **失敗處理**：API 失敗自動重試 1 次，仍失敗則記錄錯誤並繼續下一格
3. 全部完成後，產出後製文字清單並儲存至 `output/dialogue-overlay.json`：

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

後製文字資訊已儲存至 output/dialogue-overlay.json
```

5. 請使用者選擇：
   - **滿意，完成** → 結束
   - **重畫第 N 格** → 只重新生成指定的格數（可指定多格，如「重畫第 2、3 格」）
   - **調整畫風全部重畫** → 使用者提供新畫風描述，所有格重新生成
   - **調整某格的 prompt** → 使用者針對特定格提供額外 prompt 指示後重新生成該格
   - **回退到分鏡** → 提示使用者執行 `/storyboard` 修改分鏡
