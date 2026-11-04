# 地鐵站出入口 (subwayStation)

Norton's renders, untouched, are in `original/`. Each is squared to the game's 2:1 isometric on its
**paving** (Norton, 2026-11-03: "對地磚", the canopy leans in the render, so it is not the reference),
by a vertical skew about the paving's bottom corner then a vertical stretch:

| view | paving slopes before | skew | stretch |
|---|---|---|---|
| front: stairs face down-left on screen | 0.408 / −0.451 | 0.0215 | 1.163 |
| back: entrance faces up-right | 0.425 / −0.466 | 0.0205 | 1.1223 |

Both come out at slopes 0.500 / −0.500. Both are then scaled by the same factor to 1000 px across
at the widest and centred on a 1024 x 1024 transparent canvas. The results are kept in `squared/`:

| file | paving centre | paving width |
|---|---|---|
| `squared/subwayStation.png` | 511.3, 656.2 | 948.4 px |
| `squared/subwayStationBack.png` | 513.4, 667.6 | 972.3 px |

At a whole tile the station read too big (Norton, 2026-11-04). As with the primary school, it is
shrunk onto a paved plinth: `scripts/prepare-subway-station-assets.py` cuts the kerb off the
station's paving and stands it at 68% of the tile. The plinth around it is paved with square tiles
drawn in the render's own colours and grain, with a kerb on the two faces toward the viewer. The
script writes `Models/subwayStation/` at 1024 x 1024 (a power of two, for mipmaps). In both views
the plinth is centred at **512, 761** and is **1000 px** across: `METRO_STATION_ART` in metro.js.

The game mirrors each view for the other two directions, so the plinth fills one 20 m tile facing
any road.
