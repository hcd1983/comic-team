# 角色設定圖生成

在編劇討論完成後、分鏡開始前，為每個角色生成設定圖，作為後續生圖的視覺參考錨點。

## 前置條件

- 需要 `output/{slug}/{version}/story-outline.json`（來自 /discuss），且 `characters` 欄位完整
- 環境變數 `GEMINI_API_KEY` 必須已設定

## 流程

1. 讀取 `output/{slug}/{version}/story-outline.json` 的 `characters` 陣列
2. 為每個角色生成設定圖：
   - **正面全身圖**：呼叫 `gemini_draw`，參數：
     - prompt：`Character design sheet. [style]. Full body front view, standing pose, white background, no text, no speech bubbles. [appearance]. [outfit]. Expression: [default expression].`
     - `aspectRatio`: `3:4`（直立全身最適合）
     - `imageSize`: `2K`
   - **表情差分圖**：為每個表情**獨立生成一張圖**（不要擠在同一張），參數：
     - prompt：`Character portrait, [style], white background, no text. [appearance]. Expression: [具體表情描述].`
     - `aspectRatio`: `1:1`
     - `imageSize`: `1K`
     - `referenceImages`: 傳入剛生成的正面全身圖作為參考，維持角色一致性
   - 輸出路徑：
     - `output/{slug}/{version}/characters/{character.id}_front.png`
     - `output/{slug}/{version}/characters/{character.id}_expr_{表情名}.png`
3. 逐個角色呈現設定圖給使用者審核：

```
═══ 角色設定圖：{character.name} ═══
正面全身：output/characters/{id}_front.png
表情差分：output/characters/{id}_expressions.png

選擇：確認 / 重新生成 / 調整描述後重新生成
```

4. 使用者可選擇：
   - **確認** → 進入下一個角色
   - **重新生成** → 重新呼叫 gemini_draw
   - **調整描述後重新生成** → 使用者修改 appearance/outfit 描述，更新 story-outline.json 後重新生成

5. 所有角色確認後，將圖片路徑記錄到 story-outline.json 的對應角色欄位：

```json
{
  "id": "jing",
  "name": "阿靜",
  "appearance": "...",
  "outfit": "...",
  "expressions": { ... },
  "referenceImages": {
    "front": "output/characters/jing_front.png",
    "expressions": "output/characters/jing_expressions.png"
  }
}
```

6. 告知使用者：

```
═══ 階段完成：角色設定圖 ═══
所有角色設定圖已生成並確認
story-outline.json 已更新 referenceImages 欄位
即將進入分鏡階段，是否繼續？(繼續 / 回退 / 暫停)
```

## 注意事項

- 角色設定圖的品質直接影響後續所有格的角色一致性
- 如果設定圖本身不滿意，使用者應在此階段反覆調整直到滿意
- 設定圖使用白色背景，方便後續作為視覺參考
