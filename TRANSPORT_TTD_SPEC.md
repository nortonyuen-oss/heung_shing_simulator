# Heung Shing Simulator — Transport Mode (OpenTTD-lite) Spec v0.6

> **v0.6 unit correction (from playtest):** all company money is now stored
> in the game's existing stylized dollars, where each $1 *reads as* 萬 —
> exactly the convention `COST_HOSPITAL: 7200` (7200萬) already uses. So a
> double-decker is **stored and displayed as $280** (280萬), not $2,800,000,
> and `TRANSPORT_STARTUP_CAPITAL` is **$600**. v0.5 stored the ×10,000
> "real dollar" figures, which (a) looked absurd next to every other price
> in the game and (b) combined with a per-tile running-cost figure calibrated
> for per-trip distances being applied to real monthly mileage (~20k
> tiles/month), made every route unprofitable. Revenue is correspondingly
> scaled: per-rider revenue = `fare × TRANSPORT_FARE_ECONOMY_SCALE`
> (0.00015), with sub-dollar amounts accruing in `company.cashFraction` so
> real-time per-dwell credits are never lost to rounding. Peak payback for a
> fully-loaded double-decker works out to ≈17 months ≈ 1.4 game years —
> inside the §9 target band. Dollar figures elsewhere in this spec are
> historical (v0.5 real-dollar notation); the constants in
> `transport-expansion.js` are the authority.

## 1. Purpose

Evolve the existing "Transport Expansion" (巴士先行, `transport-expansion.js` /
`transport-ui.js` / `transport-visuals.js`) from an **abstract line simulator**
into a real **individual-vehicle** transport game, played through a dedicated
**Transport Mode** — a distinct interaction layer over the same city map,
entered and exited like a tool, not a separate screen or save file.

Target feel: OpenTTD's core loop — found a transport company, build a depot,
buy a bus, give it orders, watch it run, buy more, expand the network — but
scoped to buses only, on this game's existing road network and bus stops.
The player operates it *as a company*, distinct from the city government
they otherwise play as.

This is a refactor/evolution of an already-shipped system, not a fresh build.
Read `transport-expansion.js` before touching anything; most of the plumbing
(pathfinding, stop pairing, depot connectivity, weather suspension, save
schema versioning) is already correct and should be reused, not replaced.

## 2. Current Baseline (what already exists, as of `agent/performance`)

- **Routes are abstract.** A route is `{ stopIds: [...], buses: 1-8, fare }`.
  There is no vehicle entity — `buses` is just a number fed into
  `computeTransportRouteMetrics()`, which derives monthly passengers/revenue/
  cost entirely from formulas (catchment population, frequency, fare
  elasticity, reliability). See `transport-expansion.js:926-969`.
- **Depots are a capacity pool, not a place you buy from.** Building a
  `bus_depot` (3×3, 4-directional, from the earlier bus-depot work) and
  "commissioning" it via `commissionFirstConnectedTransportDepot()` just adds
  `TRANSPORT_DEPOT_CAPACITY` (12) to a shared fleet-size ceiling
  (`getTransportFleetCapacity()`). Routes draw from that shared pool; no bus
  is ever purchased, owned, aged, or serviced individually.
- **Visuals are fake.** `transport-visuals.js`'s "managed vehicles" (max 16,
  `TRANSPORT_VISUAL_CONFIG.maxManagedVehicles`) are rebuilt from scratch
  whenever a route's signature changes, evenly spaced around the loop by
  `ordinal / count` (`createManagedTransportVehicle`,
  `transport-visuals.js:105-154`). They are explicitly documented as
  decorative: *"never persisted and never drive gameplay results"*
  (`transport-visuals.js:2-4`). They already reuse the ambient traffic
  system's leg/progress machinery (`createTrafficLeg`, `evaluateTrafficLeg`)
  and a dwell mechanic (`dwellMs`, `dwellProgress: 1`) copied from the
  ambient bus-stop dwell fix.
- **Spending currently leaks into the city budget.** `spendTransportConstruction`
  draws down `state.startupCreditRemaining` first, then falls straight
  through to `spendBudget` (i.e. `city.budget`) once that credit is gone
  (`transport-expansion.js:400-414`). There is no separate company treasury.
- **Everything else is solid and should survive unchanged:** save-scoped
  schema versioning (`TRANSPORT_EXPANSION_SCHEMA_VERSION`,
  `normalizeTransportExpansionState`), population-gated unlock (3,000 pop),
  additive/optional design (old cities load with the expansion disabled and
  behave exactly as before), stop pairing cost, A* road pathfinding with a
  turn-cost tiebreaker (`findTransportPath`), depot frontage/connectivity
  checks, and weather suspension (signal 8+).

## 3. Core Design Principle

```
CITY SIMULATION  (mayor's game — always running)
        |
        |  keeps running underneath, unaffected by Transport Mode being open/closed
        v
TRANSPORT MODE    ── a tool-menu/HUD swap over the SAME map+camera, not a
(the "layer")        separate scene, separate save, or a pause state
        |
        v
TRANSPORT COMPANY ── a distinct financial identity the player also controls:
                      own name, own president/chairman, own cash balance,
                      seeded with startup capital, self-funding thereafter
        |
        v
DEPOT             ── the only place to buy, sell, and service vehicles
        |
        v
VEHICLE           ── a real, persisted entity: class, purchase price, age,
                      condition, current order index, position-in-leg,
                      cargo/passengers carried this trip
        |
        v
ORDER LIST        ── what a route already is today (ordered stopIds), now
                      assigned to one or more vehicles instead of a bus count
        |
        v
ROUTE ECONOMY     ── driven bottom-up by what vehicles actually carry, paid
                      into the COMPANY's cash, not the city's
        |
        v
CITY FEEDBACK     ── exactly four narrow, explicit effects flow back into the
                      mayor's game (§10) — nothing else crosses the boundary
```

