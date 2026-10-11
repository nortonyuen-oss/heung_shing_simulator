# 搶包山選手動作原圖 v1

使用內建 `image_gen` 生成，2026-10-11。

檔案：`scripts/source-art/festivals/original/bunHill/bunHillClimbersSheet-v1.png`。1536×1024 RGBA；已量度到 1,153,180 個完全透明像素，非畫上棋盤格背景。

6 欄×4 排：紅衫男選手兩個背面斜向視角，綠衫女選手兩個背面斜向視角。目標動作順序是待命、左手上攀、右手上攀、取包、下降及落地；各人配安全帶、運動鞋及盛包袋。

## 拆幀與動畫（已完成）

`node scripts/bake-bun-hill-climbers.js` 使用既有節慶的連通透明區域分離方法，保留原圖跨格線的鞋及手。輸出 `Models/festivals/bunHillClimbers/` 內 24 格原向動作、24 格鏡像（每格 256×256），以及 2048×2048 atlas；資料在 `data/bun-hill-climbers.json`。

身高以每款站立姿勢的頭頂至落腳點計算，目標 1.7 米，在遊戲原比例為 8.5px。全組動作使用同一解剖比例；伸手及屈膝不會按整圖高度重新縮放。腰部錨點固定在 (128,128)，站立／落地另提供腳底錨點，鏡像同步轉換。沒有可靠矩形地面參考的單人圖，不對人體強行作建築地面 skew；保留來源的等距攝影。

原圖兩個上攀姿勢並非每格都有清楚的左右手交替，因此命名為 `climbA`／`climbB`，不宣稱已生成完整骨骼動畫。四排提供男女各兩個背斜視角；鏡像不是額外生成的正面視角。塔前選手選向塔內的背斜圖，塔後按深度遮擋。

`bun-hill-climber-animation.js` 根據同一場比賽時間線選待命、上攀 A/B、取包、下降及落地幀。取包動作跟計分事件同步；固定腰部根位置，人物不隨裁圖大小跳位。預覽已用人物取代圓點。

遊戲入口：**test mode → 啟動 event → 預覽搶包山選手動畫**。可播放、暫停、拖動、重播及旋轉視角；不改城市時間或資金。關閉／退出 test mode 會停止回放與釋放面板。這次接入的是人物動畫預覽；完整城市包山節日排程、包山本體校準、場地部署及摘包缺口尚需接入。

驗證：所有幀透明邊不裁切、鏡像像素及腳底錨點一致、物理人物比例、atlas 對應、取包事件同步、四個視角及重播結果。Electron 實測腳本：`scripts/preview-bun-hill-climbers.js`（使用隔離 profile）。

## 最終生成 prompt

```text
Use case: stylized-concept.
Asset type: a production source sprite sheet for a Hong Kong isometric city-building game, bun-tower climbing athletes.
Input image 1 is a STYLE AND CAMERA REFERENCE of the existing bun tower only. Input image 2 is a STYLE AND HUMAN RENDERING REFERENCE only. Generate NEW athletes, do not alter or copy the tower or spectators.
Create exactly 24 isolated full-body athlete sprites on a genuinely transparent background in a strictly regular SIX COLUMN by FOUR ROW grid with generous completely empty transparent gutters. No visible grid, labels or text. Large crisp portrait/landscape sheet sufficient for clean extraction.
Camera: orthographic elevated isometric, 2:1 ground diagonals, vertical bodies remain vertical, no perspective convergence. Match the references' detailed miniature 3D game asset style, realistic human proportions, warm neutral soft upper-left light, clean alpha edges, no floor shadows.
Rows, top to bottom:
1: the same adult East Asian male athlete in a plain RED sleeveless numbered-style sports bib (NO printed number), black athletic shorts, sports shoes, short dark hair, facing northeast away from camera in rear three-quarter view.
2: the exact same male athlete, facing northwest away from camera in the other rear three-quarter view.
3: the same adult East Asian female athlete in a plain GREEN sleeveless sports bib, black athletic shorts, sports shoes, dark ponytail, facing northeast away from camera.
4: the exact same female athlete facing northwest away from camera.
Every athlete has a clearly visible black waist-and-thigh climbing safety harness, small canvas bun collection pouch attached at the hip, and a small clipped belay device. Same anatomy, clothes and scale within each character across all frames. No long ropes; ropes are drawn separately by the game.
Columns, left to right, exactly the same pose sequence for all rows:
1 waiting upright, feet together, hands relaxed ready to start;
2 climbing a VERTICAL tower: left hand reaching above head, right hand gripping near chest, left knee raised and foot pressing against an invisible vertical surface;
3 alternating climbing pose: right hand reaching above head, left hand gripping near chest, right knee raised;
4 collecting one small white lucky bun: one hand gripping overhead, the other drawing a single round white bun toward the hip collection pouch, bent braced knees;
5 controlled belayed descent: torso leaning slightly backward, both hands controlling the short harness belay connection, bent knees, shoes braced against the invisible vertical tower;
6 safely landed, standing upright with both shoes level and touching an invisible ground, collection pouch visibly full, arms lowered.
All climbing/collecting/descent characters face and lean toward the invisible vertical tower, never crawling horizontally. Keep whole bodies, hands and shoes entirely inside each grid cell; same standing-body proportions and head size, do not shrink tall reaching poses. Leave at least 12% cell-edge transparent clearance.
Constraints: athletes ONLY; no tower, bamboo, platforms, ground, stage, spectator crowd, decorative frame, outlines, lettering, logos, numbers, watermark, painted checkerboard or background. Exactly six sprites per row, exactly four rows. Real transparent alpha.
```
