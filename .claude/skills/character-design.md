# 角色設定圖生成

在編劇討論完成後、分鏡開始前，為每個角色生成設定圖，作為後續生圖的視覺參考錨點。

## 前置條件

- 需要 `output/story-outline.json`（來自 /discuss），且 `characters` 欄位完整
- 環境變數 `GEMINI_API_KEY` 必須已設定

## 流程

1. 讀取 `output/story-outline.json` 的 `characters` 陣列
2. 為每個角色生成設定圖：
   - **正面全身圖**：呼叫 `gemini_draw`，prompt 組合：
     ```
     Character design sheet. [style from story-outline].
     Full body front view, standing pose, white background, no text, no speech bubbles.
     [character.appearance]. [character.outfit].
     Expression: [character.expressions.default].
     ```
   - **表情差分圖**：呼叫 `gemini_draw`，prompt 組合：
     ```
     Character expression sheet. [style from story-outline].
     Multiple facial expressions of the same character on white background, no text, no labels.
     [character.appearance].
     Expressions: [列出 character.expressions 的所有表情描述].
     ```
   - 輸出路徑：
     - `output/characters/{character.id}_front.png`
     - `output/characters/{character.id}_expressions.png`
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
