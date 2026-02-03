## ADDED Requirements

### Requirement: 旗子以圖示呈現
系統 SHALL 在玩家插旗的格子上顯示旗子圖示，且不以文字顯示旗子內容。

#### Scenario: 插旗後顯示旗子圖示
- **WHEN** 玩家在未開啟的格子插旗
- **THEN** 該格子顯示旗子圖示且文字內容為空白

### Requirement: 地雷以圖示呈現
系統 SHALL 在地雷被揭露時顯示地雷圖示，且不以文字顯示地雷內容。

#### Scenario: 遊戲結束揭露地雷
- **WHEN** 遊戲結束並揭露地雷格子
- **THEN** 地雷格子顯示地雷圖示且文字內容為空白

### Requirement: 圖示具可存取性描述
系統 SHALL 為旗子與地雷格子維持對應的 aria-label 描述，以支援輔助工具。

#### Scenario: 旗子格子具有 aria-label
- **WHEN** 格子處於已插旗狀態
- **THEN** 格子保有「已插旗」的 aria-label

#### Scenario: 地雷格子具有 aria-label
- **WHEN** 格子揭露地雷
- **THEN** 格子保有「地雷」的 aria-label
