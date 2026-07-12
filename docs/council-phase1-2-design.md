# 市議會系統 Phase 1–2 設計規格

狀態：Phase 1 已實作；Phase 2 及特別議案首輪已接入，持續平衡及驗證
範圍：Phase 1「角色與情境評論」及 Phase 2「法案審議與投票」  
原則：先使用規則及對白模板，不依賴 AI；保留現有城市模擬效果；所有人物顯示名稱日後均可修改。

## 1. 目標

現有遊戲已具備立法會建築、立法會視窗、預算資料及 `CITY_POLICY_DEFS` 法案清單。本功能要令 `UI/officials/` 的 10 位人物成為可辨認、立場一致、會回應城市狀況的角色。

Phase 1 要做到：

- 在立法會視窗看到 10 位人物、職位、身份及目前關注事項。
- 玩家調整稅率、部門撥款或查看法案時，收到 1–3 個相關人物的情境評論。
- 評論必須引用真實遊戲狀態，並避免拖動 slider 時洗版或短期重複。
- Phase 1 不改變現有預算及法案效果。

Phase 2 要做到：

- 法案不再按一下便即時生效，而要經過「草案 → 辯論 → 投票 → 生效／否決」。
- 政府官員提供意見但不投票；議員投票。
- 投票可解釋、可預測、可保存，角色立場不可純隨機。
- 已生效法案可提出廢除，並經同一套簡化審議程序。

## 2. 設計原則

1. **穩定 ID、可變名稱**：程式、存檔及對白只引用 `officialId`；名稱及職位是可本地化的顯示資料。
2. **角色立場一致**：同一角色在相近條件下應作出相近判斷。
3. **數據先於對白**：先由規則決定立場及理由，再選擇對白模板。
4. **少量不確定性**：可在接近中立時加入小幅波動，但不可蓋過角色核心立場。
5. **向後兼容**：舊存檔沒有議會狀態時，載入後補上預設值；現有 `activePolicies` 繼續作為政策實際效果的唯一開關。
6. **中英可本地化**：名稱、職位、議題、理由及對白使用 i18n key，不把人物名稱寫死在邏輯內。
7. **不設善惡軸**：每個人物按自己的價值觀、利益與城市數據作判斷；遊戲不把任何立場標成「正確」。
8. **同票不同理由**：兩人可以投相同一票，但支持理由不同，甚至互不欣賞。

## 3. 角色名冊

以下名稱只屬初始顯示名稱，可以日後修改。`id` 及角色職能才是長期穩定介面。

| 穩定 ID | 初始角色／職位 | 類型 | 肖像 | 投票權 | 核心議題 |
|---|---|---|---|---|---|
| `chief_executive` | 行政長官 | 主席 | `chiefExecutive.PNG` | 只處理平票 | 財政、民望、整體施政 |
| `treasury_head` | 財政司長 | 官員 | `headOfTreasury.PNG` | 否 | 收支、稅率、債務、信用 |
| `police_head` | 警務處長 | 官員 | `headOfPoliceForce.PNG` | 否 | 治安、警察撥款、法治 |
| `observatory_head` | 天文台台長 | 官員 | `headOfObservatory.PNG` | 否 | 天氣、污染、災害準備 |
| `culture_head` | 康樂文化署署長 | 官員 | `headOfLeisureAndCulturalService.PNG` | 否 | 公園、文化、旅遊、幸福度 |
| `councillor_democracy` | 民主派議員 | 議員 | `councilMember-democracyParty.PNG` | 是 | 選舉、法治、教育、公共服務 |
| `councillor_liberty` | 自由派議員 | 議員 | `councilMamber-freedom.PNG` | 是 | 低稅、個人自由、有限政府 |
| `councillor_business` | 商界議員 | 議員 | `councilMember-business.PNG` | 是 | 商業、投資、股市、稅務 |
| `councillor_tourism` | 旅遊界議員 | 議員 | `councilMember-tourism.PNG` | 是 | 旅遊、環境、文化設施 |
| `councillor_religion` | 宗教界議員 | 議員 | `councilMember-religion.PNG` | 是 | 社區、健康、教育、傳統價值 |

### 角色創作設定

角色定義分成兩層：

- **穩定玩法層**：核心信念、議題權重、固執度、關係及事件觸發條件，用於計算。
- **可修改演出層**：名字、綽號、年齡、口頭禪、語氣及誇張喜劇描述，只用於呈現。

如此日後可以改人物名稱或收斂某些笑話，而不影響存檔及平衡。

#### 行政長官（玩家）

- 性格：沉著、理性、情緒控制極高，不屬任何派系。
- 核心信念：「政府係用嚟解決問題。」
- 權力：提出議程、最終否決權、平票決定。
- 制約：民望過低時施政能力下降；Phase 2 先表現為否決權冷卻或信任修正受限，實際門檻待平衡測試。
- 角色功能：代表玩家，不由 comment engine 自動替玩家表態。

#### 財政司長（Bow Tie 叔）

- 性格：海外名校 MBA、數據至上、相信市場自行修正。
- 核心信念：「數字唔會呃人。」
- 容易支持：減稅、盈餘、良好信用評級、經濟與股市增長。
- 最抗拒：赤字、借貸、缺乏財源的福利及津貼。
- 特殊反應：庫房非常充裕時建議「派糖」；嚴重赤字時建議「全體減薪」。
- 固執度：5/5；幾乎不支持沒有融資方案的赤字預算。

