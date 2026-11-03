# 地鐵站出入口 (subwayStation)

Norton's renders, untouched, are in `original/`. Each is squared to the game's 2:1 isometric on its
**paving** (Norton, 2026-11-03: "對地磚", the canopy leans in the render, so it is not the reference),
by a vertical skew about the paving's bottom corner then a vertical stretch, and saved to
`Models/subwayStation/`:

| view | file | paving slopes before | skew | stretch | paving centre (anchor) | paving width |
|---|---|---|---|---|---|---|
| front: stairs face down-left on screen | `subwayStation.png` | 0.408 / −0.451 | 0.0215 | 1.163 | 686.5, 765.6 | 1367 px |
| back: entrance faces up-right | `subwayStationBack.png` | 0.425 / −0.466 | 0.0205 | 1.1223 | 723.0, 814.1 | 1402 px |

Both come out at slopes 0.500 / −0.500. The game (metro.js `METRO_STATION_ART`) mirrors each for the
other two directions, so the paving fills one 20 m tile facing any road.
