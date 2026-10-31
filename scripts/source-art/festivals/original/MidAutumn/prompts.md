# 中秋素材重新生成 Prompt

畫風同規矩跟返大排檔人物（`scripts/source-art/streetFood/people-v1/`）同排檔燈串（`scripts/source-art/streetFood/lighting-v1/`）。遊戲已經用緊嗰兩批，中秋素材要同佢哋企得埋一齊。

每個 prompt 都由兩部分組成：先貼「共用規矩」，再貼該張圖自己嗰段。生成時附上參考圖，對照「參考圖」一欄。生成完照「收圖檢查」逐項睇。

---

## 共用規矩（每個 prompt 前面都要貼）

```text
Asset type: transparent PNG sprite for a Hong Kong isometric city-building game, matching the game's existing realistic miniature pre-rendered street-food carts and people.

Style: finely detailed, lightly stylized pre-rendered game art with crisp readable silhouettes. People have NATURAL, NON-CHIBI body proportions (adult head about 1/7 of body height, children proportionate to their age), simple readable faces, solid clothing colours with modest fabric folds. Restrained, slightly desaturated realistic colour - weathered and lived-in, not glossy, not candy-bright. Gentle ambient shading, light from the upper left. Ordinary Hong Kong / East Asian residents, everyday nostalgic neighbourhood clothing, natural dignity, no caricature.

Camera: ONE orthographic game isometric view - 2:1 ground projection (ground diamond height:width 1:2), NOT 30-degree true isometric, NO perspective, no vanishing points. Ground lines run at slope exactly +0.5 or -0.5 on screen. Bodies, poles and posts stay exactly vertical; never lean anything to fake the angle. Seen from above enough to show shoulders and the tops of shoes.

Scale (for proportion only - never draw rulers, numbers or grids): adults about 1.7 m tall, children shorter by age. The game's ground tile is 20 m.

Output: real alpha transparency everywhere outside the subject, including between legs and arms. No painted checkerboard, no black or white matte, no floor plane, no ground shadow beyond a faint contact shadow at the feet or base, no scenery, no text, no labels, no logos, no watermark, no border. Keep heads, raised hands, lantern tassels and all feet fully inside the canvas with generous transparent margins - nothing cropped.
```

---

## 1. 賞月市民（企）

參考圖：大排檔行人 `passersby.png`、大排檔企位食客 `standing-diners.png`（身材比例同畫風）。
輸出：一張 1536 × 1024，3 欄 × 2 行，每格一人，人與人之間留透明空隙。

```text
Create EXACTLY SIX separate standing MOON-VIEWING PEOPLE for the Mid-Autumn Festival evening, one person per cell in an invisible 3-column by 2-row grid, each fully inside its own cell with clear transparent gaps. Evening clothes for a warm September night.
TOP ROW: (1) father in a short-sleeve shirt and long trousers, pointing up at the moon toward the upper right; (2) mother in a light blouse and skirt, a cloth shoulder bag, looking up; (3) grandmother in a pale cardigan, hands clasped, looking up.
BOTTOM ROW: (1) boy about 7 holding a lit red-and-yellow STAR lantern (楊桃燈) on a short stick; (2) girl about 6 holding a lit white RABBIT paper lantern on a short stick; (3) young woman taking a phone photo of the moon, phone raised.
All face toward the upper right or upper left (three-quarter back or side views), never straight at the camera. Lanterns glow softly from a small candle inside but stay small and in proportion to the child.
```

## 2. 野餐賞月（坐低）

參考圖：大排檔坐低食客 `seated-diners.png`。
輸出：一張 1254 × 1254，一組人連蓆。

```text
Create ONE Hong Kong family picnic for Mid-Autumn night: a red-and-white checked picnic mat lying flat on the ground, its four edges running along the 2:1 ground lines (slope +0.5 and -0.5), about 2.5 m by 2 m. On it: a father sitting cross-legged holding a mooncake, a mother kneeling and pouring tea, a boy and a girl sitting, an open red mooncake box, a pomelo, two small tea cups, one small lit rabbit lantern beside the girl. Everyone seated naturally on the mat, facing the upper right. The mat is the only ground element; no grass, no lawn texture, no shadow beyond a faint contact shadow.
```

## 3. 煲蠟

參考圖：大排檔企位食客（細路比例）。
輸出：一張 1254 × 1254，一組人圍住罐。罐另外畫一張，遊戲會喺罐口加火光同閃爍。

```text
Create ONE group of five Hong Kong children aged about 9 to 12 crouching and kneeling in a ring around a dented old metal biscuit tin on the ground, melting candle wax (煲蠟) on Mid-Autumn night. One child stirs with a long chopstick, two hold small lit lanterns, two lean in watching. The tin is about 30 cm across, its rim an ellipse matching the 2:1 ground. Inside the tin: melted wax with a few small candle flames, modest warm glow only on the tin and the nearest hands and faces. Children's clothing ordinary summer wear; natural proportions, not chibi.
```

