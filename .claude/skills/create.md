# 漫畫創作（完整流程）

一條龍創作流程：編劇討論 → 分鏡生成 → 作畫生成。

## 流程

### 步驟 0：作品管理

1. 讀取 `output/manifest.json`，列出現有作品
2. 詢問使用者：
   - **新建作品** → 詢問作品標題，自動產生 slug（英文小寫+連字號），建立 `output/{slug}/v1/` 目錄
   - **既有作品新版本** → 選擇作品，自動遞增版本號，建立 `output/{slug}/v{N}/` 目錄
3. 後續所有產出均存放於 `output/{slug}/{version}/` 下

### 步驟 1：啟動

1. 詢問使用者故事主題或大綱
2. 詢問漫畫格式：
   - **單頁漫畫**（4-6 格）
   - **四格漫畫**（固定 4 格：起承轉合）
3. 詢問畫風偏好（可選，預設：日系漫畫風格，黑白線稿）

### 步驟 1.5：素材搜集

1. 呼叫 `researcher` agent（小查），傳入主題、漫畫格式、目標受眾
2. 小查透過 WebSearch 搜集四大類素材（熱門梗、經典橋段、社群討論、受眾吐槽點）
3. 呈現素材包摘要（最值得利用的發現、避免清單、建議切角）
4. 使用者選擇：確認 / 追加搜尋 / 重新搜尋 / 跳過
5. 確認後儲存至 `output/{slug}/{version}/material-pack.json`

```
═══ 階段完成：素材搜集 ═══
素材包已儲存至 output/{slug}/{version}/material-pack.json
即將進入編劇討論，是否繼續？(繼續 / 暫停)
```

### 步驟 2：編劇討論

1. **導演開場**：根據主題和素材包給出限制條件（禁區、受眾、必含元素）
2. **序列式提案**：
   - 阿龍先提案 → 小雪讀阿龍提案後提不同方向 → 老謝讀前兩人後再提第三方向
   - 每位編劇必須提出不同方向
3. 使用者選定方向（A/B/C 或混搭或讀者投票）
4. **三人共同深化**：三位編劇依序針對選定方案補強細節
5. **笑點測試**（搞笑類）：列出至少 3 個具體笑點場景，使用者評估
6. 使用者確定方向後，整理成 story-outline.json 並儲存至 `output/{slug}/{version}/story-outline.json`：

```json
{
  "title": "故事標題",
  "theme": "使用者原始主題",
  "synopsis": "100 字以內的故事摘要",
  "characters": [
    {
      "id": "角色 ID（英文）",
      "name": "角色名",
      "personality": "性格描述與行為特徵",
      "appearance": "外觀細節（髮型、髮色、五官、膚色、體型）",
      "outfit": "服裝描述（款式、顏色、配件）",
      "expressions": {
        "default": "預設表情的精確描述",
        "表情名稱": "該表情的精確描述"
      }
    }
  ],
  "scenes": [
    {
      "id": "場景 ID（英文）",
      "description": "場景視覺描述（色調、光源方向、主要物件配置）"
    }
  ],
  "plotPoints": [
    {
      "beat": "起 / 承 / 轉 / 合",
      "scene": "場景 ID",
      "characters": ["角色 ID"],
      "event": "具體事件描述",
      "emotion_target": "預期讀者情緒反應"
    }
  ],
  "tone": "搞笑 / 熱血 / 溫馨 / 懸疑",
  "format": "single-page | four-panel",
  "style": "畫風描述"
}
```

5. 告知使用者：

```
═══ 階段完成：編劇討論 ═══
故事大綱已儲存至 output/{slug}/{version}/story-outline.json
即將進入分鏡階段，是否繼續？(繼續 / 回退討論 / 暫停)
```

### 步驟 2.5：角色設定圖

1. 讀取 `output/{slug}/{version}/story-outline.json` 的 `characters` 陣列
2. 為每個角色呼叫 `gemini_draw` 生成設定圖：
   - 正面全身圖（aspectRatio: 3:4, imageSize: 2K）
   - 每個表情獨立一張（aspectRatio: 1:1, referenceImages: 正面全身圖）
3. 逐角色呈現給使用者審核：確認 / 重新生成 / 調整描述後重新生成
4. 所有角色確認後，將圖片路徑寫入 story-outline.json 的 `referenceImages` 欄位
5. 告知使用者：

```
═══ 階段完成：角色設定圖 ═══
所有角色設定圖已生成並確認
即將進入分鏡階段，是否繼續？(繼續 / 回退 / 暫停)
```

