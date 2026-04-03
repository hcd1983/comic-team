# 修改計劃：Comic Team 流程優化

> 基於第一話《社恐女孩的內心小劇場》創作檢討報告
> 日期：2026-04-03

---

## 概述

四個階段的修改計劃，核心目標：解決 AI 生圖品質問題（文字亂碼、角色不一致、畫風不統一）、提升編劇討論品質（含外部素材搜集）、建立自動化品質把關機制。

---

## Phase 1：P0 — 生圖品質基礎建設（大）

### 1-1. 擴充 story-outline.json 資料結構

**修改**：`skills/discuss.md`、`skills/create.md`

- `characters` 欄位升級：`{ id, name, personality, appearance, outfit, expressions }`
- 新增 `scenes` 欄位：`{ id, description（含色調、光源、物件配置）}`
- `plotPoints` 升級為結構化物件：`{ beat, scene, characters, event, emotion_target }`

### 1-2. 更新編劇 Agents 產出規格

**修改**：`agents/scriptwriter-a.md`、`scriptwriter-b.md`、`scriptwriter-c.md`

- 提出角色時必須描述外觀特徵（髮型、髮色、五官）、服裝、至少 2 種表情
- 提出場景時必須描述色調、光源、主要物件

### 1-3. 導演驗證結構完整性

**修改**：`agents/director.md`

- 討論完成時驗證 story-outline.json 是否包含完整的 characters/scenes 欄位
- 不完整則要求編劇補充

### 1-4. 建立結構化 prompt 模板

**修改**：`agents/storyboard.md`、`skills/storyboard.md`、`skills/draw.md`

- 分鏡師每格輸出新增 `promptTemplate` 欄位
- 固定順序：stylePrefix → composition → scene → characters → mood
- **強制包含** `no text, no speech bubbles, no dialogue, no words, no letters`

### 1-5. 新增角色設定圖步驟

**新增**：`skills/character-design.md`
**修改**：`skills/create.md`、`agents/director.md`

- 討論完成後、分鏡前，為每角色生成設定圖（正面全身、表情差分）
- 輸出至 `output/characters/{id}_front.png`
- 使用者審核確認
- 圖片路徑記錄到 story-outline.json

### 1-6. 文字完全後製化

**修改**：`skills/draw.md`

- prompt 永遠包含 `no text, no speech bubbles`
- 生圖完成後產出 `output/dialogue-overlay.json`（每格的對白、位置提示）
- 列出後製文字清單供手動疊加

**依賴關係**：
```
1-1 → 1-2 → 1-3
1-1 → 1-4 → 1-6
1-1 + 1-3 → 1-5
```

---

## Phase 2：P1 — 素材搜集 + 編劇討論改進 + 品質閘門（大）

### 2-0. 新增素材搜集環節（可與 Phase 1 平行執行）

**新增**：`agents/researcher.md`、`skills/research.md`
**修改**：`skills/discuss.md`、`skills/create.md`、`agents/director.md`、三位編劇 agents、`CLAUDE.md`

**問題**：編劇「閉門造車」，提案停留在概念層級，笑點不具體、缺乏市場感。

**解法**：在編劇討論**前**，由素材搜集員 agent「小查」透過 WebSearch 大量搜集外部素材。

**流程變更**：
```
現有：主題 → 編劇討論 → 分鏡 → 作畫
新增：主題 → 【素材搜集】 → 編劇討論 → 分鏡 → 作畫
```

**搜集四大類素材**：

| 類別 | 說明 |
|------|------|
| 熱門梗/迷因 | PTT、Dcard、Twitter/X 上的流行笑點 |
| 經典橋段 | 同類漫畫/動畫的經典手法 |
| 社群討論 | 相關主題的真實討論與觀點 |
| 受眾吐槽點 | 目標族群的共鳴素材 |

**產出**：`output/material-pack.json`

```json
{
  "theme": "主題",
  "targetAudience": "上班族 / 學生 / 通用",
  "categories": {
    "trending_memes": [
      {
        "title": "素材標題",
        "source": "來源平台",
        "content": "具體內容描述",
        "relevance": "與主題關聯性",
        "usageHint": "如何應用在漫畫中"
      }
    ],
    "classic_tropes": [...],
    "community_discussions": [...],
    "audience_pain_points": [...]
  },
  "summary": {
    "topInsights": ["最值得利用的發現 1", "..."],
    "avoidList": ["已被用爛的梗 1", "..."],
    "suggestedAngles": ["建議切角 1", "..."]
  }
}
```

**編劇引用方式**：三位編劇行為規範新增「參考素材包，引用具體的梗和吐槽點，標註出處，結合自身風格二次創作」。

**依賴**：無（可與 Phase 1 平行執行）
**工作量**：中

### 2-1. 編劇討論改為序列式 + 導演主動引導

**修改**：`skills/discuss.md`、`skills/create.md`、`agents/director.md`、三位編劇 agents

- 提案階段：A 先提 → B 讀 A 後提不同方向 → C 讀 A、B 後再提
- 導演在討論前先給限制條件（禁區、目標受眾、必含元素）
- 選定方向後新增「三人共同深化」環節
- 搞笑類作品新增「笑點測試」環節（列出 3 個具體笑點場景）