#### 警務處長

- 性格：刻意有型、說話慢、帶港產警匪片主角感。
- 核心信念：「法律就是法律。」
- 容易支持：警力、閉路電視、監獄、治安及安全相關措施。
- 最抗拒：犯罪、暴動及削減警察資源；對示威及監控議題與民主派有根本分歧。
- 特殊反應：犯罪率過高時要求增加警力。
- 固執度：5/5；犯罪及執法議題立場極強硬。

#### 天文台台長（風扇阿伯）

- 性格：極度節儉，傾向用最少能源解決問題。
- 核心信念：「冷氣令人懶。」
- 容易支持：樹木、空氣質素、太陽能、節能及回收。
- 最抗拒：能源浪費、過度冷氣使用及核電。
- 特殊反應：炎熱月份會說「心靜自然涼」，並提出節能建議。
- 固執度：5/5；節能與冷氣相關議題幾乎不讓步。

#### 康樂文化署署長（追星文化迷）

- 性格：親和、平時專業，但遇上偶像及大型演唱會會非常興奮。
- 核心信念：「文化可以令市民幸福。」
- 容易支持：演唱會、流行文化、電影節、公園、嘉年華、煙花、花展及藝術節。
- 最抗拒：削減文化預算、停辦活動及過於沉悶的城市發展。
- 特殊事件：國際巨星來訪時提出「加場」及文化預算臨時增加 30%；成功舉辦可帶來短期幸福度提升，但實際數值須經平衡測試。
- 隱藏反應：城市名人／文化吸引力高時，工作效率或活動成效獲小幅加成。
- 固執度：3/5；大型活動及偶像相關誘因容易令她改變次要立場。

#### 民主派議員（長毛煙民）

- 性格：情緒化，激動時發言很長。
- 核心信念：「人民先係主人。」
- 容易支持：福利、公共醫療、教育、民主及透明度。
- 最抗拒：警察擴權、監控及財團利益凌駕公共利益。
- 特殊事件：失業率過高時發起拉布；Phase 2 表現為延長審議演出或延遲表決，不讓事件永久鎖死遊戲。
- 固執度：4/5；福利、教育及公民權利立場鮮明。

#### 自由派議員（八字眉）

- 性格：斯文、克制，常以「其實我有少少意見」開始反對。
- 核心信念：「政府越細越好。」
- 容易支持：私營、減稅、創業、科技及自由市場。
- 最抗拒：官僚、規管及長期補貼。
- 特殊事件：政府部門或行政開支過大時要求削減公務員／行政成本。
- 固執度：3/5；會看數據，有可信成本效益時可被說服。

#### 商界議員（旗袍女神）

- 性格：65 歲、氣場強、重視形象，出席公開活動如走 catwalk，內心以 ROI 衡量政策。
- 核心信念：「成功人士，就應該有成功人士嘅生活。」
- 容易支持：豪宅、名店、高級酒店、金融中心、國際品牌、奢侈消費及高端旅遊。
- 最抗拒：加稅、勞工規管，以及她認為會降低高端城市形象的項目。
- 特殊反應：股市大跌時反覆強調「市場信心」；五星酒店、豪華商場等項目會大幅提高支持傾向。
- 演出彩蛋：大型典禮可隨機換旗袍；外國代表出席時爭取第一排及望鏡頭。彩蛋不影響投票。
- 固執度：4/5；利益與高端形象足夠強時會支持，否則不易動搖。

#### 旅遊界議員（綠茶）

- 性格：社交媒體重度使用者，首先考慮政策是否「好打卡」。
- 核心信念：「城市一定要吸引。」
- 容易支持：海濱、美食、節慶、地標、夜景及打卡位。
- 最抗拒：污染、破舊環境及不利城市景觀的工業設施。
- 特殊事件：旅客數字破紀錄時自拍慶祝，短期提高與康文署合作意願。
- 固執度：2/5；最容易受即時旅遊及城市吸引力數據影響。

#### 宗教界議員（牧師）

- 性格：說話慢、笑容難以解讀，表決前保持懸念。
- 核心信念：「社會需要道德。」
- 容易支持：家庭、長者、教育、義工、社區及醫療。
- 最抗拒：賭博、毒品及暴力。
- 特殊事件：重大災難後呼籲全民互助，帶來短期小幅幸福度／社區韌性效果。
- 固執度：3/5；容易受社會氣氛、災難及道德事件影響。

### 名稱修改策略

- `officialId` 永不由顯示名稱產生，改名不需要存檔 migration。
- 初始名稱以 `official.<id>.name`、職位以 `official.<id>.title` 儲存在 i18n。
- 如日後允許玩家自訂名稱，存檔只保存 `council.customNames[officialId]`。
- UI 顯示名稱的優先次序：玩家自訂名稱 → i18n 名稱 → `officialId` fallback。
- 肖像路徑屬角色定義資料；日後可換圖而不改存檔。

## 4. 靜態資料設計

建議新增獨立角色及議題定義檔，避免繼續擴大 `constants.js`。以下是概念 schema，不是最終 code：

```text
OfficialDefinition
  id
  nameKey
  titleKey
  role: chair | official | councillor
  portrait
  voteWeight
  issueWeights: Record<IssueId, -2..2>
  likes: TagId[]
  dislikes: TagId[]
  coreBeliefKey
  stubbornness: 1..5
  fiscalPreference: austerity | balanced | spending
  tone: pragmatic | formal | outspoken | idealist | conservative
  expertise: IssueId[]
  specialEventIds: SpecialEventId[]
```