The existing formula-driven `computeTransportRouteMetrics` does **not**
disappear — it becomes the model for *ambient/unmanaged* demand pressure
(how many potential riders exist at a stop) that individual vehicles compete
to serve, the same way `trafficMap` already represents ambient congestion
that individual `traffic-visuals.js` vehicles react to. See §9.

## 4. The Transport Company

The player is, within Transport Mode, the owner of a company distinct from
"the government" they play as in City Mode — mirroring OpenTTD, where you
never touch the town's own money, only your company's.

- **Identity:** `company.name` (default e.g. "香城巴士有限公司" /
  "Heung Shing Bus Co.") and `company.presidentName` (default e.g. the
  player's mayor name, or "巴士大亨" as a placeholder) — both freely
  renameable via a text field in a new "Company" tab of the Transport window
  (`transport-ui.js`). Purely cosmetic, shown in the topbar KPI strip while
  in Transport Mode and on the Finances screen.
- **Treasury:** `company.cash`, a real running balance — **not** a credit
  that falls through to `city.budget`. Seeded once, on first unlock, with a
  new `TRANSPORT_STARTUP_CAPITAL` constant, **replacing**
  `TRANSPORT_STARTUP_CREDIT` (2000 — a leftover from the small-dollar
  aggregate model, too small once vehicles cost millions — see §9):
  `TRANSPORT_STARTUP_CAPITAL = 600` (**萬**, ten-thousands → **$6,000,000**
  — see §9 for why 萬 rather than "thousands" is the right unit here),
  framed narratively as the city investing in a new transport operator.
  Comfortably covers one depot ($4,000, unchanged/small — see below) plus
  two standard double-deckers with working capital left over. From then on:
  - Vehicle purchases, depot construction/upkeep, and route running costs
    debit `company.cash` only. This **includes depot construction** — once
    Transport Mode ships, `placeBusDepotBuilding` (`tools.js`, from the
    earlier bus-depot work) must charge `COST_BUS_DEPOT` (4,000 — this one
    stays a small, ordinary construction cost, in plain dollars like every
    other base-game building cost; only fleet purchase prices/company
    capital are large enough to warrant the 萬 unit) to `company.cash` when
    placed while Transport Mode is active, not to `city.budget` as it does
    today.
  - Fare revenue credits `company.cash` only.
  - `spendTransportConstruction` (`transport-expansion.js:400-414`) drops
    its `city.budget` fallback entirely — a purchase simply fails
    ("insufficient company funds", reusing the existing
    `toast.notEnoughFunds`-style UX) if `company.cash` can't cover it.
  - **Company cannot spend `city.budget`, and the city cannot spend
    `company.cash`.** The only cross-treasury transfer, ever, is the one-time
    founding grant.
- **Bankruptcy handling (v1, simple):** if `company.cash` stays negative for
  more than N months (e.g. 3), auto-suspend routes one at a time (cheapest
  operating cost first) until the balance stabilizes — same `status:
  'suspended'` state routes already support. No forced game-over; the player
  can always sell vehicles to recover cash.
- **Future (not this spec):** a company loan, mirroring the city's own
  existing loan system almost exactly — `LOAN_OPTIONS` (`constants.js:40-44`),
  `city.loans`/`takeCityLoan()`/`applyMonthlyLoanPayments()`
  (`city-state.js:1242-1258`, `sim-economy.js:787-800`) is a ready-made
  structural template for a `company.loans` equivalent. Track as a follow-up
  once the simple bankruptcy handling proves too blunt in practice.

## 5. Transport Mode (the layer)

Confirmed design: **a mode toggle, not a separate scene.** Same map, same
camera, same `activeScene`. Precedent already in this codebase:
`isTerrainCreatorMode` (`main.js`) — a global boolean that swaps the active
tool palette and gates which click-handlers run, without touching the
Phaser scene lifecycle. Transport Mode follows the same shape:
`isTransportModeActive` (kept distinct from `isTransportExpansionActive()`,
which is the unlock/enabled gameplay-effects gate — see §11).

- **Entry point:** a topbar button (mirrors `#topbar-more-btn` styling),
  enabled once `isTransportExpansionActive()` is true (population unlock
  already gates this). Icon suggestion: 🚌, tooltip "Transport Mode / 交通大亨".
- **On entry:**
  - Swap `#tool-menu`'s contents (or overlay a second panel — reuse
    `tool-menu.js`'s category/flyout pattern) to transport-only tools: Build
    Depot, Draw Route / Edit Orders, Vehicle List, Route List, Company &
    Finances. Existing city tools (zoning, roads, services) are hidden, not
    deleted — same pattern `setTerrainEditorUiActive(true)` already uses to
    swap the toolbar for terrain mode.
  - Swap the top HUD strip (`#topbar-kpis`) for company/transport KPIs:
    company cash, fleet size/capacity, monthly net, average reliability,
    active route count — reuse `getTransportSummary()`, already computed
    every tick, extended with `company.cash`.
  - Draw the full route network as a persistent overlay on the main map
    (already exists: `state.routeGraphic` in `transport-visuals.js`, one
    polyline per route in `route.color`) — no longer conditional on a
    picking-stops UI state, it's just always visible while in this mode.
  - Selecting a road/stop/depot tile behaves per the active transport tool
    instead of `handleNewTool`'s city dispatch (`tools.js:57-95`) — same
    `selectedTool` variable, same `pointerdown` pipeline in `main.js`, just
    gated by `isTransportModeActive` first, mirroring how `isTerrainCreatorMode`
    is already checked first in several placement paths.
  - Camera pan/zoom, inspect panel (read-only), save/load, and the pause
    button all keep working — this is a *tool context*, not a modal
    takeover.
  - **Speed control: no separate one.** Transport Mode follows the existing
    global game-speed control (`GAME_SPEEDS`/`game-clock.js`) exactly like
    every other tool context — no Transport-Mode-specific speed UI.
- **On exit:** restore the previous tool-menu category and HUD. Do **not**
  clear `selectedTool`'s transport-specific state (a half-drawn route is
  kept in a draft state, resumable on re-entry — see §8).
