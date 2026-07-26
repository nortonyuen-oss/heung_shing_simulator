# 香城新春求籤內容資料庫

本資料庫是年度求籤系統的內容研究稿，不會由遊戲載入，也不會進入桌面版發佈包。

## 資料來源與編輯原則

- 18 支四句七言籤詩均為《香城》原創，不引用現代車公籤籤文。
- 籤詩語氣參考傳統廟宇籤詩的勸善、借古喻今及禍福相倚結構。
- 歷史典故取材自已進入公有領域的古籍、歷史人物及民間故事，例如姜太公渭水遇文王、張良圯橋拾履、塞翁失馬及草船借箭。
- 政府解讀、廟祝解讀及討論區留言同樣為《香城》原創諷刺內容，並非任何宗教團體的解釋。

## 年度抽籤權重

18 支籤平均分為上、中、下各六支；抽籤時先抽等第，所以籤池數量不等於出現機率。基準權重參考現實車公籤以上、中籤居多的分布：

- 上籤：36%
- 中籤：46%
- 下籤：18%

經濟狀況只作輕度修正，不會直接指定結果：

```text
economyStress = clamp((50 - economyIndex) / 50, -0.60, 0.80)
stockCrashStress = stockCrashActive ? 0.55 : 0
epidemicStress = clamp(epidemicSeverity * 0.65, 0, 0.65)
totalStress = clamp(economyStress + stockCrashStress + epidemicStress, -0.60, 1.40)

upperWeight = clamp(0.36 - 0.07 * totalStress, 0.25, 0.42)
lowerWeight = clamp(0.18 + 0.08 * totalStress, 0.10, 0.30)
middleWeight = 1 - upperWeight - lowerWeight
```

在最差的經濟、股災及嚴重疫情同時出現時，下籤機率最多約升至 29%；即使環境惡劣，仍可能抽到上籤。經濟暢旺時則只會小幅增加上籤機率。

抽取流程先按修正後權重選擇等第，再在該等第籤池中等機率抽一支；最近三年抽過的籤暫時排除，避免短期重複。

## JSON 欄位

- `metadata`：版本、來源、權重及內容聲明。
- `selectionModel`：未接入遊戲的建議權重參數。
- `fortunes[].number`：1–18 籤號。
- `fortunes[].titleZh`：原創籤名。
- `fortunes[].grade`：`upper`、`middle` 或 `lower`。
- `fortunes[].poem`：四句原創七言籤詩。
- `fortunes[].allusion`：參考的公有領域歷史典故、文獻傳統及簡介。
- `fortunes[].theme`：用於選擇合適政府官員的遊戲主題。
- `fortunes[].governmentInterpretation`：官員 ID、顯示名稱及香城式官方解讀。
- `fortunes[].templeKeeperInterpretation`：廟祝祥叔的民間解讀。
- `fortunes[].forumResponses`：固定三則灰色諷刺留言。

實際內容見 `annual-fortunes.json`。