Phase 1–2 的共用議題 `IssueId`：

- `finance`
- `tax`
- `roads`
- `public_safety`
- `environment`
- `parks_culture`
- `education`
- `health`
- `business`
- `tourism`
- `governance`
- `science`
- `disaster_readiness`

`TagId` 比 `IssueId` 更具體，例如 `cctv`、`luxury_hotel`、`concert`、`welfare`、`nuclear_power`。法案及未來建築可帶多個 tag，人物喜惡便可重用，而不用為每個角色逐條法案寫死判斷。

### 固執度

`stubbornness` 是隱藏值，玩家只從人物一貫行為及措辭中推斷，不直接顯示星數。它不等於「永遠反對」，而是控制：

- 核心信念權重有多難被城市短期數據蓋過。
- 信任、私人關係及邊界波動可改變投票的最大幅度。
- 角色在討論中改口的機率。

建議效果：1 星最多容許約 ±2 的情境修正；5 星只容許約 ±0.5 的非核心修正。城市存在真正嚴重危機時仍可觸發例外，避免人物變成無視現實的固定按鈕。

### 私人關係

關係使用「有方向」的 `-100..100` 數值；A 對 B 的觀感不一定等於 B 對 A。初始關係例子：

| A | B | 初始傾向 | 演出效果 |
|---|---|---:|---|
| 財政司長 | 商界議員 | +30 | 容易互相引用經濟論據 |
| 康文署署長 | 旅遊界議員 | +35 | 活動及旅遊議題經常合作 |
| 民主派議員 | 警務處長 | -45 | 監控、示威及警權議題優先互相反駁 |
| 天文台台長 | 財政司長 | +10 | 同樣節儉但會爭論「慳錢」與「慳電」 |
| 宗教界議員 | 康文署署長 | +20 | 社區活動上較常附和 |

行政長官不設單一固定關係；每人的 `trust[officialId]` 就是該人物對玩家的關係。

關係在 Phase 1 主要控制誰會附和、插話或反駁；Phase 2 對票向只作很小修正。角色不可因為朋友支持，就投票違反 5 星核心信念。

### 特殊事件定義

事件必須資料驅動，包含 `trigger`、`cooldownMonths`、`oncePerSession`、演出對白及可選 gameplay effect。Phase 1–2 先實作每人最多一個簡化事件，並遵守：

- 有明確城市條件，不純靠隨機。
- 有至少 6–12 個月冷卻，避免洗版。
- 先顯示提案／要求，不能未經玩家選擇便永久改預算。
- 幸福度 `+8`、預算 `+30%` 等暫作設計意圖，不直接當最終平衡值。
- 純服裝、站位、自拍等屬 cosmetic event，不影響模擬。

每項法案在現有 `CITY_POLICY_DEFS` 基礎上，補充以下 metadata：

```text
PolicyCouncilMetadata
  policyId
  issues: IssueId[]
  ideologicalEffects: Record<IssueId, number>
  leadOfficialIds: officialId[]
  debatePriority
  fiscalRisk
```

法案效果仍由現有模擬邏輯計算；議會 metadata 只用作評論、投票及 UI，不複製 gameplay effect。

## 5. 可變議會狀態與存檔

建議在 `city` 內新增單一 `council` object：

```text
council
  schemaVersion: 1
  customNames: Record<officialId, string>
  trust: Record<officialId, number>          // 0–100，初始 50
  relationships: Record<officialId, Record<officialId, number>>
  specialEventState: Record<SpecialEventId, EventState>
  policyStates: Record<policyId, PolicyState>
  activeSession: CouncilSession | null
  voteHistory: VoteRecord[]
  recentCommentKeys: string[]
  lastCommentTickByContext: Record<string, number>
```

`PolicyState.status`：

- `inactive`：未生效，沒有草案。
- `draft`：已提出，尚未開始辯論。
- `debating`：審議中。
- `active`：已通過，且 `activePolicies[policyId] === true`。
- `repeal_draft`：正審議廢除。

重要 invariant：

- `active` 必須對應 `activePolicies[policyId] === true`。
- 其他狀態不直接改變政策模擬效果。
- 舊存檔 migration 時，以 `activePolicies` 推導每項法案的初始 `active`／`inactive` 狀態。
- `voteHistory` 建議只保留最近 50 次，避免存檔無限增長。

## 6. Phase 1：角色與情境評論

### 6.1 立法會「人物」頁

在現有立法會視窗加入 tab：

- `議會總覽`
- `法案`

總覽以 2 × 5 或 responsive card grid 顯示 10 位人物。每張 card 包含：

- 肖像、顯示名稱、職位。
- `主席`／`政府官員`／`議員` badge。
- 主要關注議題 2–3 項。
- 一句當前評論。
- Phase 1 可顯示中性「合作度」；若未準備好信任玩法，可先隱藏數值但保留資料欄位。

未建成立法會時，人物仍可查看，但評論區顯示「建成立法會後可正式議事」，法案操作保持 locked。

### 6.2 Comment context

Phase 1 支援三種 context：

1. `budget_preview`：稅率或部門撥款調整後。
2. `policy_preview`：玩家選中一條法案查看詳情。
3. `council_overview`：打開總覽時，回應目前最高優先城市問題。

Comment record 概念：