- **City simulation:** unaffected. `runLegacyCitySimulationPulse`,
  `runDailySystems`, and `updateTransportSimulation`/`settleTransportMonth`
  (already wired into `simulation.js`/`sim-economy.js` per the baseline
  commit) keep running on the normal daily/monthly cadence regardless of
  whether Transport Mode is open. Managed vehicles keep moving even while
  the player is back in City Mode — matching OpenTTD, where the network runs
  whether or not you're looking at it.

## 6. Click a vehicle → inspector window

New interaction, available whenever Transport Mode is open (and optionally
in City Mode too, for ambient/managed vehicles alike, as a lightweight
read-only peek): clicking a managed vehicle's sprite opens a small floating
window, same visual language as the existing building inspect flow
(`inspect-panel.js`) but vehicle-shaped:

- Vehicle name/id, class (e.g. "Standard Double-Decker"), owning route
  (clickable → opens that route's editor), current status (En Route /
  Dwelling / At Depot / Servicing / Broken Down / Returning to Depot).
- Age, condition (bar, 0-100%), odometer.
- Passengers aboard / capacity, current leg (from stop X to stop Y).
- Purchase price, and a **Sell** button — disabled unless `status ===
  'depot'` (see §7's return-to-depot-before-sale rule), in which case
  clicking it here does the same thing as selling from the Depot window.

Implementation note: reuse `inspect-panel.js`'s positioning/open-close
plumbing rather than building a new floating-window system from scratch —
it already solves "position near cursor, avoid viewport overflow" for
building tooltips (`main.js:9132` area).

## 7. Bus stops: visible passenger queues

Bus stops currently render as a static prop (`main.js`'s
`placeBusStopSprite`/`positionBusStopSprite`). Add a small queue of waiting-
passenger icons/sprites at each stop, count driven by the same catchment-
based waiting-rider estimate already computed for passenger pickup (§9) —
i.e. this is a *view* of real simulation state, not an independently rolled
decoration.

- Cap the visible queue at a small number (e.g. 0-6 sprites) mapped from the
  actual waiting-rider count via a simple bucket (0 → none, 1-10 → 1 sprite,
  11-25 → 2, ... capped) so a very busy stop doesn't need to render 80
  individual figures.
- Anchor position: offset from the same `getBusStopAnchorPoint` used for the
  shelter sprite itself, on the platform side, small per-sprite jitter so
  they don't perfectly overlap.
- Queue shrinks visibly as a dwelling vehicle boards passengers (ties
  directly into §9's boarding logic — recompute the bucket after each
  boarding event at that stop, not just once a simulation day).
- No queue rendering at all for stops with zero routes serving them or zero
  estimated waiting riders — most of the map's ambient (unmanaged) bus stops
  stay exactly as they are today.

## 8. Data model (schema v2)

Bump `TRANSPORT_EXPANSION_SCHEMA_VERSION` to `2`. `normalizeTransportExpansionState`
already takes a version-tagged raw blob and rebuilds defensively — extend it,
don't replace it.

### 8.1 New: company

```js
{
  name: '香城巴士有限公司',
  presidentName: '巴士大亨',
  cash: 2000,             // was TRANSPORT_STARTUP_CREDIT-as-credit; now a real balance
  foundedYear: 1900,
  foundedMonth: 4,
}
```

### 8.2 New: vehicle entity

```js
{
  id: 'bus-17',                 // stable across saves
  classId: 'standard_double_decker', // → VEHICLE_CLASSES catalog, §9
  routeId: 'route-3' | null,    // null = idle at a depot, unassigned
  depotId: 'building-id-of-home-depot', // where it services/was bought
  orderIndex: 0,                // which stop in route.stopIds it's heading to
  progress: 0.42,               // 0-1 along the current leg (reuses createTrafficLeg)
  ageMonths: 14,
  odometerTiles: 8840,
  condition: 0.91,              // 1 = new, decays with ageMonths + odometer
  daysSinceService: 46,         // drives the mandatory periodic depot visit, §10
  status: 'active' | 'depot' | 'servicing' | 'broken_down'
        | 'delivering_to_depot' | 'returning_for_service',
  purchasePrice: 2800000,       // stored as real dollars; 萬 is just the spec's/UI's display unit, see §9
  passengersAboard: 18,
  tripRevenueAccrued: 0,        // resets each time it dwells at a stop
}
```

Stored under `expansionState.transport.vehicles`, keyed array like `stops`/
`routes` today. `nextVehicleId` counter alongside the existing `nextStopId`/
`nextRouteId`.

### 8.3 Changed: route

`route.buses` (a count) is replaced by `route.vehicleIds: []` (derived —
computed as "all vehicles whose `routeId === route.id`", not stored
independently, to avoid the two ever disagreeing). Everything else on
`route` (id, name, color, stopIds, fare, status, history) is unchanged.

### 8.4 Migration (v1 → v2)

On load, if `schemaVersion === 1`:
- Create the `company` object: `cash: state.startupCreditRemaining` (carry
  forward whatever unspent credit existed), `foundedYear`/`foundedMonth`:
  city's current date, `name`/`presidentName`: defaults.
- For each route with `buses: N`, spawn `N` new vehicles of
  `classId: 'standard_double_decker'`, `condition: 1`, `ageMonths: 0`,
  `purchasePrice: 0` (grandfathered in — not a real purchase, so it doesn't
  debit the new `company.cash`), assign `routeId` to that route, `depotId`
  to whichever connected depot has spare capacity (round-robin if several).
- Bump `schemaVersion` to 2 and continue. This is a **one-way** migration;
  do not attempt to support opening a v2 save in old code.

## 9. Vehicle classes (purchase catalog)

Existing bus art is two skins: `bus_kmb`, `bus_citybus`
(`TRAFFIC_MODEL_REGISTRY`, `traffic-visuals.js:116-123`), both currently
`scale: 0.18816`. Rather than blocking on new art, ship v1 of the catalog as
**stat-differentiated classes reusing these two skins**, exactly like the
bus depot shipped against existing art:

Purchase prices simulate real ~year-2000 Hong Kong double-/single-deck bus
procurement cost. Table values are **in 萬 (ten-thousands)** rather than
thousands — the natural unit for numbers this size in Chinese, and the same
unit `TRANSPORT_STARTUP_CAPITAL` uses in §4. `280` means **280萬 =
$2,800,000**. (This also makes an existing base-game number read more
sensibly in passing: `COST_HOSPITAL: 7200`, read as `7200萬`, is a genuinely
plausible real hospital price — though to be clear, **this spec does not
propose changing `COST_HOSPITAL` or any other base-game constant**; that
number stays exactly `7200` [plain dollars] in the actual city economy.
It's purely an aside about which unit reads naturally, not a call to
rescale the mayor's game.)

**Resolved: fast payback, fares scaled up accordingly.** Because the whole
game runs on a compressed clock (1x ≈ 20 real sec/game month, ≈ 4 real
min/game year — `game-clock.js`), "realistic" multi-decade payback isn't
the right target: it would make owning a second bus feel practically
unreachable within a normal play session. Target instead: **a well-run,
well-loaded route pays back a vehicle's purchase price in roughly 1.5-2
game years** (≈ 6-8 real minutes at 1x) at *peak* ridership — a genuinely
fast, satisfying "buy → profit → buy more" loop, with the honest caveat
that a mediocre or poorly-connected route earns far less than this ceiling
(possibly a loss), same as real transit economics.

This requires two changes, not fare alone:

1. **Replace the old aggregate `TRANSPORT_CAPACITY_PER_BUS_MONTH: 500`**
   (a monthly-abstraction number from the old formula-driven model) **with
   a per-class monthly ridership ceiling** that reflects a real vehicle
   doing several round trips a day — `TRANSPORT_VEHICLE_MONTHLY_RIDERSHIP_CAP`
   per `classId`, roughly proportional to seat capacity.
2. **Raise the fare band substantially** — this game's whole dollar economy
   is already stylized/compressed (e.g. `STARTING_BUDGET: 10,000`,
   `COST_HOSPITAL: 7,200` — a hospital costs less than one bus), so a fare
   no longer needs to resemble a literal single HK-dollar bus fare; it's an
   abstracted revenue-per-boarding figure consistent with everything else
   in this economy.

| classId | skin | capacity | speedFactor | purchasePrice (萬) | monthlyRidershipCap | fare band (min/default/max) | monthlyUpkeep | tileRunningCost |
|---|---|---|---|---|---|---|---|---|
| `standard_double_decker` | bus_kmb | 70 | 1.0 | **280** | 4,200 | 15 / **35** / 60 | 900 | 12 |
| `express_single_deck` | bus_citybus | 45 | 1.25 | **210** | 2,700 | 15 / **35** / 60 | 1,100 | 16 |

Worked check (peak, i.e. `monthlyRidershipCap` fully served at the default
fare, running cost on a ~40-tile round trip):
- Double-decker: `4,200 × 35 = $147,000` gross/month; cost `900 + 12×40 =
  $1,380`/month → net ≈ **$145,620/month** → payback `2,800,000 / 145,620`
  ≈ **19.2 months** ≈ **1.6 game years**. On target.
- Single-deck: `2,700 × 35 = $94,500` gross/month; cost `1,100 + 16×40 =
  $1,740`/month → net ≈ **$92,760/month** → payback `2,100,000 / 92,760` ≈
  **22.6 months** ≈ **1.9 game years**. On target, slightly slower —
  reasonable given its lower capacity-to-price ratio.

`TRANSPORT_FARE_MIN/MAX/STEP/DEFAULT` become `15 / 60 / 5 / 35` globally
(replacing `1 / 5 / 0.5 / 2.5`) — routes still set their own fare in this
band, same UI/mechanic as today, just rescaled.

Operating cost is deliberately kept a small fraction of *peak* revenue
(~1%) rather than a large one: the real strategic risk should come from
**ridership actually falling short of the ceiling** (a disconnected, low-
catchment, or unreliable route earns nowhere near `monthlyRidershipCap`,
and running costs alone can then exceed a bad route's thin revenue,
producing a genuine loss) — not from fixed costs eating a good route alive.
This preserves "plan your network well" as the actual skill being tested.

These numbers are a strong, worked starting point, not a substitute for
the playtesting pass in §17 step 4 — confirm against a real mid-size city's
actual catchment/ridership numbers once the individual-vehicle simulation
(§12) is running, and adjust `monthlyRidershipCap`/fare together if real
play doesn't hit the ~1.5-2 game year target.

Future phase (not this spec): commission real distinct low-floor/minibus art
and widen the catalog. Track as a follow-up, don't block v1 on it.

## 10. Depot: buy / sell / service

The depot building already exists (3×3, 4-directional, `bus_depot`). In
Transport Mode, clicking a **commissioned, connected** depot opens a Depot
window (new, `transport-ui.js`):

- **Buy tab:** list `VEHICLE_CLASSES`, cost, capacity/speed stats. Buying
  debits `company.cash` (§4 — no more startup-credit-then-city-budget
  fallback), creates a vehicle with `status: 'depot'`, `routeId: null`,
  parked at that depot.
- **Fleet tab:** every vehicle with `depotId` = this depot. Per vehicle:
  age, condition, current route (or "Unassigned"), a **Sell** button (only
  enabled when `status === 'depot'`, i.e. it must return home first), and
  an **Assign to route ▾** dropdown. (Same info as the click-to-inspect
  window, §6, just listed for the whole depot at once.)
- **Service: mandatory and periodic, like real OpenTTD** — not passive/
  idle-only. Each vehicle tracks `daysSinceService` (new field, §8.2). Every
  `TRANSPORT_SERVICE_INTERVAL_DAYS` (suggest 120 ≈ 4 months), the vehicle
  automatically interrupts its route once it finishes its *current* leg
  (never mid-leg), reroutes to its `depotId` via `findTransportPath` (same
  mechanic as the sell-requires-return flow below), and enters `status:
  'servicing'` for a fixed duration (e.g. 3-4 days). On completion:
  `condition` resets to 1.0, `daysSinceService` resets to 0, and it resumes
  its route from the order it left off on. This is the "出車" side too —
  a newly-purchased vehicle's very first movement is always *out of* its
  depot onto its assigned route, and every subsequent servicing trip is a
  round-trip back into the same depot and back out again.
  - If a vehicle is overdue for service but its depot is currently
    disconnected from the road network (§ `isTransportDepotConnected`),
    servicing is simply skipped/deferred — `condition` keeps decaying,
    raising breakdown risk (§12), which is the natural in-fiction consequence
    and needs no special-case code.
  - `condition` still regenerates while idly parked at a depot beyond a
    completed service (e.g. an unassigned vehicle just sitting there stays
    at 1.0), but the periodic auto-visit is what a *working* vehicle relies
    on — it does not need to go idle to get serviced.
- **Selling a vehicle that's out on a route:** it must finish its current
  leg, then autonomously route itself back to `depotId` (`status:
  'delivering_to_depot'`, orders temporarily ignored) before the Sell button
  activates — mirrors OpenTTD's "sell" flow (can't scrap mid-road). Reuse
  `findTransportPath` for the return leg. Sale proceeds credit `company.cash`.
- **Depot capacity** (`TRANSPORT_DEPOT_CAPACITY = 12`) becomes a literal cap
  on how many vehicles can be *homed* at that depot (bought there or
  reassigned there), not an abstract fleet-size pool subtracted from route
  bus counts. `getTransportFleetCapacity()`/`getTransportRequestedFleet()`
  get repurposed accordingly (§13).

## 11. Route / order editing in Transport Mode

Reuses the existing stop-picking flow (`transportUiState.pickingStops`,
already in `transport-ui.js`) almost unchanged — a route is still "click
stops on the map in order." What's new:

- **Assigning vehicles to a route** happens from the Depot window (§10) or
  from the Route editor's "Fleet" section — pick idle depot vehicles and add
  them to `route.vehicleIds`. No more `buses: 1-8` slider.
- **Route capacity feedback:** show *derived* headway from how many vehicles
  are actually assigned and the round-trip time (same formula shape as
  `roundTripMinutes` today), not from a target the player types in — the
  player achieves a shorter headway by buying/assigning more buses, not by
  moving a slider.
- **Broken/suspended routes:** identical semantics to today
  (`ensureTransportRouteRuntime`'s `status: 'broken'`/`brokenReason`) — a
  route with no valid path, an unpaired stop, or a disconnected depot stays
  `broken`; assigned vehicles idle at their current position (don't
  teleport, don't vanish) until the route is fixed.
- **Route cap:** new `TRANSPORT_MAX_ROUTES = 50`, city-wide (there's only
  ever one company). `createTransportRoute`/`validateTransportRouteDraft`
  (`transport-expansion.js:731-779`) reject a new route past the cap with a
  new `createTransportError('routeLimit')`, surfaced in the route editor UI.
  Editing/deleting existing routes is never blocked by the cap.

## 12. Individual vehicle simulation

This is the biggest actual behavior change — replacing
`computeTransportRouteMetrics`'s aggregate math with real per-vehicle trips,
while keeping the **demand model** (how many people want to ride) as-is.

- **Movement:** every vehicle advances along `route.stopIds` using the exact
  leg/progress/dwell machinery already built for both ambient buses
  (`traffic-visuals.js`'s `findMatchingBusStopSide`/dwell fix) and the
  current decorative managed vehicles (`transport-visuals.js`). This is a
  promotion, not a rewrite: `vehicle.progress`, `vehicle.leg`, dwell state
  move from being recomputed every render into the persisted vehicle record,
  advanced once per simulation day (`onCalendarDayAdvanced`, `game-clock.js`)
  rather than every rendered frame — the *visual* interpolation between two
  daily positions can still run every frame for smoothness, but the
  authoritative position only needs to update daily, matching every other
  city system's cadence (see `game-clock.js`'s daily/pulse split).
- **Passenger pickup:** when a vehicle dwells at a stop, compute available
  riders at that stop using the *existing* catchment logic
  (`TRANSPORT_STOP_CATCHMENT_RADIUS`, `getTransportDestinationUnits`,
  residential/commercial/industrial building scan already in
  `updateTransportSimulation`) minus riders already aboard other vehicles
  that dwelled there this cycle (so two buses at the same stop don't both
  claim the same 40 waiting passengers). Board up to
  `min(waiting, capacity - passengersAboard)`. This same "waiting" number
  drives the stop queue visual, §7.
- **Passenger drop-off / revenue:** passengers alight probabilistically
  based on destination-unit weighting among remaining stops on the route
  (a rider boarding near a residential stop is more likely bound for the
  nearest high destination-unit stop — school, mall, hospital). Revenue
  accrues per rider at `route.fare` on drop-off, credited to
  `company.cash` immediately (not batched to month-end like today's
  `settleTransportMonth` — real per-trip cash flow is part of the OpenTTD
  feel), with `state.lastFinancials`/route `history` still aggregated
  monthly for reporting as today.
- **Running cost:** `classId`'s `tileRunningCost × tiles moved this month +
  monthlyUpkeep`, replacing `TRANSPORT_BUS_MONTHLY_BASE_COST`/
  `TRANSPORT_BUS_TILE_COST` per-effective-bus math with a real per-vehicle
  sum, debited from `company.cash` at month-end (running costs stay
  monthly even though revenue is now real-time — no need to micro-debit
  fuel/upkeep per tile).
- **Reliability / breakdown / mandatory service:** `condition` decays slowly
  with age and distance; `daysSinceService` increments daily whenever
  `status` isn't `'depot'`/`'servicing'`. Once `daysSinceService >=
  TRANSPORT_SERVICE_INTERVAL_DAYS` (§10), the vehicle auto-returns to its
  depot at the next leg boundary — this is the *primary* way condition stays
  healthy, not an optional idle-time bonus. Independently, if `condition`
  drops below a threshold (e.g. 0.35 — meaning service was skipped, most
  likely because the depot was disconnected), a small monthly breakdown
  chance sets `status: 'broken_down'` for a few days (vehicle stops moving,
  visually shows a wrench/smoke icon), then self-recovers — a lightweight
  stand-in for OpenTTD's full breakdown system, not a 1:1 port.
- **Weather (signal 8+):** identical to today — `isTransportSevereWeather()`
  already grounds the aggregate system; individual vehicles instead get
  `status: 'depot'`-equivalent (parked in place, not simulated) for the
  storm's duration, same as ambient buses/minibuses already vanish under
  `TRAFFIC_SEVERE_WEATHER_GROUNDED_CATEGORIES`.

## 13. What gets renamed/repurposed vs. kept

To keep the diff reviewable, prefer **extending** existing functions over
duplicating them:

- `getTransportFleetCapacity()` → sum of connected depots' vehicle-slot
  capacity (unchanged formula, different meaning: literal parking spots, not
  an abstract pool).
- `getTransportRequestedFleet()` → `state.vehicles.filter(v => v.routeId ===
  ...).length`, still used the same way to gate new purchases/assignments.
- `computeTransportRouteMetrics` → keep as-is, repurposed as the **demand
  ceiling estimator** shown in the route editor as "potential ridership,"
  not as the thing that actually generates revenue.
- `updateTransportSimulation`/`settleTransportMonth` → same call sites,
  same cadence (daily/monthly via `simulation.js`), internals swapped from
  formula math to summing real vehicle trips and reconciling `company.cash`.
- `transport-visuals.js`'s `createManagedTransportVehicle` → deleted; the
  vehicle sprite is now created once when a vehicle is purchased/assigned
  and persists, positioned each frame from the persisted `vehicle.progress`/
  `vehicle.leg` instead of being rebuilt from an evenly-spaced formula.
- Naming: `isTransportExpansionActive()` (unlock+enabled check) stays as the
  gameplay-effects gate; add a separate `isTransportModeActive` (or similar)
  for "is the UI layer currently open" — these are orthogonal (a player can
  have the expansion active with routes running while never opening
  Transport Mode this session).

## 14. City feedback — exactly four effects, precisely scoped

This is the **entire** surface area where Transport Mode is allowed to touch
the mayor's game. Nothing else. Each one's current implementation and the
change needed:

### 14.1 Traffic relief in busy, well-served areas

**Current:** `getBuildingTransportModeShare(id)` discounts a building's
contribution to road traffic load, consumed in the traffic-demand loop at
`sim-infrastructure.js:460-465`:
```js
const transportModeShare = typeof getBuildingTransportModeShare === 'function'
  ? getBuildingTransportModeShare(id) : 0;
const demand = (TRAFFIC_DEMAND_WEIGHTS[zoneType]?.[level] ?? 1)
  * industrialRevitalizationMultiplier
  * (1 - clamp(transportModeShare, 0, 0.25));
```
**Change:** keep this exact call site and mechanism, but the *quality*
value feeding `transportRuntime.buildingModeShare` (today
`benefitQuality` — a formula blend of route quality × load factor,
`transport-expansion.js:1147-1169`) must now come from **real usage +
route density**, not the old formula: a building's relief should scale with
(a) how many *distinct* routes actually serve its nearest stop (route
density) and (b) that stop's actual ridership relative to its capacity
this month (real usage, from §12's per-vehicle boarding data). A stop with
one lightly-used route gives little relief; a stop with three overlapping,
well-loaded routes gives close to the existing `TRANSPORT_TRAFFIC_RELIEF_MAX`
(0.25) cap. Cap and consumption point unchanged.

**"Route density" itself is explicitly deferred** — per your instruction,
park the exact definition (one busy interchange vs. a well-covered
neighbourhood, how far apart two stops can be and still count as the "same"
service area, etc.) for a later pass, once the max-50-routes cap (§11) and
real usage numbers exist to playtest against. Ship v1 of this hook using
*usage alone* (ridership/capacity at the building's nearest served stop,
no route-count multiplier) so the other three §14 hooks and the rest of
this spec aren't blocked on it; layer in the density term once defined.

### 14.2 Commercial land value bonus (commercial-zoned tiles only)

**Current:** `getTransportLandValueBonus(row, col)` applies uniformly to
*any* zoned tile near a stop, inside `composeLandValueMap`'s `applyTile`
(`overlay-controls.js:872-881`):
```js
if (zoneMap[r][c] === ZONE_RES) { val += canopy-bonus; val += scenic-bonus; }
val += landmarkBonus[r]?.[c] ?? 0;
if (typeof getTransportLandValueBonus === 'function') {
  val += getTransportLandValueBonus(r, c);   // currently: any zone
}
```
**Change:** gate the transport land-value term to `zoneMap[r][c] ===
ZONE_COM` only — residential and industrial tiles get **no** land-value
effect from transit access (industrial gets a *demand* effect instead, see
§14.3; residential gets a *happiness* effect instead, see §14.4). This is a
one-line change: move the `getTransportLandValueBonus` call inside a new
`if (zoneMap[r][c] === ZONE_COM)` block, sitting next to the existing
`ZONE_RES`-gated blocks in the same function.

### 14.3 Industrial demand boost when an industrial zone has a bus stop

**New** — no existing hook. `city.demandI` is computed in
`simulation.js:561-589` inside one `clamp(...)` block with no transport term
today (unlike `demandC`, which already has `transportCommercialBonus`
wired in at `simulation.js:535-536,551`). Add a new additive term the same
way:
```js
const transportIndustrialBonus = typeof getTransportIndustrialDemandBonus === 'function'
  ? getTransportIndustrialDemandBonus() : 0;
// ...inside the existing clamp(...) for city.demandI:
  + transportIndustrialBonus
```
New function `getTransportIndustrialDemandBonus()` in `transport-expansion.js`,
same shape as `getTransportCommercialDemandBonus()`: proportional to the
share of industrial buildings that have a bus stop within
`TRANSPORT_STOP_CATCHMENT_RADIUS` **that is actually served by an active
route** (not just any placed stop — ambient/manual bus stops with no
managed route don't count), capped at a new
`TRANSPORT_INDUSTRIAL_DEMAND_BONUS_MAX` constant (suggest matching
`TRANSPORT_COMMERCIAL_DEMAND_BONUS_MAX`'s 0.03 as a starting point). This
reads as "transit lets workers reach the industrial zone," distinct from
14.4's residential happiness effect.

### 14.4 Residential happiness — tier H and below only, never UH

**Current:** `getTransportHappinessBonus()` is a single **global flat**
scalar added to `city.happiness` (`simulation.js:739-746`), derived from
`residentialCoverage` (§ population-weighted, no tier filtering) ×
`averageQuality` in `updateTransportSimulation`
(`transport-expansion.js:1204-1215`).

**Change:** filter which population counts toward `coveredResidentialPopulation`
by wealth tier before computing `residentialCoverage`. The tier lives on the
building record as `record.wealthTier` (`'L'|'M'|'H'|'UH'`, set at spawn in
`sim-growth.js:775-777`) — precedent for exactly this kind of tier check
already exists at `sim-growth.js:297`
(`['H','UH'].includes(record.wealthTier)`). The new residential-benefit loop
in `updateTransportSimulation` should be:
```js
if (assignment.record.type === 'residential' && assignment.record.wealthTier !== 'UH') {
  residentialBenefits.set(assignment.id, ...);
}
```
i.e. L/M/H residents contribute to the happiness bonus when transit is
convenient; UH (ultra-rich) residents never do, regardless of how well
served their building is — they don't ride the bus. Everything downstream
(`coveredResidentialPopulation`, `residentialCoverage`, the
`TRANSPORT_HAPPINESS_BONUS_MAX` cap, the `city.happiness` consumption site)
stays exactly as it is; only which buildings feed the numerator changes.

### 14.5 Everything else is explicitly out of scope

No other city system reads transport state. In particular: no effect on
zone growth/decline chances, no effect on power/water demand, no effect on
crime/education/health indices, no effect on the stock market, no effect on
tourism/attractiveness. If a future idea wants a fifth hook, it needs its
own spec section here, not a quiet addition somewhere else.

## 15. Performance

- Existing viewport culling pattern (`traffic-visuals.js`'s
  `getTrafficCameraRect`/`removeTrafficVehiclesOutside`) applies to managed
  vehicles too: only vehicles within (or near) the camera view need a live
  sprite; off-screen vehicles are simulated as data only (position computed
  from elapsed progress, not stepped frame-by-frame) and get a sprite
  created/destroyed as they cross into/out of view — same pattern already
  used for ambient traffic.
- Fleet size is naturally bounded by depot count × 12 capacity, which in
  turn is bounded by how many depots the player can afford/place — no
  separate hard cap needed beyond what `TRANSPORT_VISUAL_CONFIG.maxManagedVehicles`
  already suggests as a sane on-screen-at-once ceiling (raise it, e.g. to
  48, now that vehicles are real rather than always-rendered).
- The `agent/performance` branch's renderer-batching fix (shared pipeline
  for trees/buildings) applies equally to bus sprites — do not introduce a
  new custom pipeline for transport vehicles for the same reason it was
  just removed for trees.
- Passenger-queue sprites (§7) are small, capped-count, and only exist at
  stops with real waiting riders — should be negligible next to vehicle
  sprite counts, but batch-destroy/recreate them the same way vehicle
  sprites are culled, not as a separate uncapped system.

## 16. Non-goals (this spec)

- Trains, ships, planes, trucks/cargo — buses only, per "巴士先行." The
  existing container port/airport/vessel systems remain purely ambient
  decoration; extending Transport Mode to them is a plausible future spec,
  not this one.
- Road/rail construction *for* transport (players already build roads via
  the base city tools; Transport Mode routes ride on whatever road network
  exists, it does not add a parallel construction system).
- Full OpenTTD breakdown/refit/multi-cargo depth — the lightweight
  condition/reliability model in §12 is deliberately simpler.
- Competing AI transport companies.
- Multiplayer/multiple player-owned companies.
- A company loan mechanic (§4 flags the city's existing loan system as a
  ready template, but v1 ships with simple auto-suspend-on-bankruptcy
  instead).
- Any city-side effect beyond the four in §14.

## 17. Suggested implementation order

1. Schema v2 + migration (§8), including the new `company` object, with
   tests mirroring `test/transport-expansion.test.js`'s existing
   `'old cities default to a disabled additive schema...'` pattern for the
   v1→v2 case specifically.
2. Company treasury: remove the `city.budget` fallback from
   `spendTransportConstruction`, wire real `company.cash` debits/credits.
3. Vehicle entity + depot buy/sell/service (§10), no Transport Mode UI yet —
   verify via the same kind of headless state-machine tests already in
   `test/transport-expansion.test.js` (it's almost entirely pure functions).
4. Individual vehicle simulation replacing the aggregate math (§12), diffed
   against the old formulas' output on a fixed scenario to sanity-check the
   balance lands in the same ballpark before deleting the old code path.
5. The four precisely-scoped city hooks (§14), each as its own small,
   independently testable change.
6. Transport Mode UI shell (§5) — tool-menu swap, HUD swap, entry/exit,
   reusing `isTerrainCreatorMode` as the structural template.
7. Route/order editor + vehicle list windows (§11), Company tab (name/
   president rename, §4), vehicle inspector (§6), stop passenger queues
   (§7) — building on the existing `transport-ui.js` window shell and
   `inspect-panel.js`'s positioning plumbing.
8. Promote `transport-visuals.js` from decorative to authoritative (§13),
   delete the old `createManagedTransportVehicle` rebuild-on-signature-change
   path.
9. Balance pass + regression suite covering: old-save migration, company
   treasury isolation (no cross-spending with `city.budget`), depot capacity
   enforcement, weather suspension, broken-route vehicle idling,
   sell-requires-return-to-depot, each of the four §14 hooks independently,
   performance with a large (~40 vehicle) fleet.

## 18. Resolved since v0.1, and what's still open

Resolved (this revision):
- Company identity, treasury isolation, and depot-cost ownership → §4.
- Vehicle purchase prices, in realistic year-2000 HK-dollar terms → §9.
- Depot servicing is mandatory and periodic (`daysSinceService`,
  auto-return-to-depot), not passive-idle-only → §10, §12.
- Transport Mode always follows the existing global game speed, no
  separate control → §5.
- Route cap: `TRANSPORT_MAX_ROUTES = 50` → §11.
- Revenue fully rebalanced for fast payback given the compressed clock: new
  per-class `monthlyRidershipCap`, fare band raised to `15/35/60` (was
  `1/2.5/5`), operating costs scaled ~10x — worked to a ~1.5-2 game year
  payback at peak ridership → §9.

Still open / explicitly deferred:
- §9's worked numbers are a strong starting point but still want a
  playtesting pass (§17 step 4) against a real mid-size city's actual
  catchment/ridership before being called final.
- §14.1's exact "route density" formula — deferred, ships v1 as usage-only
  (no density term) per your instruction; revisit once real usage data
  exists to tune against.
- Bankruptcy grace period in §4 (suggested 3 months, not final).
