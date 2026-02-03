## Context

現行棋盤格以文字「旗」「雷」表示，視覺辨識與一致性不足；排行榜僅記錄時間，缺乏玩家識別。系統為純前端 TypeScript，資料以 localStorage 儲存。

## Goals / Non-Goals

**Goals:**
- 以圖示呈現旗子與地雷，移除文字顯示，但保留可存取性描述。
- 新增暱稱輸入並保存，勝利時將暱稱與時間一起寫入排行榜。
- 與既有 localStorage 資料相容，提供平滑的資料遷移。

**Non-Goals:**
- 不導入後端或跨裝置同步。
- 不建立帳號系統或登入流程。
- 不改變計分規則與排行榜排序邏輯（仍以時間由小到大）。

## Decisions

- **圖示呈現方式**：使用 CSS `background-image` 搭配 inline SVG data URI，避免新增靜態資產檔案，並能在純前端環境直接部署。相較於文字內容，圖示由 CSS 控制大小與對齊，格子內文字保持空白。
  - 替代方案：使用 `<img>` 或新增 `/assets` 圖檔。因專案未包含資產管線，會增加部署與引用複雜度，故不採用。
- **排行榜資料結構**：從 `Record<string, number[]>` 調整為 `Record<string, Array<{ name: string; time: number }>>`，以同時記錄暱稱與時間。
  - 替代方案：分開存一份 `names` 陣列與 `times` 陣列。此方式易造成索引錯位，維護成本高，故不採用。
- **暱稱保存位置**：新增 `settings` 的 `nickname` 欄位或獨立 key 皆可；為集中設定管理，優先擴充 `settings`。

## Risks / Trade-offs

- [資料遷移失敗] → 讀取舊格式時以安全回退機制（保留時間並填入預設暱稱），並在解析失敗時重設為空排行榜。
- [圖示在不同主題下可視性不足] → 以固定色系（與既有 accent 色一致）繪製 SVG，並在 `.cell.open.mine` 使用警示色背景提高辨識。
- [暱稱輸入空白或過長] → 前端限制長度（例如 12 字元），空白時使用預設值「玩家」。

## Migration Plan

- 載入排行榜時偵測資料形態：
  - 若為 `number[]`，轉換為 `{ name: '玩家', time }`。
  - 若為新格式，直接使用。
- 轉換後立即寫回 localStorage，確保後續讀取一致。
- 回滾：若新版出現問題，刪除 localStorage 中 leaderboard key 可回到初始狀態。

## Open Questions

- 預設暱稱要使用「玩家」或「匿名」？
- SVG 圖示風格（實心 vs 線框）是否有偏好？