```text
CouncilComment
  officialId
  context
  issueId
  stance: support | concern | oppose | neutral
  severity: 0..3
  reasonCode
  messageKey
  params
```

`reasonCode` 是可測試的結構化原因，例如：

- `budget_deficit`
- `treasury_low`
- `police_underfunded`
- `crime_high`
- `tax_high`
- `pollution_high`
- `parks_underfunded`
- `policy_affordable`
- `policy_too_expensive`

UI 可把理由顯示成細字 tag；投票時亦可重用同一批 reason code。

### 6.3 城市訊號

評論引擎只讀現有狀態及 `computeBudgetSnapshot()` 結果。第一版應至少支援：

| 訊號 | 建議判斷方向 | 相關人物 |
|---|---|---|
| 月度淨額 | `net < 0`、嚴重赤字比例 | 財政司長、商界、自由派 |
| 庫房 | 低於數月支出或已負數 | 財政司長、行政長官 |
| 稅率 | 接近上下限或一次變動大 | 財政司長、自由派、商界、民主派 |
| 部門撥款 | 低於 80%、高於 120% | 對應官員及議員 |
| 犯罪率 | 高／近期惡化 | 警務處長、民主派、商界 |
| 幸福度 | 低／近期惡化 | 行政長官、文化署、民主派 |
| 污染 | 高 | 天文台、旅遊界 |
| 教育／健康 | 指數低或疫症活躍 | 民主派、宗教界 |
| 失業 | 高 | 商界、民主派、行政長官 |
| 法治 | 低 | 民主派、警務處長、商界 |

實作時閾值應集中放在 council rules config，不能散落在 UI code。若某個指標當前量綱未完全穩定，先用相對於其既有 0–1 範圍的閾值。

### 6.4 選擇發言者

每次最多顯示 3 人：

1. 對該 context 有直接專業責任的官員一人。
2. 立場最支持或最反對的議員一人。
3. 如有明顯相反意見，再加入另一位議員。

私人關係會影響第 2、3 位發言者：正面關係較易附和及補充，負面關係較易點名反駁。但 comment engine 必須先確認雙方真的有議題分歧，不能為製造戲劇而讓角色說出違反自身價值觀的話。

排序分數：

```text
relevance = expertise + abs(issueWeight) + signalSeverity + recencyPenalty
```

- `recencyPenalty` 應降低最近已發言角色及同一 `messageKey` 的分數。
- 相同輸入應優先產生穩定結果；如需變化，用 saveable seed 或只在同分時選模板。
- 不讓 10 人同時留言。

### 6.5 Budget preview 互動

- Slider 的遊戲效果維持現況。
- `input` 繼續即時更新數字，但評論使用約 600ms debounce。
- 同一次拖動完成後才更新評論。
- 一次只評論變化最大的項目；例如只改警察撥款，不應突然談旅遊。
- 應比較「調整前」與「目前」數值，評論玩家的改動，而不只是重述現況。
- 關閉預算視窗或開始新場景時取消 pending comment timer。

### 6.6 Policy preview 互動

Phase 1 將法案按鈕改成「選取／查看詳情」，但可保留一個明確的「立即啟用／停用（舊模式）」操作，直至 Phase 2 完成。不要在 Phase 1 中留下按 card 即誤觸政策的行為。

詳情區顯示：

- 名稱、描述、預計每月成本。
- 解鎖條件及是否達成。
- 2–3 個角色 comment。
- 現行狀態。

### 6.7 Phase 1 驗收準則

- 10 張人物 card 使用正確圖片，名稱可只改 i18n 而不改邏輯。
- 改警察撥款時，至少警務處長的評論會合理改變。
- 赤字及盈餘下，財政司長對同一高成本法案有不同評論。
- 拖動 slider 不會每個 `input` event 新增一段對白。
- 同一畫面最多 3 段評論，短期內不重複同一句。
- 舊存檔可正常載入；沒有立法會時不會啟用法案操作。
- 中英文切換後人物名稱、職位及 comment 可更新。

## 7. Phase 2：法案審議與投票

### 7.1 法案狀態流程

```text
inactive → draft → debating → vote
                              ├─ passed  → active
                              └─ rejected → inactive

active → repeal_draft → debating → vote
                                     ├─ passed  → inactive
                                     └─ rejected → active
```

規則：

- 同一時間只容許一個 `activeSession`，避免多個 modal／投票狀態互相覆蓋。
- 草案未投票前不改 `activePolicies`。
- 通過一刻才切換 `activePolicies`、重算幸福度／需求／預算並 autosave。
- 否決後留下 vote history，但清除 session。
- Phase 2 完成後移除 Phase 1 的「舊模式」即時切換入口。

### 7.2 審議畫面

由法案詳情按「提出法案」後進入：

1. **摘要**：效果、每月成本、解鎖條件、目前財政影響。
2. **官員意見**：選 1–2 位相關官員。
3. **議員立場**：5 位議員各顯示 `支持／未決定／反對` 及首要理由。
4. **預計票數**：顯示範圍或確定預測，例如「預計 3–4 票支持」。
5. **操作**：取消草案、開始表決。

Phase 2 MVP 不加入游說、交易、修訂案或多輪辯論；這些留待後續 phase。

### 7.3 投票計分

每名議員獨立計算：

```text
score = ideology
      + cityNeed
      + fiscalFeasibility
      + trustModifier
      + relationshipInfluence
      + deterministicVariance
```

建議分量：

