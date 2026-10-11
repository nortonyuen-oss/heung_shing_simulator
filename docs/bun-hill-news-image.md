# 搶包山新聞圖

由內建 imagegen 生成，沿用香城討論區像素新聞插畫風格。

- 遊戲主圖：`UI/news/bunHillCompetition.webp`（1536 × 1024）
- 縮圖：`UI/news/thumbs/bunHillCompetition.webp`（180 × 120）
- 生成原圖：`scripts/source-art/festivals/original/bunHill/bunHillCompetitionNews.png`
- 正式賽事完成後，`postBunHillLiveReport` 將主圖附在賽果帖；取消、缺場地或未能舉辦不使用比賽圖。
- 圖片不含固定姓名、日期或冠軍，實際賽果由新聞本文提供。測試模式維持不發布新聞。

## 最終生成 prompt

```text
Use case: illustration-story
Asset type: landscape in-game Heung Shing Forum festival news illustration, 1536x1024.
Primary request: Create a polished pixel-art news scene of the fictional Hong Kong inspired city 香城's nighttime bun scrambling competition, matching the nostalgic detailed pixel illustration style of the forum's existing Dragon Boat and Lunar New Year news images visible in the conversation.
Scene/backdrop: waterfront event plaza at midnight, dark blue harbour and distant lit Hong Kong inspired skyline. A modest traditional bamboo Cantonese opera theatre with red lanterns stands at the back centre, facing the plaza. Three conical bamboo bun towers covered densely in small white steamed buns: main tower slightly back at centre, two smaller towers forward left and right. Low bamboo safety fences along rear and sides with festive traditional red floral panels. Foreground spectators behind a safe boundary, cheering and photographing.
Subject: adult athletic male and female contestants climbing all three towers, red and green sleeveless jerseys, black shorts, climbing harnesses, safety ropes attached overhead, small bun collection bags. A clear dynamic central climber reaching for a bun. Believable human/tower proportions, adult height around 1.7m, low fence around 1.1m, no gigantic railings or theatre.
Style/medium: rich retro pixel illustration, crisp pixel clusters, detailed expressive Hong Kong street-life characters, editorial news image, eye-level three-quarter view rather than game screenshot.
Composition/framing: wide balanced view showing all three towers and event context, central tower prominent, audience along bottom, readable silhouettes.
Lighting/mood: warm floodlit bun towers and lanterns against blue midnight harbour, lively celebratory sporting atmosphere.
Text: no headlines, no winner names, no dates, no logos, no watermark, no forum UI frame or social metrics. Small buns may have simple red dots without readable writing.
Constraints: exactly three bun towers, multiple athletes on every tower, realistic climbing harnesses and overhead belay ropes, no accidents, no podium winner implying a specific result.
```