### 步驟 3：分鏡生成

1. 呼叫 `storyboard` agent，傳入 story-outline.json 的完整內容與漫畫格式
2. 以視覺化格式呈現分鏡結果：

```
📖 第 1 頁（共 N 格）

  【第 1 格】大格
    鏡頭：遠景
    畫面：（畫面描述）
    對白：「對白內容」
    情緒：緊張

  【第 2 格】標準
    鏡頭：特寫
    畫面：（畫面描述）
    對白：
    情緒：驚訝
```

3. **逐格審核**：每格顯示後使用者可選 確認 / 微調 / 跳過
4. 所有格審核完畢後，最終確認：
   - **全部確認** → 儲存至 `output/{slug}/{version}/storyboard.json`，進入步驟 4
   - **修改後重新生成** → 使用者提供修改意見，連同上一版分鏡一起傳給分鏡師重新生成
   - **讀者投票** → 依照 `/vote` skill 流程，讓讀者投票決定分鏡方向
   - **重新生成** → 直接重新生成
   - **回退到討論** → 回到步驟 2

4. 告知使用者：

```
═══ 階段完成：分鏡生成 ═══
分鏡腳本已儲存至 output/{slug}/{version}/storyboard.json
即將進入作畫階段，是否繼續？(繼續 / 回退分鏡 / 暫停)
```

### 步驟 4：作畫生成

1. 讀取 `output/{slug}/{version}/storyboard.json`
2. 逐格呼叫 `gemini_draw` MCP tool 生成圖片：
   - prompt：精簡 150-200 字（畫風 + 角色外觀 tag + 動作表情 + 場景關鍵元素）
   - `aspectRatio`：從分鏡取得（如 16:9, 3:4, 9:16）
   - `imageSize`：從分鏡取得（預設 2K）
   - `referenceImages`：角色設定圖路徑（每格都傳，維持角色一致性）
   - 輸出路徑：`output/{slug}/{version}/pages/p{頁碼}_panel{格號}.png`
   - 每格完成後立即回報：`✓ 第 N 格完成：output/page1_panelN.png`
   - 每格生成後執行品質閘門檢查（圖文一致性、跨格一致性、文字殘留、構圖比例）
   - FAIL 自動修改 prompt 重新生成（最多 2 次）
   - API 失敗自動重試 1 次；仍失敗則記錄並繼續下一格
3. 全部完成後，列出所有生成結果：

```
═══ 作畫完成 ═══
✓ 第 1 格：output/{slug}/{version}/pages/p1_panel1.png
✓ 第 2 格：output/{slug}/{version}/pages/p1_panel2.png
✗ 第 3 格：生成失敗（內容安全過濾）
✓ 第 4 格：output/{slug}/{version}/pages/p1_panel4.png
```

4. 請使用者選擇：
   - **滿意，完成** → 結束流程
   - **重畫第 N 格** → 只重新生成指定格數
   - **調整畫風全部重畫** → 使用者提供新畫風描述，所有格重新生成
   - **回退到分鏡** → 回到步驟 3

### 步驟 5：完成

1. 更新 `output/manifest.json`（新增版本記錄）
2. 儲存流程指標至 `output/{slug}/{version}/metrics.json`：

```json
{
  "episodeId": "ep01",
  "createdAt": "2026-04-03T...",
  "research": { "durationMs": 120000, "materialsCount": 15 },
  "discuss": { "rounds": 2, "proposalCount": 3 },
  "characterDesign": { "characters": 2, "regenerations": 1 },
  "storyboard": { "revisions": 1, "panelAdjustments": 0 },
  "draw": {
    "panels": [
      { "panel": 1, "attempts": 1, "durationMs": 15000, "qualityGate": "PASS" },
      { "panel": 2, "attempts": 2, "durationMs": 35000, "qualityGate": "WARN" }
    ],
    "totalDurationMs": 120000
  }
}
```

2. 列出最終產出：

```
═══ 漫畫創作完成！ ═══
故事大綱：output/{slug}/{version}/story-outline.json
素材包：  output/{slug}/{version}/material-pack.json
角色設定：output/{slug}/{version}/characters/
分鏡腳本：output/{slug}/{version}/storyboard.json
漫畫圖片：output/{slug}/{version}/pages/
後製文字：output/{slug}/{version}/dialogue-overlay.json
流程指標：output/{slug}/{version}/metrics.json
```