- `ideology`：法案議題與角色 `issueWeights`，約 -4 至 +4。
- `cityNeed`：城市是否真的需要該政策，約 -3 至 +3。
- `fiscalFeasibility`：庫房、月度淨額、政策成本，約 -2 至 +2。
- `trustModifier`：信任 0–100 映射至約 -1 至 +1；不可推翻強烈核心立場。
- `relationshipInfluence`：與提案主要倡議者及公開支持者的關係，原始值最多約 -0.75 至 +0.75，再受固執度壓縮。
- `deterministicVariance`：約 -0.25 至 +0.25，只解決邊界同分；由 session seed 產生並保存。

固執度套用在「可被影響部分」，而非粗暴乘整個 score：

```text
persuadable = trustModifier + relationshipInfluence + deterministicVariance
adjustedPersuadable = persuadable * stubbornnessMultiplier
finalScore = ideology + cityNeed + fiscalFeasibility + adjustedPersuadable
```

建議 `stubbornnessMultiplier`：1 星 `1.0`、2 星 `0.85`、3 星 `0.65`、4 星 `0.45`、5 星 `0.25`。如此財政司長不會因私人關係好就突然支持嚴重赤字，但旅遊界議員可被最新旅客數據與合作關係明顯影響。

立場門檻建議：

- `score >= 1`：支持。
- `score <= -1`：反對。
- 中間：未決定；正式投票時依 score 正負及 session seed 決定。

每票必須保存分項及最多兩個 `reasonCode`，方便 UI 解釋及測試。不要只保存最後 `yes/no`。

### 7.4 多數及平票

- 5 位議員一人一票，正常需要至少 3 票通過。
- 以現時 5 席設計一般不會平票。
- 行政長官的 casting vote 欄位仍保留，供日後議員缺席、席位數改動或棄權時使用。
- 若有效票為平票，行政長官依整體財政、民望及法治需要決定，並顯示理由。
- 官員沒有投票權。

行政長官另有一次「批准／否決」步驟。預設通過的法案由玩家批准後生效；玩家亦可行使最終否決權。為免否決權變成無成本重抽票：

- 否決後同一法案至少冷卻 3 個遊戲月才可重提。
- 否決多數通過的法案會降低支持該案角色的信任，幅度受票數及角色固執度影響。
- 民望／施政能力過低時，否決可被鎖定或增加冷卻；Phase 2 實作前須先確認採用現有 `happiness` 作代理，還是新增獨立 `publicApproval`。
- 玩家批准不代表行政長官另投一票；議會票數紀錄與行政決定分開保存。

### 7.5 投票鎖定與結果

按「開始表決」時建立 immutable vote snapshot：

- 城市年月及 tick。
- 法案及動議類型 `enact/repeal`。
- 當刻城市訊號及預計成本。
- 每名議員計分、理由與票向。
- session seed。

建立 snapshot 後，即使模擬下一 tick 更新，該次結果也不應改變。結果畫面逐一揭示 5 票，最後才顯示通過／否決。

`VoteRecord` 至少包含：

```text
id, policyId, motion, year, month, tick,
votes[], yesCount, noCount, abstainCount,
castingVote, councilResult, executiveDecision,
result, citySnapshot, enactedAtTick
```

### 7.6 法案可用性

沿用現有 `isPolicyAvailable(id)` 概念，但 UI 要分辨原因：

- 未建成立法會。
- 人口未達標。
- 已有另一項法案審議中。
- 法案已生效，只可提出廢除。
- 法案未生效，可以提出立法。

「未解鎖」和「預計不夠票」不可混為一談；後者仍應容許提交表決。

### 7.7 信任度在 Phase 2 的最小用途

Phase 2 先讓所有角色信任度預設 50。投票後只做輕量更新：

- 法案通過：支持該案的角色對政府 `+1`。
- 法案被否決：不自動扣信任。
- 玩家提出與角色核心立場強烈相反的法案：該角色最多 `-1`。
- 所有數值 clamp 在 0–100。

私人關係在 Phase 2 亦只作小幅更新：公開附和可 `+1`，直接反駁可 `-1`，每次 session 每對人物最多變動一次。特殊事件可以有明確關係效果，但不得由普通投票快速把所有人變成朋友或敵人。

信任度只作細微 vote modifier，完整承諾、游說及關係系統留待後續。

### 7.8 Phase 2 驗收準則

- 按法案不會直接改 `activePolicies`。
- 法案通過前後的政策效果切換時點正確。
- 5 位議員均有票向及可理解理由，官員沒有票。
- 高固執角色不會因信任或朋友關係而違反核心信念；低固執角色會合理受即時數據影響。
- 已定義的正負關係會產生附和或反駁演出，但不會取代議題立場。
- 同一 vote snapshot 重開結果畫面時，結果完全一致。
- 財政、城市需要或角色立場改變，可合理影響新一輪預測。
- 已生效法案可經廢除動議關閉；廢除被否決時仍保持生效。
- 存檔／載入可恢復法案狀態、進行中 session 及投票歷史。
- 載入舊存檔時，現有 active 法案不會消失或被重新表決。
- 表決完成只觸發一次政策切換及一次相關 UI／模擬更新。
- 議會通過後須經玩家批准；否決會記錄行政決定及套用冷卻。

## 8. 建議模組邊界

實作時可按現有全域 script 架構拆分：

