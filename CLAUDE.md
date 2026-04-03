# Comic Team — 漫畫團隊協作系統

## 專案概述

AI 驅動的漫畫創作工作流：多位編劇 Agent 討論故事走向 → 分鏡師生成分鏡 → Gemini API 生成圖片。

## 架構

- **編劇 Agent**（阿龍、小雪、老謝）：Claude Code agents，輪流發言討論故事
- **分鏡師 Agent**：將劇本轉為分鏡 JSON
- **導演 Agent**：統籌整體流程、階段轉換、回退管理
- **Gemini 生圖**：透過 MCP tool（gemini-draw）呼叫 Gemini API 生成圖片

## 目錄結構

```
.claude/agents/     — 編劇、分鏡師、導演 agents
.claude/skills/     — create（主流程）、discuss（討論）、storyboard（分鏡）、draw（生圖）
scripts/            — gemini-draw.mjs（MCP server）
output/             — 漫畫產出（JSON + 圖片）
```

## 環境變數

- `GEMINI_API_KEY`：Gemini API 金鑰（必要）
- `GEMINI_MODEL`：Gemini 模型名稱（預設 gemini-2.0-flash-exp）

## Skills

| 指令 | 說明 |
|------|------|
| `/create` | 完整流程：討論 → 分鏡 → 生圖 |
| `/discuss` | 單獨執行編劇討論 |
| `/storyboard` | 單獨執行分鏡生成（需要 output/story-outline.json） |
| `/draw` | 單獨執行生圖（需要 output/storyboard.json） |

## 工作流程

```
主題輸入 → 編劇討論（輪流發言，使用者決策）
              ↓ 輸出 story-outline.json
         分鏡生成（分鏡師 Agent）
              ↓ 輸出 storyboard.json
         作畫生成（Gemini MCP tool 逐格生成）
              ↓ 輸出 page{N}_panel{M}.png
```

每個階段都可回退到上一階段。

## 資料傳遞

階段之間以 JSON 檔案交接，存放於 `output/`：
- `story-outline.json` — 編劇討論產出
- `storyboard.json` — 分鏡腳本
- `page{N}_panel{M}.png` — 漫畫圖片

## 漫畫格式

- 單頁漫畫（4-6 格）
- 四格漫畫（固定 4 格：起承轉合）