### 2-2. 作畫品質閘門

**新增**：`skills/quality-gate.md`
**修改**：`skills/draw.md`、`skills/create.md`

- 每格生成後執行三項檢查：
  1. 圖文一致性（vision model 比對 prompt vs 圖片）
  2. 跨格一致性（角色外觀前後比對）
  3. 文字殘留檢查
- 結果分級：PASS / WARN / FAIL
- FAIL 自動重新生成（最多 2 次），仍失敗標記供手動處理

**依賴**：Phase 1 全部完成

---

## Phase 3：P2 — 使用者體驗改善（中）

### 3-1. 分鏡逐格審核與微調

**修改**：`skills/storyboard.md`、`skills/create.md`、`agents/storyboard.md`

- 改為逐格確認：每格顯示後可選 確認 / 微調 / 跳過
- 微調只重新生成該格分鏡描述，不影響其他格

### 3-2. 替代生圖模型評估

**新增**：`docs/model-evaluation.md`

- 評估框架：角色一致性、畫風穩定性、中文處理、API 可用性、成本
- 候選：Gemini Imagen、SD XL + IP-Adapter、Midjourney --cref、DALL-E 3
- 設計 A/B 比較實驗

**依賴**：3-1 依賴 Phase 1；3-2 無依賴（可平行）

---

## Phase 4：P3 — 長期優化（中）

### 4-1. 作畫平行化

**修改**：`skills/draw.md`、`scripts/gemini-draw.mjs`

- 序列生成改為可配置並行（同時 2 格），加入 rate limit 控制

### 4-2. 流程指標追蹤

**修改**：`skills/create.md`、`scripts/gemini-draw.mjs`
**新增**：`output/metrics.json`（自動產生）

- 追蹤各階段耗時、重試次數、品質閘門結果
- gemini-draw 回傳新增 `durationMs` 欄位

**依賴**：Phase 2 完成

---

## 全局依賴圖

```
Phase 1（生圖基礎）
  ├── 1-1 資料結構升級
  │     ├── 1-2 編劇 agents
  │     │     └── 1-3 導演驗證
  │     ├── 1-4 prompt 模板
  │     │     └── 1-6 文字後製化
  │     └── 1-5 角色設定圖
  │
Phase 2（素材搜集 + 討論 + 閘門）
  ├── 2-0 素材搜集環節 ← 無依賴，可與 Phase 1 平行
  ├── 2-1 序列式討論 ← Phase 1
  └── 2-2 品質閘門 ← Phase 1
  │
Phase 3（體驗改善）← Phase 1，可與 Phase 2 部分平行
  ├── 3-1 逐格審核 ← 依賴 1-4
  └── 3-2 模型評估 ← 無依賴
  │
Phase 4（長期優化）← Phase 2
  ├── 4-1 平行生成
  └── 4-2 指標追蹤
```

---

## 受影響檔案總覽

### 修改（11 個）

| 檔案 | Phase |
|------|-------|
| `.claude/skills/discuss.md` | 1, 2 |
| `.claude/skills/create.md` | 1, 2, 3, 4 |
| `.claude/skills/storyboard.md` | 1, 3 |
| `.claude/skills/draw.md` | 1, 2, 4 |
| `.claude/agents/director.md` | 1, 2 |
| `.claude/agents/storyboard.md` | 1, 3 |
| `.claude/agents/scriptwriter-a.md` | 1, 2 |
| `.claude/agents/scriptwriter-b.md` | 1, 2 |
| `.claude/agents/scriptwriter-c.md` | 1, 2 |
| `scripts/gemini-draw.mjs` | 4 |
| `CLAUDE.md` | 2 |

### 新增（5 個）

| 檔案 | Phase |
|------|-------|
| `.claude/skills/character-design.md` | 1 |
| `.claude/agents/researcher.md` | 2 |
| `.claude/skills/research.md` | 2 |
| `.claude/skills/quality-gate.md` | 2 |
| `docs/model-evaluation.md` | 3 |

---

## 風險與應對

| 風險 | 嚴重度 | 應對 |
|------|--------|------|
| 角色設定圖本身也不一致 | 高 | 允許多次重生+手動挑選；長期考慮 IP-Adapter |
| 品質閘門誤判率高 | 中 | 初期寬鬆閾值，僅攔截明顯錯誤，逐步校準 |
| 結構化 prompt 過長被忽略 | 中 | 測試最佳長度區間，優先保留風格前綴和角色描述 |
| WebSearch 搜不到有用素材 | 中 | 多組關鍵字策略；搜不到時明確告知，不硬湊 |
| 編劇過度依賴素材失去原創性 | 中 | 強調「二次創作」而非照搬，素材只是靈感來源 |

---

## 建議執行順序

1. Phase 1 的 1-1 + 1-4 + 1-6（結構 + 模板 + 後製化）一起做
2. **同時** Phase 2-0 素材搜集環節（與 Phase 1 平行，無依賴）
3. Phase 1 的 1-2 + 1-3（編劇/導演更新）
4. Phase 1 的 1-5（角色設定圖）
5. **用新流程跑一次第二話測試**
6. 根據第二話結果決定 Phase 2-1、2-2 的優先序
7. Phase 3、4 依需求調整