| 建議檔案 | 責任 |
|---|---|
| `council-definitions.js` | 角色、議題、法案議會 metadata、閾值 |
| `council-state.js` | 預設狀態、normalize、舊存檔 migration |
| `council-comments.js` | 城市訊號、reason code、評論選擇及模板參數 |
| `council-voting.js` | 法案狀態流程、投票計分、snapshot、結果 |
| `council-events.js` | 特殊事件條件、冷卻、選項及短期效果 |
| `council-ui.js` | tabs、人物 card、詳情、辯論及結果 rendering |
| `i18n.js` | 名稱、職位、議題、理由及對白文字 |

現有檔案的預期接點：

- `constants.js`：`CITY_POLICY_DEFS` 保持 gameplay 基礎定義，或只加最小 metadata reference。
- `city-state.js`：初始化及 normalize `city.council`；政策實際效果仍讀 `activePolicies`。
- `hud.js`：移除直接 toggle handler，改為開啟法案詳情／審議流程；預算 input 通知 comment engine。
- `index.html`：加入 tabs、人物 grid、法案詳情、投票結果容器及新 script 順序。
- `save.js`：由 `{ ...city }` 自動保存 council state；提升 save version 並驗證 migration。

UI 不應包含投票計分邏輯；投票引擎也不應直接操作 DOM。

## 9. 實作順序

### Phase 1A：基礎資料

1. 建立角色及議題定義。
2. 加入固執度、初始私人關係及特殊事件定義。
3. 建立 `city.council` 預設值、normalize 及舊存檔 migration。
4. 加入人物與 comment i18n keys。

### Phase 1B：人物與評論 UI

1. 立法會 tabs 及人物 card。
2. 建立城市訊號與 reason code。
3. 接入預算 preview debounce。
4. 建立法案詳情及 policy preview comments。
5. 加入關係驅動的附和／反駁演出。
6. 加入 comment 去重、特殊事件冷卻及空狀態。

### Phase 2A：法案狀態機

1. 建立 policy state 與 session。
2. 將直接政策 toggle 改為提出草案。
3. 建立審議畫面與取消流程。

### Phase 2B：投票及結果

1. 實作可解釋 vote scoring。
2. 建立 immutable snapshot。
3. 結果揭示、政策生效／廢除及 autosave。
4. 投票歷史與載入恢復。
5. 補齊單元測試及 UI smoke test。

## 10. 測試重點

至少覆蓋以下 case：

- 盈餘與赤字城市對高成本法案的不同意見。
- 高犯罪及低警察撥款下的公共安全評論。
- 高稅率下自由派／商界與公共服務派的分歧。
- 人口門檻未達時不可提出法案。
- 投票中途存檔再載入，結果不變。
- 通過、否決、廢除通過、廢除否決四條路徑。
- 快速拖動多個 slider，只產生最後一次有效評論。
- 改 i18n 名稱後，舊 vote history 仍以 `officialId` 正確顯示新名稱。
- 同一法案下，高低固執角色對信任／關係修正的反應幅度不同。
- 民主派與警務處長只在有實質議題分歧時互相反駁。
- 特殊事件冷卻有效，載入存檔不能重複領取同一效果。
- 玩家否決議會多數通過的法案後，冷卻、信任及歷史紀錄正確。
- 缺失肖像、缺失翻譯、未知舊 policy state 的 fallback。

## 11. Phase 1–2 不處理項目

- 年度預算案表決。
- 玩家游說、政治交易及修訂案。
- 多輪自由對話或玩家輸入文字。
- 議員選舉、換屆、缺席及黨團席位變動。
- 承諾系統、複雜派系網、關係長期演化及角色聲望；Phase 1–2 只做初始關係與每場微調。
- AI 生成投票決定或 gameplay 效果。
- 緊急會議及自動生成多項議程。

以上項目可在 Phase 3 或之後建立在本文件的穩定 `officialId`、`IssueId`、reason code、session 及 vote history 上。

## 12. 完成定義

Phase 1–2 可視為完成，當玩家能夠：

1. 認出 10 位角色及其不同立場。
2. 在預算與法案畫面取得與城市實況一致的評論。
3. 提出一項已解鎖法案，看到官員意見及 5 位議員的預計立場。
4. 完成一次可重現、有理由的表決。
5. 在通過後看到現有政策效果正式生效，並可在之後提出廢除。
6. 存檔、重開遊戲後繼續保留上述狀態及歷史。

## 13. 受控 AI 角色新聞整合

此部分定義 Phase 1–2 完成後可接入的新聞演繹層。它不改變議會投票規則，但 Phase 1 建立角色資料時應預留所需欄位。

### 13.1 權責邊界

唯一可信流程：

```text
Game Engine
  → 偵測城市條件
  → 選擇既有角色與事件模板
  → 決定所有數值及 gameplay 結果
  → 建立不可改寫的 CanonicalNewsEvent
  → AI 將事件演繹成新聞文字
  → schema／事實／長度驗證
  → 顯示 AI 版本；失敗則使用規則版 fallback
```

AI 可以決定：

- 標題及內文措辭。
- 在授權範圍內使用哪句角色口頭禪。
- 正經、輕諷刺或八卦式新聞角度。

AI 不可以決定：

- 事件有沒有發生。
- 誰出席、誰支持法案或如何投票。
- 民望、幸福度、預算等數值加減。
- 政策、災害、建築或活動結果。
- 創造新角色、親屬、醜聞、犯罪指控或重大背景設定。

### 13.2 與現有 AI 新聞系統的接點

