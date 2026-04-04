# 分鏡生成

將確認的劇本轉換為分鏡腳本。

## 前置條件

- 需要 `output/{slug}/{version}/story-outline.json`（來自 /discuss），或使用者手動提供劇本內容
- 若檔案不存在，提示使用者先執行 `/discuss` 或直接輸入劇本

## 流程

1. 讀取 `output/{slug}/{version}/story-outline.json`，若不存在則詢問使用者提供劇本內容
2. 詢問漫畫格式（若未指定）：
   - **單頁漫畫**（4-6 格）
   - **四格漫畫**（固定 4 格：起承轉合）
3. 呼叫 `storyboard` agent，傳入 story-outline.json 的完整內容（含 characters、scenes）與漫畫格式
   - 分鏡師會為每格生成 `promptTemplate`，這是給 AI 生圖用的結構化 prompt
   - `promptTemplate` 會引用 story-outline.json 的 characters 和 scenes，確保跨格一致性
4. 以視覺化格式呈現分鏡結果：

```
📖 第 1 頁（共 N 格）

  【第 1 格】大格
    鏡頭：遠景
    畫面：（畫面描述）
    對白：「對白內容」
    情緒：緊張
    Prompt：（promptTemplate 組裝後的完整 prompt 預覽）

  【第 2 格】標準
    鏡頭：特寫
    畫面：（畫面描述）
    對白：
    情緒：驚訝
    Prompt：（promptTemplate 組裝後的完整 prompt 預覽）
```

**注意**：prompt 預覽讓使用者在分鏡階段就能確認生圖指令是否正確，避免進入作畫階段才發現問題。

5. **逐格審核**：每格顯示後，使用者可選擇：
   - **確認此格** → 進入下一格
   - **微調此格** → 使用者提供修改意見，只重新生成此格的分鏡描述和 promptTemplate
   - **跳過** → 稍後再看

6. 所有格審核完畢後，顯示完整分鏡供最終確認：
   - **全部確認** → 儲存至 `output/{slug}/{version}/storyboard.json`，完成
   - **修改後重新生成** → 使用者提供修改意見，連同上一版分鏡一起傳給分鏡師重新生成（不是從零開始）
   - **讀者投票** → 依照 `/vote` skill 流程，讓讀者投票比較不同分鏡版本或爭議格
   - **重新生成** → 直接重新呼叫分鏡師
   - **回退到討論** → 提示使用者執行 `/discuss` 重新討論

7. 確認後儲存分鏡 JSON 至 `output/{slug}/{version}/storyboard.json`，告知使用者檔案路徑。
