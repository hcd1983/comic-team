# 影片生成

將已完成的四格漫畫轉為 15-30 秒短影片（9:16，適合 TikTok / Reels / Shorts）。

## 前置條件

- 需要 `output/{slug}/{version}/pages/` 目錄且有漫畫圖片
- 需要 `output/{slug}/{version}/dialogue-overlay.json`
- 需要 `output/{slug}/{version}/storyboard.json`
- 需要 `output/{slug}/{version}/story-outline.json`
- 若缺少，提示使用者先完成漫畫創作（`/create` 或 `/draw`）

## 流程

### 步驟 1：影片企劃

1. 讀取所有漫畫產出檔案
2. 呼叫 `video-editor` agent（小剪），傳入：
   - `storyboard.json`（鏡頭角度、場景描述、aspectRatio）
   - `dialogue-overlay.json`（對白文本、說話者）
   - `story-outline.json`（角色資訊、故事基調）
   - `config/voice-presets.json`（聲優預設）
   - `config/bgm-library.json`（BGM 索引）
3. 小剪產出 `video-config.json`，儲存至 `output/{slug}/{version}/video-config.json`
4. 呈現配置摘要給使用者：

```
═══ 影片企劃 ═══

🎬 總時長：22 秒（+ 3 秒片尾）
🎵 BGM：溫馨感人（warm）

格 1（起）5.0s — fade 進場
  動畫：角色緩慢眨眼，肩膀微微呼吸起伏
  配音：旁白「...」
格 2（承）5.0s — fade 轉場
  動畫：角色微微歪頭，手指輕觸嘴角
  配音：角色A「...」
格 3（轉）5.5s — zoom 轉場
  動畫：角色眼睛微睜，短暫驚訝表情
  配音：角色B「...」
格 4（合）6.5s — fade 轉場
  動畫：角色表情放空，緩慢眨眼
  配音：旁白「...」

聲優分配：
  角色A → 曉臻（年輕女性）
  角色B → 雲哲（年輕男性）
  旁白 → 曉臻（沉穩清晰）

───────────────────────────────────
請選擇：確認 / 調整參數 / 重新企劃
```

### 步驟 2：動畫生成（Veo 2）

1. 根據 `video-config.json` 的 `panels[].animationPrompt`
2. 逐格呼叫 `gemini-animate` MCP server 的 `gemini_animate` tool
3. 傳入：圖片路徑 + animationPrompt + negativePrompt + aspectRatio "9:16"
4. 動畫影片存放：`output/{slug}/{version}/video/panel{N}_animated.mp4`
5. 每格約需 1-3 分鐘生成
6. 將生成的影片路徑回寫到 `video-config.json` 的 `panels[].animatedVideoPath`
7. 回報進度：

```
✓ 格 1 動畫完成：5.0 秒（耗時 92 秒）
✓ 格 2 動畫完成：5.0 秒（耗時 85 秒）
✓ 格 3 動畫完成：5.0 秒（耗時 110 秒）
✓ 格 4 動畫完成：5.0 秒（耗時 78 秒）
```

若某格生成失敗（安全過濾等），自動降級為 Ken Burns 靜態效果。

### 步驟 3：語音生成

1. 根據 `video-config.json` 的 `voiceAssignments` 和 `panels[].tts`
2. 逐句呼叫 `tts-generate` MCP server 的 `generate_speech` tool
3. 音檔存放：`output/{slug}/{version}/audio/p{N}_panel{M}_tts{K}.mp3`
4. 取得每段音檔的實際時長
5. **回寫調整**：根據實際音檔時長，更新 `video-config.json` 的：
   - `panels[].durationSec` = max(原設計時長, 音檔時長 + 0.5s)
   - `panels[].subtitles[].endSec` = 音檔實際時長
   - `totalDurationSec` 重新計算
6. 回報進度：

```
✓ 格 1 配音完成：2.3 秒
✓ 格 2 配音完成：1.8 秒
✓ 格 3 配音完成：1.5 秒
✓ 格 4 配音完成：3.1 秒
語音總長：8.7 秒 → 影片調整為 25 秒
```

### 步驟 4：影片拼接

1. 呼叫 `video-compose` MCP server 的 `render_video` tool
2. 使用動畫片段（`panels[].animatedVideoPath`）拼接為完整影片
3. 加入轉場效果和片尾卡
4. 產出無聲影片：`output/{slug}/{version}/video/raw.mp4`

### 步驟 5：音軌合成

1. 呼叫 `video-compose` MCP server 的 `compose_final` tool
2. 混合：無聲影片 + TTS 音檔 + BGM
3. 產出最終影片：`output/{slug}/{version}/video/final.mp4`
4. 回報：

```
✓ 最終影片合成完成
  檔案：output/{slug}/{version}/video/final.mp4（15.2 MB）
  時長：28 秒（含 3 秒片尾）
```

### 步驟 6：使用者審核

```
═══ 影片生成完成 ═══

最終影片：output/{slug}/{version}/video/final.mp4
時長：28 秒 | 解析度：1080x1920 | 檔案：15.2 MB

───────────────────────────────────
請選擇：
  滿意，完成
  調整配音（修改 TTS 文本或聲優）→ 回到步驟 2
  調整節奏（修改時長、轉場）→ 回到步驟 1
  重新生成 → 回到步驟 1
```

## 注意事項

- 影片為 9:16 直式（適合手機短影片平台）
- 漫畫圖片不修改，Ken Burns 只做攝影機運動
- TTS 生成後以實際音檔時長驅動畫面，確保音畫同步
- BGM 音量預設 0.3，不蓋過配音
- 同一議題最多重新生成 3 次
