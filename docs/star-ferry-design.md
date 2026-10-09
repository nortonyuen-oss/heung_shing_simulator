# 渡海小輪 (Star Ferry) — design v0.1

Status: decisions taken with Norton (2026-10-09, section 9); phase 1 next.

Ships the way Transport Tycoon has them: the player builds ferry piers on the shore, draws a route
between two or more piers, buys ferries for it, and the ferries carry passengers across the water for
fares. It is a second mode of the existing **Transport Mode** company (TRANSPORT_TTD_SPEC.md), not a
separate game: same company cash, same route list, same vehicle inspector, same month-end settlement.

## 1. Art we have

| File | What | Notes |
|---|---|---|
| `Models/vessels/starFerry_dualView.png` | 天星小輪, two views | Double-ended (same shape both ends), so two views + their mirrors give all four headings - no "sailing backwards". |
| `Models/vessels/ferryPierDay_dualView.png` | Pier, day, two views | 香港渡輪 sign on one face - **never mirrored** (the lettering would read backwards), so the two views are the two shore directions we can draw. |
| `Models/vessels/ferryPierNight_dualView.png` | Pier, night, two views | Drawn from a different angle from the day pair, so it can't swap in place. **Not used**: the night is the day art with runtime lamps (decision 5). |

All three need the yacht-club squaring (cut, vertical skew, x:y scale to 2:1) before use.

## 2. Pier (渡輪碼頭)

- **Where:** straddling the shoreline (Norton, 2026-10-09): a 2 x 2 lot whose half on one side is the
  shore (sand or flat ground at sea level, nothing built) and the other half water, open water beyond
  for the ferry, and a road within 3 tiles of the shore half. Not inside a typhoon shelter, not under a
  bridge. The pier is drawn 28 m across the lot's middle (the art is a small pier: at 38 m its hall
  stood as tall as a five-storey tenement).
- **Facing:** the pier's land side picks the view; with no mirrors, a shore direction the art can't
  face is refused (or, better, the second render covers it - to check once squared).
- **Cost:** about $2,500 to build, $25 a month (one pier is a small public works next to a $4,000
  bus depot). Bulldozer removes it (refused while a ferry is alongside).
- **Doubles as the ferry depot:** ferries are bought, serviced and sold at any pier of their route -
  no separate ship depot to build. (TTD has ship depots; one building is simpler and reads right.)
- **Catchment:** like a bus stop's - homes and jobs within 5 tiles of the pier's land side board here.
  A bus stop within 4 tiles of the pier counts as an **interchange**: riders change between bus and
  ferry (phase 3).

## 3. Ferry (天星小輪)

| | |
|---|---|
| Price | $900 (three double-deckers; a real Star Ferry is far dearer, kept affordable on the 萬 scale) |
| Capacity | 400 passengers a trip (a real one ~700; tuned against bus capacity ~100) |
| Speed | 0.6 tiles per display minute (a bus does 1.33 on road; ferries are slow but go straight across) |
| Upkeep | $30 a month + a running cost per water tile |
| Service | every 4 sky-days, 3 hours at a pier (same rule as buses) |
| Length | 30 m (1.5 tiles) - a little under the real ~40 m so it sits with the city's buildings (Norton, 2026-10-09); bobbing with the swell like the shelter boats |

## 4. Routes

- A route is an ordered list of 2+ piers, drawn in Transport Mode by clicking piers (the same order
  editor as buses).
- The path between two piers is found on the water grid (the container ships' Dijkstra,
  `findOceanRoute`), computed once per leg and cached; it avoids shelter basins and breakwaters and
  passes under bridges. A leg with no water path can't be added.
- Timetable: ferries leave every N minutes (headway set by fleet size, as buses), dwell 5 minutes at
  each pier to load.

## 5. Passengers and money

- **Who rides:** a pier's catchment pool, accruing through the day on the commuter curve (same as bus
  stops), split across the route's other piers by their catchment size. A cross-harbour trip saves a
  long way round by road, so ferry demand gets a bonus where the road distance between two piers is
  much longer than the water distance (the Star Ferry's whole point).
- **Fare:** flat per trip, like the real Star Ferry (player-set, default $5 on the fare slider's
  scale), not per tile - the bus fare model charges per road tile, which would make a short crossing
  near free.
- **Tourists:** each operating Star Ferry route adds visitors to the city's tourism capacity (it is
  Hong Kong's postcard ride) - feeds into the same capacity as the shelters.
- **City effects:** the bus effects apply around piers too (traffic relief, commercial land value,
  happiness); nothing new.

### 5.1 As built (phase 2, part 1 - 2026-10-09)

- Each pier keeps a queue that grows hour by hour on the bus stops' commuter curve (cleared at 04:00):
  homes within 8 tiles of its shore half, at 3x a bus stop's daily share (people walk further to a
  pier, and a crossing saves the long way round). The queue is fractional, so a quiet pier's few
  riders an hour still add up.
- A ferry berths: everyone aboard goes ashore and pays the flat fare ($0.1 each in company dollars -
  what a bus rider pays for about 20 tiles at the default fare), then the pier's queue boards, up to
  400. Fares go straight into the company's cash, and into its monthly report with the buses'.
- Berthings are worked out from the clock in the transport company's own tick (advanceTransportClock),
  hour by hour, so a fast-forward or an off-screen ferry earns the same.
- "+$X" rises over a berthing ferry in Transport Mode only (the buses' too, since this change).
- Still to come in phase 2: buying, selling and servicing ferries, route list and inspector.

## 6. Weather

- Signal 3: ferries run at half frequency.
- Signal 8 and up: all ferries finish their leg and lie at the nearest pier; no fares, no running cost.
  Resume two safe hours after the signal drops (the shelters' rule).
- Red/black rain: no effect (ferries keep sailing).

## 7. Drawing

- Ferries are vessel sprites like the shelter boats: real size, masked and culled the same way (one
  texture per heading, 4 headings from 2 views + mirrors), bobbing with the swell, hidden below a set
  zoom like the sampans.
- Night: lit windows via the sea-light lamps (`sea-lighting.js`), no new bake.
- Piers are special buildings on water tiles, with day art by day and lamps (or night art) at night.

## 8. Phases

1. **Piers and a ferry that sails** - squared art, pier placement and removal, one route between two
   piers, ferries sailing the water path and docking. No passengers or money yet. Check in game:
   placement, sizes, 4 rotations, culling and fps.
2. **Company and passengers** - buy/sell/service at piers, catchment, flat fare, settlement, vehicle
   inspector, route list. Tests for demand and fares.
3. **Weather, interchange, tourism** - typhoon suspension, bus interchange, tourist capacity.

## 9. Decisions (Norton, 2026-10-09)

1. Pier: 2 x 2 on the water against the shore - yes.
2. The pier doubles as the ferry depot (buy, service, sell there; no ship depot) - yes.
3. Flat fare per trip, like the real Star Ferry - yes.
4. One transport company: ferries share the bus company's cash, route list and inspector - and so
   will any later mode (new ferry or bus types alike).
5. Night pier: the day art lit with runtime lamps; the night render is not used.