目前 `buildAiNewsFacts()` 已提供城市、日期、人口、庫房、月度淨額、幸福度、失業率、污染、交通、天氣、緊急事件及一個由遊戲選定的 `story`；provider 亦已有 sanitize、JSON parsing、去重及「FACTS_JSON 是權威」規則。

角色新聞應延伸現有管線，而非另建一套不相容服務：

- 保留現有 district story 作 `storyKind: district`。
- 新增 `storyKind: council_character`。
- `buildAiNewsFacts()` 每次只傳當次涉及的 1–3 位角色，不傳整個角色資料庫，減少 prompt 長度及混淆。
- 現有 API 只回傳 `headlines[]`；角色新聞如需要內文及引述，應使用 versioned response schema，不能暗中改變舊 parser。
- AI 未啟用、逾時、回傳錯誤或驗證失敗時，使用相同 canonical event 的規則式 i18n 新聞。

### 13.3 AI 用角色資料

AI payload 使用穩定 ID，顯示名稱及文字由當前語言解析。只傳與演繹有關的資料：

```json
{
  "id": "councillor_business",
  "displayName": "商界議員",
  "role": "議員",
  "age": 65,
  "coreBelief": "成功人士，就應該有成功人士嘅生活。",
  "personality": ["自信", "重視形象", "以投資回報衡量政策"],
  "interests": ["金融", "高端旅遊", "城市形象"],
  "quirks": ["大型活動想站中央", "見到鏡頭會調整姿勢"],
  "speechStyle": "優雅、自信、略帶高傲",
  "allowedCatchphrases": ["城市形象很重要。", "國際場合不能失禮。"],
  "relationshipContext": [
    { "otherId": "treasury_head", "label": "互相欣賞", "strength": 2 }
  ]
}
```

注意：

- JSON 的關係使用 ID，不以可修改的人名作 key。
- `relationshipContext` 只傳與本事件其他出場人物有關的關係，並將內部 `-100..100` 正規化成 `-2..2`。
- `allowedCatchphrases` 是可用選項，不要求每篇硬塞口頭禪。
- 隱藏玩法數值如完整固執度及 trust 不必傳給 AI；只傳已由引擎決定的行為結果。

### 13.4 CanonicalNewsEvent

事件由遊戲引擎建立，所有欄位均經 sanitize：

```text
CanonicalNewsEvent
  id
  storyKind: council_character
  eventType
  year, month, tick
  absurdity: 0..3
  characterIds: officialId[]
  locationId | null
  facts: string[]
  allowedActions: string[]
  forbiddenClaims: string[]
  quoteSpeakerId | null
  requiredNumbers: Record<string, number>
  gameplayOutcome: object | null
  fallbackHeadlineKey
  fallbackBodyKey
  dedupeTags: string[]
```

`facts` 應使用短、不可歧義的事實，例如：

- 「政府舉行農曆新年賀歲活動。」
- 「商界議員參與官方合照並嘗試走近中央位置。」
- 「舞麒麟在表演期間輕輕碰到商界議員，她離開原本隊形。」
- 「活動順利完成，沒有受傷。」

`gameplayOutcome` 只供 UI／history 記錄，不讓 AI改寫；若事件沒有數值效果則為 `null`。

### 13.5 事件類型

初期支援：

- `policy_news`：提出、通過、否決或廢除法案。
- `official_gaffe`：角色失言或語氣引起關注，但不可憑空製造刑事或道德指控。
- `public_event`：節慶、典禮、演唱會及社區活動。
- `council_conflict`：有真實 comment／vote 分歧的角色衝突。
- `human_interest`：自拍、站位、服裝、風扇等無 gameplay 影響花邊。
- `disaster_response`：風暴、疫症、停電及災害後的既定應對。
- `festival_event`：農曆新年等由遊戲日曆或明確 event flag 觸發的節日事件。

每類事件均需要規則模板、最低條件、適用角色、冷卻及 fallback 文案。AI 不可自行把普通月份寫成節日。

### 13.6 新聞荒誕度

`absurdity` 由事件模板指定，AI 不可自行升級：

| 值 | 語氣 | 邊界 |
|---:|---|---|
| 0 | 正經官方新聞 | 只陳述政策、數據及正式回應 |
| 1 | 輕微人物特色 | 可帶一個小動作或口頭禪 |
| 2 | 明顯諷刺／較搞笑 | 可突出怪癖，但事件仍需可信 |
| 3 | 全城八卦級 | 可戲劇化演出，不可突破 canonical facts |

例子：賀歲合照被舞麒麟碰離隊形為 2；35°C 堅持開風扇為 2；警務處長在已定義的天台巡視活動迎風發言可為 3，但引擎必須先提供天台及巡視活動事實。

### 13.7 Prompt contract

Prompt 應明確指出 `EVENT_JSON` 是唯一事實來源，並包含：

```text
你是香港風格虛構城市模擬遊戲的新聞編輯。

只可根據 CHARACTER_JSON、CITY_STATE_JSON 及 EVENT_JSON 寫作。
EVENT_JSON 是已由遊戲引擎確認的事實，不可增加或改變事件結果。

規則：
1. 只能使用輸入內已有角色、地點、活動及數字。
2. 不可改變角色核心信念或投票結果。
3. 不可創造政策、建築、親屬、醜聞、傷亡、犯罪或財政結果。
4. 幽默程度不得超過 EVENT_JSON.absurdity。
5. 標題最多 24 個中文字；內文 80–140 個中文字。
6. 直接引述只能由 quoteSpeakerId 指定角色說出，並符合 speechStyle。
7. 不需要每篇使用口頭禪；不可創作輸入以外的標誌性口頭禪。
8. 不可把區內數據寫成全市數據。
9. 不可輸出 Markdown 或 JSON 以外文字。
```

