# 影片生成

將已完成的四格漫畫轉為 15-30 秒動畫短影片（9:16，適合 TikTok / Reels / Shorts）。
四層音軌：Veo 3 環境音 + BGM + 旁白 TTS + 角色 OS/對白 TTS。

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

🎬 總時長：25 秒（+ 3 秒片尾）
🎵 BGM：melancholy（30%）
🔊 四層音軌：環境音(15%) + BGM(30%) + 旁白(100%) + 角色OS(85%)

格 1（起）7.0s — fade 進場
  動畫：角色緩慢眨眼，呼吸起伏，螢幕光閃爍
  旁白：「深夜，小橙對著螢幕，把情書交給了AI。」
  角色OS：「幫我順一下語氣就好，拜託了。」（whisper）

格 2（承）6.5s — fade 轉場
  動畫：角色微歪頭，手指觸嘴角
  對白：「好像更好了耶⋯⋯」（角色聲優）
  旁白：「她一邊讀，一邊微微點頭。」

格 3（轉）7.0s — zoom 轉場
  動畫：角色眼睛微睜，螢幕反光
  旁白：「螢幕上寫著——」
  對白：「值得注意的是，我對您的情感十分真摯。」（機械腔）

格 4（合）8.0s — fade 轉場
  動畫：角色表情放空，緩慢眨眼
  旁白：「她已不確定⋯⋯」（語速放慢）
  角色OS：「哪句話，是自己說的。」（whisper，餘韻）

聲優分配：
  小橙 → 曉臻（年輕女性）+ thought/whisper 修飾
  旁白 → 曉臻（沉穩，-5% 語速）

───────────────────────────────────
請選擇：確認 / 調整參數 / 重新企劃
```

### 步驟 2：動畫生成（Veo 3）

1. 根據 `video-config.json` 的 `panels[].animationPrompt`
2. 逐格呼叫 `gemini-animate` MCP server 的 `gemini_animate` tool
3. 傳入：圖片路徑 + animationPrompt + negativePrompt + aspectRatio "9:16"
4. Veo 3 預設含環境音（鍵盤聲、環境白噪等），稍後作為 Layer 1 使用
5. 動畫影片存放：`output/{slug}/{version}/video/panel{N}_animated.mp4`
6. 每格約需 30-60 秒生成
7. 將路徑回寫到 `video-config.json` 的 `panels[].animatedVideoPath`
8. 回報進度：

```
✓ 格 1 動畫完成：8 秒（耗時 45 秒）含環境音
✓ 格 2 動畫完成：8 秒（耗時 38 秒）含環境音
✓ 格 3 動畫完成：8 秒（耗時 52 秒）含環境音
✓ 格 4 動畫完成：8 秒（耗時 41 秒）含環境音
```

若某格生成失敗，自動降級為 Ken Burns 靜態效果（無環境音）。

### 步驟 3：語音生成（多層 TTS）

1. 根據 `video-config.json` 的 `panels[].tts`（每格可有多段）
2. 逐句呼叫 `tts-generate` MCP server 的 `generate_speech` tool
3. 根據 `layer` 和 `style` 選擇聲優和語氣：
   - `narration`：使用 narrator 聲優，正常語速
   - `dialogue`：使用角色聲優，正常語氣
   - `character-os`：使用角色聲優 + thought/whisper 修飾
4. 音檔存放：`output/{slug}/{version}/audio/p{N}_tts{K}.mp3`
5. 取得實際時長，回寫路徑到 `tts[].audioPath`
6. 回報：

```
✓ 格 1 旁白完成：3.2 秒
✓ 格 1 角色OS完成：2.8 秒
✓ 格 2 對白完成：1.8 秒
✓ 格 2 旁白完成：2.5 秒
...
TTS 總段數：8 段
```

### 步驟 4：影片拼接

1. 呼叫 `video-compose` MCP server 的 `render_video` tool
2. 自動偵測動畫片段（animatedVideoPath），使用 xfade 轉場拼接
3. 加入片尾卡
4. 產出無聲影片：`output/{slug}/{version}/video/raw.mp4`

### 步驟 5：四層音軌合成

1. 呼叫 `video-compose` MCP server 的 `compose_final` tool
2. 四層混合：
   - **L1 環境音**（15%）：從各格 Veo 3 動畫抽取音軌
   - **L2 BGM**（30%）：背景音樂（fadeIn 1s / fadeOut 2s）
   - **L3 旁白**（100%）：narrator TTS 音檔
   - **L4 角色語音**（85-90%）：角色對白 + OS 音檔
3. 產出最終影片：`output/{slug}/{version}/video/final.mp4`
4. 回報：

```
✓ 最終影片合成完成
  檔案：output/{slug}/{version}/video/final.mp4
  時長：31 秒（28 秒內容 + 3 秒片尾）
  音軌：4 層環境音 + 1 BGM + 8 段 TTS
```

### 步驟 6：使用者審核

```
═══ 影片生成完成 ═══

最終影片：output/{slug}/{version}/video/final.mp4
時長：31 秒 | 解析度：720x1280 | 音軌：四層混合

───────────────────────────────────
請選擇：
  滿意，完成
  調整配音（修改 TTS 文本或聲優）→ 回到步驟 3
  調整動畫（重新生成某格動畫）→ 回到步驟 2
  調整企劃（修改時長、轉場）→ 回到步驟 1
  重新生成 → 回到步驟 1
```

## 注意事項

- 影片為 9:16 直式（適合 TikTok / Reels / Shorts）
- Veo 3 每格生成 8 秒動畫，含原生環境音
- 環境音只作為氛圍底噪（15%），不影響旁白清晰度
- 若 Veo 3 環境音品質不佳，可設 `ambientAudio.volume: 0` 靜音
- 每格可有多段 TTS（旁白 + 對白 + OS），時間軸不重疊
- 同一議題最多重新生成 3 次
