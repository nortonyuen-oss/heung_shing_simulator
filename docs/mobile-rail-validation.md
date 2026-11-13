# 手機鐵路、渡輪、地形及海濱工具（Phase C3）

基線：C2／`dc6852f`（v5.7.0）。手機仍為 Beta，沿用 coarse pointer 及載入 viewport 小於 1100px 自動選擇；直向、橫向均有相同功能。本批接駁 Phase C 餘下 14 個工具：地鐵（站、路軌、地面站、地鐵綫）、電車（路軌、車站、電車綫）、渡輪（碼頭、航線）、海底隧道、避風塘、地形同海濱步道，以及海鮮舫嘅轉向選項。

## 架構：三種機制

- **建造草稿（build-session）**：11 個單點／拖曳／框選工具（`metro-track`、`metro-station`、`metro-surface-station`、`tram-track`、`tram-stop`、`ferry-pier`、`undersea-tunnel`、`typhoon-shelter`、`terrain`、`promenade`、`floating-restaurant`）沿用 Phase B／C1／C2 嘅預覽／確認流程，commit 時直接用現有桌面 writer（`placeMetroStation`、`commitMetroTrackDrag`、`commitTramTrackDrag`、`placeFerryPier`、`placeUnderseaTunnel`、`commitTyphoonShelterPlan`、`setTileType`／`applyRaiseTerrain`等、`placePromenade`／`togglePromenadePierAt`、`placeTyphoonShelterFloatingRestaurant`），唔重複驗證邏輯。
- **直接點擊（`MOBILE_DIRECT_TAP_TOOLS`）**：地鐵綫、電車綫、渡輪航線三個工具每次點擊即刻提交到現有桌面 writer（`handleMetroLineClick`／`handleTramLineClick`／`handleFerryRouteClick`），冇草稿、冇預覽——同桌面點擊一站接一站嘅行為一致，靠 toast 回饋。選呢三個工具時 `mobileSelectTool` 唔開 build-session；`handleMobileMapTap` 直接派發去對應 handler。
- **情境按鈕（無草稿）**：避風塘「出入口」模式下嘅點擊直接去 `handleTyphoonShelterToolClick`（唔經 build-session）；海鮮舫嘅轉向、避風塘水域嘅加／減、地鐵路軌高度、地形筆刷都係 build-session 草稿入面嘅 `options`，確認前隨時改。

## 操作及付款

- **地鐵**：路軌有三個高度（地底／地面／高架），確認列有高度揀選；車站、地面站、路軌全部要人口 30,000 同運輸公司開辦（`isMetroUnlocked`），扣錢先用地鐵撥款（`grantBalance`），唔夠先扣公司現金，兩個都唔夠才扣（絕唔扣市庫）。地面站冇獨立高度選項，跟現有路軌嘅高度自動判斷地底／地面／高架站。
- **電車**：路軌、車站一定要運輸公司已經開辦，否則直接拒絕（冇市庫後備，同桌面 `tramCompanyClosed` 一致）；扣款全部出自公司現金。
- **渡輪碼頭**：沿用岸邊 2×2、開闊水面、3 格內有路嘅驗證；同巴士一樣用 `getTransportConstructionFunds()`（公司開辦後扣公司，否則扣市庫）。
- **海底隧道**：同 `road` 一樣扣市庫，唔經運輸公司。
- **避風塘水域**：新開嘅水域草稿免費（未核准，只畫底，同桌面 Phase 1 行為一致）；觸及已核准嘅避風塘先會即時叫價同扣錢。手機用「水域／出入口」模式切換按鈕（取代桌面嘅工具列 mode bar）同「加／減」按鈕（取代桌面嘅 Shift 鍵）；出入口模式冇草稿，直接點防波堤開關。
- **地形**：矩形框選，筆刷揀選單（草地／泥地／沙灘／水／山丘／升高／降低／拉平），免費；升高／降低／拉平逐格套用桌面嘅 `applyRaiseTerrain`／`applyLowerTerrain`／`applyFlattenTerrain`。地形創作模式下（`isTerrainCreatorMode`）所有觸控工具仍然顯示「之後嘅觸控更新開放」，桌面專用。
- **海濱步道**：矩形鋪設 $400／格，同桌面規則一致；再點一條已鋪好嘅步道（起終點同一格）彈出免費嘅「加／減碼頭」確認，取代桌面嘅右鍵。
- **海鮮舫**：轉向係放置前嘅選項（同車廠轉入口按鈕一樣嘅模式），唔係放置後先轉——同桌面右鍵轉向嘅時機一致（泊之前揀方向）。避風塘未運作中會拒絕，顯示桌面原有嘅拒絕原因。

手機交通頁（底欄「交通」）新增地鐵／電車／渡輪三組，各自顯示工具同即時叫價（讀 `#tool-menu` 現有嘅 `.tool-row-cost`）；原本停用嘅 `metro-new-line`、`metro-new-station`、`metro-extend`、`tram-new-line`、`tram-new-stop`、`tram-track`、`tram-extend`、`ferry-new-route` 全部解封——運輸公司視窗嗰啲按鈕（`pickMetroTool`／`pickTramTool`／`handleFerryUiAction` 嘅 `ferry-new-route`）加咗 `isTouchUiProfile()` 判斷，手機會直接開 `mobileSelectTool`，唔再靠桌面嘅 `#tool-menu` 隱藏按鈕。

## 驗證

`test/mobile-rail-terrain-tools.test.js`：用真實 `planMetroTrack`、`planTramTrack`、`getUnderseaTunnelCrossing`、`computeTyphoonShelterDrag`、`whyNotFerryPierAt`、`whyNotMetroStationAt`、`whyNotTramStopAt`、`whyNotPromenadeAt`、`getTyphoonShelterFloatingRestaurantPlacement` 同真實城市狀態（`getMetroState`／`getTramState`／`getFerryState`／`getTyphoonShelterState`／`getPromenadeState`），只 stub 圖形、材質同 Phaser 精靈；12 個案例覆蓋：高度選項改變叫價、地鐵撥款先扣再扣公司現金（唔扣市庫）、電車冇開公司即刻拒絕冇後備、渡輪碼頭岸邊驗證、避風塘新水域免費同減水域、地形筆刷揀選、海濱步道即建即扣款同已建格免費切換碼頭、海鮮舫未運作拒絕同轉向選項。

`scripts/smoke-mobile-rail.js`：獨立瀏覽器全新城市，40ms 觸控手勢，一次過起海底隧道、三個高度嘅地鐵路軌、兩個地鐵站、一條地鐵綫（直接點兩個站）、電車路軌／車站／電車綫、兩個渡輪碼頭／一條航線、避風塘水域（新建、出入口模式開關、減水域）、地形筆刷、海濱步道（鋪設＋碼頭切換）、海鮮舫（拒絕原因＋轉向）；全部 24 項通過，包括真實瀏覽器零未捕捉錯誤。

結果及截圖保存在 `.data/mobile-rail/`（不入版控）。

## 已知限制（留待之後）

- 鐵路／電車路軌同車站嘅拆除仍未開放觸控（`mobile.demolitionTransport`，同 Phase B 嘅既有限制一致）：拆咗會影響現有路線，完整摘要留 Phase C 之後批次。
- 避風塘已核准嘅擴建／削減（`works.approved` 後嘅改動）跳過桌面「確定擴建」二次確認，直接用 build-session 自己嘅「預覽後再確認」把關——同一個安全網，少一個介面概念，但未經真機驗證。
- 真機矩陣（iPhone／Android／iPad）、無障礙同效能仍屬 Phase D，唔以桌面觸控模擬代替。