### 13.8 Versioned output schema

```json
{
  "schemaVersion": 1,
  "headline": "",
  "body": "",
  "quote": "",
  "quoteSpeakerId": null,
  "tone": "straight",
  "relatedCharacterIds": []
}
```

驗證規則：

- `tone` 只可為 `straight`、`light`、`satirical`、`gossip`，並不可高於事件荒誕度。
- `relatedCharacterIds` 必須是輸入角色 ID 的子集。
- `quoteSpeakerId` 必須等於 event 指定值；沒有授權引述時 `quote` 必須為空。
- headline／body 先 normalize whitespace，再按 Unicode code point 限長。
- 回傳出現未授權數字、未知 ID 或 forbidden claim 時整篇拒絕，不嘗試局部相信。
- 成功內容仍要經現有近期新聞相似度檢查。

### 13.9 生成頻率與去重

- 角色新聞與現有每月／緊急 AI 新聞共用 pending lock 及 provider cooldown，避免同時請求。
- 同一 `event.id` 最多生成一次；request key 加入 event ID、語言及 schema version。
- 同一角色連續兩篇新聞要降權，除非是緊急事件的必要主責官員。
- 同一怪癖設獨立冷卻，例如「爭 C 位」至少 12 個月才可再次成為主題。
- vote history、special event state 及 recent news topics 共同用作去重。

### 13.10 私隱、安全與成本

- 只傳遊戲內虛構角色及必要城市資料，不傳玩家 API key、存檔全文或自訂自由文字。
- 玩家自訂角色名稱須先截長及移除控制字符，並視為 data，不可被當成 prompt 指令。
- 所有字串在 client 及 provider 兩邊 sanitize；server 不信任 client payload。
- 一次請求只放必要角色，限制 payload 大小、輸出 token、timeout 及 cache 數量。
- AI 新聞保持 optional；關閉或不可用時，遊戲玩法及議會流程完全正常。

### 13.11 AI 角色新聞驗收準則

- 相同 canonical event 的 AI 與 fallback 版本陳述相同結果。
- AI 不會創造角色、投票、數字、政策或建築。
- 改人物顯示名稱後，新聞仍以穩定 ID 正確關聯。
- `absurdity: 0` 不會產生八卦式內容；高荒誕度也不會突破事件 facts。
- 未授權角色不能被直接引述。
- provider 逾時、無效 JSON、超長文字或未知 ID 時會可靠 fallback。
- 同一怪癖不會在短期新聞反覆出現。
- AI 新聞失敗不會改變任何城市數值、政策狀態或議會投票。

## 14. 特別議案、城市吸引力與城市恥笑度

議會議程分為 `policy` 常設法案及 `resolution` 一次性／限期特別議案。兩者共用草案、辯論、五席表決及行政批准流程；只有常設法案切換 `activePolicies`。特別議案批准時扣除一次性成本，建立有期限 modifier 或季度 programme，完成後進入冷卻。

首批特別議案：

- `cashHandout`：派錢計劃。
- `tourEverywhere`：「無處不旅遊」活動。
- `menaConcert`：邀請韓星天團「咩拿」開 Show。
- `muiKinKwokMatch`：邀請足球明星「梅建國」表演賽。
- `aiAntiDrugGirlGroup`：成立 AI 女團宣傳禁毒。
- `fantasyFingHeungShing`：《幻彩 fing 香城》季度無人機燈光表演。

AI 禁毒女團的 canonical 失敗結果固定為 `glamourised_drugs_backfire`：政府以過度華麗造型包裝代表毒品意象的女團成員，令毒品形象反而顯得時尚，造成反宣傳並增加城市恥笑度。AI 只可改寫新聞措辭，不得更改失敗原因。

新增常設法案：

- `elderlyTwoDollarFare`：長者兩元乘車計劃。
- `arcticPenguinReserve`：北極企鵝保育區條例。
- `busSeatbeltMandate`：巴士座位強制配戴安全帶法案。

新增城市指標：

- `cityAttractiveness` 0–100：由幸福、治安、環境、交通、商業、文化、旅遊政策、短期活動及適量迷因注意力組成。
- `cityRidicule` 0–100：由荒誕法案、活動失敗及反宣傳事件增加，每月自然衰減；中等數值可帶來笑料幸福與迷因旅遊，極高數值損害城市品牌及法治形象。
- `tourismAppeal`、`monthlyVisitors`、`tourismRevenue`：把旅遊 boost 轉為可見、可入帳的模擬結果。

兩個彩蛋指標只在統計圖表顯示，預設不勾選；恥笑度選項在首次非零後解鎖。歷史序列每月記錄並隨存檔保存。

《幻彩 fing 香城》批准後安排下一個 3／6／9／12 月開始，共四場。每場只在該月第一個 simulation tick 觸發一次，以 wall-clock 播放五秒獨立天空／無人機 overlay，不覆寫天氣狀態。場次結果由電力、天氣、交通、治安、文化撥款及 deterministic seed 決定，並可為 `success`、`nuisance`、`failure` 或 `meme_success`。
