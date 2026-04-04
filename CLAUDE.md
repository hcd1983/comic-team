# Comic Team — 漫畫團隊協作系統

## 專案概述

AI 驅動的漫畫創作工作流：素材搜集 → 多位編劇 Agent 討論故事走向 → 角色設定圖 → 分鏡師生成分鏡 → Gemini API 生成圖片。

## 架構

- **素材搜集員 Agent**（小查）：透過 WebSearch 搜集網路素材，產出素材包供編劇參考
- **編劇 Agent**（阿龍、小雪、老謝）：Claude Code agents，輪流發言討論故事
- **分鏡師 Agent**：將劇本轉為分鏡 JSON，含結構化 promptTemplate
- **導演 Agent**：統籌整體流程、階段轉換、回退管理、結構完整性驗證、觸發讀者投票
- **讀者 Agent** x20（小炎、泡芙、墨子...等）：虛擬讀者，依作品 TA 自動推薦 5-7 位組成投票團
- **剪輯師 Agent**（小剪）：將四格漫畫轉化為短影片配置（運鏡、轉場、配音、BGM）
- **Gemini 生圖**：透過 MCP tool（gemini-draw）呼叫 Gemini API 生成圖片
- **TTS 配音**：透過 MCP tool（tts-generate）使用 Edge TTS 生成中文語音（免費）
- **影片合成**：透過 MCP tool（video-compose）使用 Remotion + FFmpeg 生成短影片

## 目錄結構

```
.claude/agents/     — 素材搜集員、編劇 x3、分鏡師、導演、讀者 x20、剪輯師
.claude/skills/     — create、research、discuss、character-design、storyboard、draw、vote、video
config/             — 讀者標籤、TA 預設、聲優預設、BGM 索引
scripts/            — gemini-draw.mjs、tts-generate.mjs、video-compose.mjs
scripts/            — gemini-draw.mjs（MCP server）
output/             — 漫畫產出（作品/版本隔離）
  manifest.json           — 作品索引（所有作品+版本清單）
  {slug}/                 — 作品目錄（英文小寫+連字號）
    {version}/            — 版本目錄（v1, v2, ...）
      material-pack.json      — 素材包
      story-outline.json      — 故事大綱（含結構化角色/場景）
      storyboard.json         — 分鏡腳本（含 promptTemplate）
      dialogue-overlay.json   — 後製文字清單
      metrics.json            — 流程指標
      characters/             — 角色設定圖
      pages/                  — 漫畫圖片（不含文字）
docs/               — 檢討報告、改善計劃
```

## 環境變數

- `GEMINI_API_KEY`：Gemini API 金鑰（必要）
- `GEMINI_MODEL`：Gemini 模型名稱（預設 gemini-3.1-flash-image-preview）

## Skills

| 指令 | 說明 |
|------|------|
| `/create` | 完整流程：素材搜集 → 討論 → 角色設定圖 → 分鏡 → 生圖 |
| `/research` | 單獨執行素材搜集 |
| `/discuss` | 單獨執行編劇討論 |
| `/character-design` | 單獨執行角色設定圖生成 |
| `/storyboard` | 單獨執行分鏡生成（需要 story-outline.json） |
| `/draw` | 單獨執行生圖（需要 storyboard.json） |
| `/vote` | 讀者投票：依作品 TA 自動推薦讀者組成投票團 |
| `/video` | 影片生成：漫畫轉 15-30 秒短影片（TTS + Ken Burns + BGM） |

## 工作流程

```
主題輸入
    ↓
素材搜集（小查 WebSearch → material-pack.json）
    ↓
編劇討論（輪流發言，使用者決策 → story-outline.json）
    ↓
角色設定圖（正面全身 + 表情差分 → characters/）
    ↓
分鏡生成（分鏡師 → storyboard.json + promptTemplate）
    ↓
作畫生成（Gemini → page{N}_panel{M}.png，不含文字）
    ↓
後製文字（dialogue-overlay.json，手動疊加對白）
    ↓
影片生成（可選：TTS + Remotion + FFmpeg → video/final.mp4）
```

每個階段都可回退到上一階段。
決策分歧時可觸發「讀者投票」（/vote），由 TA 匹配的虛擬讀者投票參考。

## 關鍵設計

- **文字後製化**：AI 生圖不生成任何文字，對白由後製疊加
- **結構化角色設定**：characters 含完整外觀/服裝/表情描述，確保跨格一致
- **promptTemplate**：分鏡師為每格組裝結構化 prompt（150-200 字），draw 直接使用
- **aspectRatio 控制**：每格指定輸出比例（3:4, 16:9, 9:16 等），不再依賴 prompt 描述
- **角色參考圖**：生圖時傳入角色設定圖作為 referenceImages，Gemini 3.x 原生支援
- **品質閘門**：5 項檢查（圖文一致、跨格一致、文字殘留、構圖比例、artifact）
- **讀者投票機制**：20 位虛擬讀者池，10 維度標籤系統，10 種 TA 預設，自動推薦投票團
- **短影片生成**：Remotion（Ken Burns + 轉場）+ Edge TTS（免費配音）+ FFmpeg（音軌合成），零 API 成本

## 漫畫格式

- 單頁漫畫（4-6 格）
- 四格漫畫（固定 4 格：起承轉合）
