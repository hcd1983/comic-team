# Comic Team — 漫畫團隊協作系統

## 專案概述

AI 驅動的漫畫創作工作流：素材搜集 → 多位編劇 Agent 討論故事走向 → 角色設定圖 → 分鏡師生成分鏡 → Gemini API 生成圖片。

## 架構

- **素材搜集員 Agent**（小查）：透過 WebSearch 搜集網路素材，產出素材包供編劇參考
- **編劇 Agent**（阿龍、小雪、老謝）：Claude Code agents，輪流發言討論故事
- **分鏡師 Agent**：將劇本轉為分鏡 JSON，含結構化 promptTemplate
- **導演 Agent**：統籌整體流程、階段轉換、回退管理、結構完整性驗證
- **Gemini 生圖**：透過 MCP tool（gemini-draw）呼叫 Gemini API 生成圖片

## 目錄結構

```
.claude/agents/     — 素材搜集員、編劇 x3、分鏡師、導演
.claude/skills/     — create、research、discuss、character-design、storyboard、draw
scripts/            — gemini-draw.mjs（MCP server）
output/             — 漫畫產出（JSON + 圖片）
  material-pack.json      — 素材包
  story-outline.json      — 故事大綱（含結構化角色/場景）
  characters/             — 角色設定圖
  storyboard.json         — 分鏡腳本（含 promptTemplate）
  dialogue-overlay.json   — 後製文字清單
  page{N}_panel{M}.png    — 漫畫圖片（不含文字）
docs/               — 檢討報告、改善計劃
```

## 環境變數

- `GEMINI_API_KEY`：Gemini API 金鑰（必要）
- `GEMINI_MODEL`：Gemini 模型名稱（預設 gemini-2.5-flash-image）

## Skills

| 指令 | 說明 |
|------|------|
| `/create` | 完整流程：素材搜集 → 討論 → 角色設定圖 → 分鏡 → 生圖 |
| `/research` | 單獨執行素材搜集 |
| `/discuss` | 單獨執行編劇討論 |
| `/character-design` | 單獨執行角色設定圖生成 |
| `/storyboard` | 單獨執行分鏡生成（需要 story-outline.json） |
| `/draw` | 單獨執行生圖（需要 storyboard.json） |

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
```

每個階段都可回退到上一階段。

## 關鍵設計

- **文字後製化**：AI 生圖不生成任何文字，對白由後製疊加
- **結構化角色設定**：characters 含完整外觀/服裝/表情描述，確保跨格一致
- **promptTemplate**：分鏡師為每格組裝結構化 prompt，draw 直接使用

## 漫畫格式

- 單頁漫畫（4-6 格）
- 四格漫畫（固定 4 格：起承轉合）
