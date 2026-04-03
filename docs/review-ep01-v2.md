# 第一話第二次創作檢討報告

> 作品：《兩個蘇暮》第一話
> 日期：2026-04-04
> 參與檢討：美術總監、流程架構師、技術架構師

---

## 一、與第一次比較

| 項目 | 第一次 | 第二次 | 改善 |
|------|--------|--------|:---:|
| 服裝一致性 | 每格不同 | 四格都穿帽T | ✓ |
| 色調節奏 | 隨機 | 冷→暖→冷→灰 | ✓ |
| 文字問題 | 中文變英文/日文 | 無文字殘留 | ✓ |
| 構圖比例 | 全部正方形 | 全部正方形 | ✗ |
| 角色臉部一致性 | 完全不同人 | 仍有漂移 | △ |
| 細節道具（電量條） | 無 | 不精確 | △ |

**進步約 15-20%，但核心問題未解決。**

## 二、三大致命問題與根因

### 1. 構圖比例不受控
- **現象**：要求橫條/直條，全部輸出正方形
- **根因**：`gemini-2.5-flash-image` 不支援 `imageConfig.aspectRatio` 參數，prompt 中的比例描述被忽略
- **解法**：升級模型至 `gemini-3.1-flash-image-preview`，使用 `imageConfig: { aspectRatio: "16:9" }`

### 2. 角色跨格漂移
- **現象**：臉型、線條粗細跨格不一致
- **根因**：每格獨立 API call，模型無跨圖記憶；角色設定圖只存路徑未實際傳入
- **解法**：升級至 Gemini 3.x，支援 `referenceImages`（最多 14 張），每格傳入角色設定圖

### 3. UI 元素不精確
- **現象**：電量條數字/位置/樣式隨機
- **根因**：AI 圖像生成不擅長精確 UI 渲染
- **解法**：UI 元素改為後製疊加（SVG 模板），不讓 AI 生成

## 三、品質閘門失效分析

品質閘門漏檢了：
- **構圖比例** — 完全沒檢查圖片長寬比
- **Artifact** — 第 4 格白色十字線未被攔截
- **UI 精確度** — 電量條偏差未被視為問題

已修正：新增「構圖比例檢查」和「Artifact 檢查」，從 3 項擴充為 5 項。

## 四、Gemini API 研究結果

### 關鍵發現

| 功能 | gemini-2.5-flash-image（舊） | gemini-3.1-flash-image-preview（新） |
|------|:---:|:---:|
| aspectRatio 控制 | 有限 | ✓ 14 種比例 |
| imageSize 控制 | 有限 | ✓ 512/1K/2K/4K |
| 角色參考圖 | ✗ | ✓ 最多 14 張 |
| 最大解析度 | 1K | 4K |
| 多輪編輯 | 有限 | ✓ Thought Signatures |
| 價格（圖片輸出） | 較低 | $0.067/張 |

### API 使用方式

```javascript
// aspectRatio + imageSize
generationConfig: {
  responseModalities: ['image', 'text'],
  imageConfig: {
    aspectRatio: '3:4',
    imageSize: '2K'
  }
}

// 角色參考圖
contents: [
  { text: 'prompt' },
  { inlineData: { mimeType: 'image/png', data: base64角色設定圖 } }
]
```

## 五、已實施的改善

| # | 改善 | commit |
|---|------|--------|
| 1 | gemini-draw.mjs 新增 imageConfig（aspectRatio, imageSize） | ✓ |
| 2 | gemini-draw.mjs 新增 referenceImages 傳入 | ✓ |
| 3 | 模型升級為 gemini-3.1-flash-image-preview | ✓ |
| 4 | storyboard agent 新增 aspectRatio/imageSize 欄位 | ✓ |
| 5 | draw skill 傳入 aspectRatio + referenceImages | ✓ |
| 6 | character-design 使用 imageConfig + 獨立表情圖 | ✓ |
| 7 | quality-gate 新增構圖比例 + artifact 檢查 | ✓ |
| 8 | prompt 長度控制在 150-200 字 | ✓ |

## 六、預期改善效果

| 問題 | 預期效果 |
|------|---------|
| 構圖比例 | **徹底解決** — API 層面控制，不再依賴 prompt |
| 角色一致性 | **大幅改善** — referenceImages 提供視覺錨點 |
| prompt 遵從度 | **改善** — 150 字精簡 prompt，關鍵指令權重提升 |
| 品質閘門 | **改善** — 5 項檢查覆蓋之前漏檢的問題 |
| UI 元素 | **待驗證** — 仍建議後製，但可測試新模型效果 |

## 七、下一步

用改善後的流程重跑第三次《兩個蘇暮》，驗證以上改善是否有效。