```text
Create ONE dented old metal biscuit tin, about 30 cm across, sitting on the ground, its rim an ellipse matching the 2:1 ground, melted wax and a few short candle stubs inside, UNLIT (no flames, no glow) - the game adds the fire. Nothing else.
```

## 4. 警員

參考圖：大排檔行人（身材比例）。
輸出：一張 1536 × 1024，2 欄 × 1 行。

```text
Create EXACTLY TWO separate Hong Kong Police Force constables on night patrol, one per cell in an invisible 2-column by 1-row grid with clear transparent gaps. Light-blue short-sleeve summer uniform shirts, dark navy trousers, dark navy peaked caps, duty belts, black boots. (1) a male constable walking toward the lower right speaking into a radio; (2) a female constable walking toward the lower left holding a small torch with a short soft beam. Calm, professional, natural proportions, not chibi, no logos or readable text on the uniforms.
```

## 5. 舞火龍（兩個方向，另外兩個用鏡像）

參考圖：大排檔行人（舞龍人身材比例）、遊戲燈串夜景 `string-lights-night-source.png`（火光畫法）。
輸出：每個方向一張 1536 × 1024，畫布入面沿對角線擺。

真實大坑火龍有 67 米。遊戲用一條大約 30 米嘅火龍：前面一人舉龍珠，12 人舉龍身，全部沿同一條地面斜線行。

```text
Create ONE Tai Hang FIRE DRAGON procession for Mid-Autumn night, travelling toward the screen LOWER RIGHT. The dragon is a long straw-and-pearl-grass body, about 30 m long, studded with hundreds of lit incense sticks glowing orange, a big straw head with open mouth at the LEADING (lower-right) end and a tufted tail at the far (upper-left) end, carried at shoulder height on wooden poles.
Carriers: EXACTLY 12 men in white singlets, dark trousers, red sashes and red headbands, evenly spaced under the body, each holding one pole, mid-stride; plus ONE man in front of the head carrying the glowing incense PEARL on a pole. Natural proportions, not chibi.
Geometry: every carrier's feet sit on ONE straight imaginary ground line running from the upper left to the lower right at slope EXACTLY +0.5 (down 1 for every 2 across). The dragon body follows that same line, with gentle up-and-down waves only, never wandering off it. Poles and bodies vertical.
Glow: incense sparks and a warm orange glow on the dragon and carriers only; no glow pool on the ground, no smoke clouds, no background.
```

```text
Same fire dragon, carriers and pearl bearer, but travelling toward the screen UPPER RIGHT: seen mostly from behind and the side, head at the LEADING (upper-right) end, tail at the lower left. Every carrier's feet on ONE straight imaginary ground line running from the lower left to the upper right at slope EXACTLY -0.5 (up 1 for every 2 across). Everything else exactly as the first.
```

遊戲會用鏡像補埋另外兩個方向：向右下嘅鏡像得向左下，向右上嘅鏡像得向左上。

## 6. 中秋燈飾（重畫先做；現有燈飾都可以先用）

現有燈飾 midAutumn1–12 畫工可以用，但全部係亮燈樣，同埋未有日間版。如果要重畫，每件要兩張：

- **夜間亮燈版**：先生成。
- **日間熄燈版**：用夜間嗰張做輸入圖編輯，只改燈光，構圖完全唔郁。

```text
Create ONE large Mid-Autumn lantern display for a Hong Kong park: a giant glowing JADE RABBIT beside a full-moon disc, on a low round platform with a red-and-gold rim. About 6 m wide and 5 m tall. The platform's base is an ellipse matching the 2:1 ground (twice as wide as it is deep). Lit from inside, warm glow on the display itself only. NIGHT LIT master.
```

```text
Edit the input image ONLY: the same display in DAYTIME with all lights OFF - paper and silk panels translucent and unlit, no glow, no light spill, natural daylight colours. Keep every shape, outline, position and the canvas size exactly unchanged.
```

其他燈飾照住呢個格式寫。建議尺寸：

| 燈飾 | 大細 |
|---|---|
| 蓮花燈 | 高約 5 米 |
| 玉兔燈組 | 闊約 4 米 |
| 燈籠柱 | 高約 4 米 |
| 賞月枱 | 闊約 1.2 米 |
| 路邊掛燈 | 約 0.6 米 |
| 維園大型掛燈 | 2 至 3 米 |

---

## 收圖檢查

- 真透明背景，唔係畫出嚟嘅棋盤格；四邊有透明邊距，手腳、燈籠穗、龍尾冇被裁。
- 人物比例正常，唔係 Q 版大頭；成人同細路高度合理。
- 等角斜率：地面線、野餐蓆邊、火龍腳底線要係 ±0.5。火龍可以喺圖上畫兩條輔助線核對，唔啱就重生。
- 同一張圖入面嘅人比例一致。
- 冇文字、冇 logo、冇地面陰影。
- 收到之後放入 `scripts/source-art/festivals/original/MidAutumn/`，改有意思嘅檔名，再更新 README。舊圖保留，唔好覆蓋。
