# Resource Design

This document defines the resource philosophy, families, starting list, scarcity model, and asteroid ecology for the game world. It is a living reference for zone design, contract authoring, component recipes, and world generation.

---

## The Rule

A resource should not matter because of its price. It should matter because of dependency.

Water matters because ships and stations need it.  
Iron matters because hulls need it.  
Copper matters because machinery needs it.  
Lithium matters because batteries need it.  
Rare earths matter because scanners need them.  
Uranium matters because reactors need it and authorities regulate it.  
Anomaly shards matter because nobody agrees what they are.

That creates stories. Two resources cannot do that. Sixteen can.

---

## Resource Families

Resources are organized into seven families. Families define what something is for, who wants it, and what kind of contracts and organizations it generates. They are not gameplay tiers — a Volatile can be rarer and more valuable than a Conductor in the right region.

### 1. Volatiles

The survival and fuel family.

| Resource | Notes |
|---|---|
| Water Ice | Common-ish, but locally precious. A hub near water becomes important fast. |
| Oxygenate Rock | Oxygen-bearing mineral. Processed for life support and fuel. |
| Carbonaceous Ore | Ancient dark rock. Carbon compounds, organics. Also a habitat material. |

Used for: fuel, life support, cooling, farming, station survival.

Volatiles are common in carbonaceous and comet-fragment fields but absent in metallic belts. Strategic control of water sources is a major economic pressure.

---

### 2. Structural Metals

The civilization family. Not glamorous, but everything depends on them.

| Resource | Notes |
|---|---|
| Iron-Nickel Ore | The steel layer. Hulls, stations, tools, cargo containers. |
| Aluminum Ore | Lighter structural material. Habitat shells, plating, basic frames. |
| Titanium Ore | High-strength, high-value. Used in better hulls and components. |

Used for: hulls, stations, armor, cargo containers, tools, basic components.

These are the "concrete and rebar" of the frontier. Every shipyard, every station, every hub needs them. Demand is constant and supply is uneven.

---

### 3. Industrial Minerals / Silicates

The construction and electronics base.

| Resource | Notes |
|---|---|
| Silicate Stone | Abundant. Panels, insulation, habitat shells, glass, basic electronics. |

Used for: panels, insulation, habitat shells, glass, basic electronics, life-support filters.

This is the boring-but-everywhere material. Starter mining contracts will often target silicates. Low value, reliable, always in demand.

---

### 4. Conductors and Machine Metals

The wiring and machinery family. Creates industrial demand from organizations that build things.

| Resource | Notes |
|---|---|
| Copper Ore | Motors, wiring, power systems. Foundational machinery metal. |
| Cobalt Ore | Batteries, magnets, high-temp alloys. Valuable industrially. |

Used for: motors, batteries, wiring, sensors, power systems.

---

### 5. Energy Minerals

The power and risk family. Rare, dangerous, and politically important. Regulated by authorities.

| Resource | Notes |
|---|---|
| Uranium / Thorium Ore | Reactor fuel. Restricted contracts. Authority-controlled distribution. Dangerous to carry without permits. |

Used for: reactors, military power systems, deep-space stations, restricted contracts.

Energy minerals are the first resource family where documents matter as much as the ore itself. Carrying unregistered fissile material is a crime. Regulated supply creates black markets.

---

### 6. Advanced Tech / Critical Minerals

The high-value specialist family. The "I found something important" resources.

| Resource | Notes |
|---|---|
| Lithium Brine / Ice | Batteries, energy storage. Increasingly critical as the frontier electrifies. |
| Rare Earth Veins | Scanners, guidance, comms, advanced electronics. Hard to find, impossible to substitute. |
| Platinum Metals | Catalysts, precision components, high-end fabrication. Small quantities, very high value. |

Used for: advanced scanners, guidance systems, batteries, lasers, comms, stealth, high-end components.

These resources justify long hauls, dangerous contracts, and corporate conflict. Finding a platinum-metals field in a remote zone is a major event.

---

### 7. Strange / Story Materials

The game's mythic layer. This is where the sleeping-god material lives.

| Resource | Notes |
|---|---|
| Crystal Matrix | Unusual structure. Research contracts. Weird components. Cults. |
| Bio-Mass / Spore Matter | Organic material from living or once-living sources. Research, agriculture, dangerous if mishandled. |
| Anomaly Shard | Nobody agrees what they are. Forbidden contracts. Hallucinations. Anomalies. Black market only. |

Used for: research, cults, weird components, forbidden contracts, hallucinations, anomalies.

Strange materials should appear rarely and generate disproportionate story weight. A single anomaly shard in cargo should feel significant.

---

## Starting Resource List (16)

Start with 16. That is enough to feel wide without becoming spreadsheet hell.

| # | Resource | Family | Scarcity |
|---|---|---|---|
| 1 | Water Ice | Volatiles | Useful but regional |
| 2 | Oxygenate Rock | Volatiles | Useful but regional |
| 3 | Carbonaceous Ore | Volatiles | Common |
| 4 | Silicate Stone | Industrial Minerals | Common |
| 5 | Iron-Nickel Ore | Structural Metals | Common |
| 6 | Aluminum Ore | Structural Metals | Useful but regional |
| 7 | Titanium Ore | Structural Metals | Valuable |
| 8 | Copper Ore | Conductors | Useful but regional |
| 9 | Cobalt Ore | Conductors | Valuable |
| 10 | Lithium Brine / Ice | Advanced Tech | Valuable |
| 11 | Rare Earth Veins | Advanced Tech | Rare |
| 12 | Platinum Metals | Advanced Tech | Rare |
| 13 | Uranium / Thorium Ore | Energy Minerals | Rare |
| 14 | Crystal Matrix | Strange | Very rare / story-gated |
| 15 | Bio-Mass / Spore Matter | Strange | Valuable |
| 16 | Anomaly Shard | Strange | Very rare / story-gated |

---

## Scarcity Model

Scarcity is relative to region, not absolute. A resource that is common in one field type may be absent in another. Scarcity here describes baseline distribution across the world.

**Common** — everywhere, low price, starter contracts
- Silicate Stone
- Iron-Nickel Ore
- Carbonaceous Ore

**Useful but regional** — present in specific field types, moderate price, workhorse contracts
- Water Ice
- Oxygenate Rock
- Aluminum Ore
- Copper Ore

**Valuable** — specific field types, real price, meaningful contracts
- Titanium Ore
- Cobalt Ore
- Lithium Brine / Ice
- Bio-Mass / Spore Matter

**Rare** — uncommon even in target fields, high price, longer-haul contracts
- Rare Earth Veins
- Platinum Metals
- Uranium / Thorium Ore

**Very rare / story-gated** — anomaly zones and specific story triggers only
- Crystal Matrix
- Anomaly Shard

This is a contract ladder. Starter contracts use common material. Better equipment needs regional material. High-end ships need rare material. Storylines need strange material.

---

## Resource Grades (Future)

Each resource can eventually have grades that create variety without needing more resource types.

- Poor
- Common
- Rich
- Pure
- Corrupted
- Irradiated
- Ancient
- Unstable

A rich iron-nickel vein and a corrupted iron-nickel vein are the same resource with different grades. Grades affect yield, processing difficulty, component quality, and legal status. Irradiated or corrupted material may require permits or generate inspection flags.

---

## Asteroid Ecology / Field Types

Every region has a dominant asteroid ecology. Field type determines which resource families are present, at what density, and what kind of activity that generates.

### Carbonaceous Fields

Dark, old, dusty. C-type asteroids. The most common type in the outer reaches.

**Dominant resources:** Water Ice, Carbonaceous Ore, Oxygenate Rock, Silicate Stone, Bio-Mass / Spore Matter  
**Rare finds:** Anomaly Shard, Crystal Matrix  
**Absent:** Metallic resources, Energy minerals

**Activity:** Fuel harvesting, life support contracts, strange life, research, remote settlements. These fields attract survivalists, researchers, and strange cults.

---

### Metallic Fields

Dense, dangerous, valuable. M-type asteroids. The corporate prize.

**Dominant resources:** Iron-Nickel Ore, Platinum Metals, Cobalt Ore, Rare Earth Veins, Titanium Ore  
**Rare finds:** Uranium / Thorium Ore  
**Absent:** Volatiles, organic material

**Activity:** Shipbuilding supply, industrial mining, piracy, corporate claim disputes, heavy patrols. These fields generate the most money and the most conflict.

---

### Stony / Silicate Fields

Common, rugged, construction-heavy. S-type asteroids. The starter zone.

**Dominant resources:** Silicate Stone, Aluminum Ore, Oxygenate Rock, Iron-Nickel Ore (low)  
**Rare finds:** Titanium Ore, Copper Ore  
**Absent:** Advanced tech, energy minerals, strange materials

**Activity:** Starter mining contracts, station construction supply, reliable low-value work. Safe for new pilots. Low drama, steady income.

---

### Volatile Pockets

Cold shadowed regions, comet fragments, deep drifts. Strategically important.

**Dominant resources:** Water Ice, Oxygenate Rock, Lithium Brine / Ice, Hydrogen / Methane traces  
**Rare finds:** Carbonaceous Ore  
**Absent:** Metals, advanced tech, strange materials

**Activity:** Fuel depots, survival station supply, trade route control, strategic conflict. Whoever controls water controls the frontier.

---

### Anomaly Zones

Rare and strange. Nobody agrees on origin.

**Dominant resources:** Crystal Matrix, Anomaly Shard, corrupted or mutated versions of normal ores  
**Rare finds:** Platinum Metals (strange concentrations), Bio-Mass  
**Absent:** Normal reliable resources

**Activity:** Research contracts, cult activity, danger, hallucination events, black market trade. Not a place you mine for a living. A place you enter for a reason.

---

## Zone Resource Profiles (Design Pattern)

Each zone in the world should have resource weights, not hardcoded rock types. The weights drive procedural spawning and contract generation.

Example profile shape:

```
Zone: Old Metallic Belt

Asteroid density:     high
Rock size:            large
Silicate Stone:       medium
Iron-Nickel Ore:      high
Titanium Ore:         low
Platinum Metals:      low
Cobalt Ore:           medium
Water Ice:            very low
Piracy pressure:      medium
Patrol presence:      medium
Corporate claims:     high
```

Zones can stack field types. An outer belt zone might be primarily carbonaceous with a metallic intrusion — that creates interesting mixed contracts and contested territory.

The zone tag system (currently used for danger, ore bias, life bias) needs to expand to support the full resource family vocabulary. That is the bridge between this document and the current zone implementation in `worldZones.js`.

---

## Current Status

The game now has a seven-family material catalog, canonical resource IDs, family shapes/colors, regional and zone-level resource biases, streamed asteroid generation, and source-claim provenance on collected units. The first survival pass gives primary processing roles to materials: volatile materials restore fuel, structural and industrial materials make mining charges, and conductor materials restore scanergy. Advanced, energy, and strange materials have more specialized or high-value roles.

Resource generation has two layers: a low baseline of survival materials keeps normal travel viable, while region and zone profiles create the concentrations that make routes, trade, and claims meaningful. Tags can make a location `fuel-desert`, `charge-desert`, or `scanergy-desert`; those tags make the material scarce rather than impossible, preserving risky rescue-worthy routes without accidental soft-locks.

This document defines the target. The migration path:

1. Add processor compaction and resource grades without losing physical pickup play.
2. Add repair and component-recipe outputs through the same resource records.
3. Add scarcity-aware contract generation (organizations request the resources they need, not just "ore").
4. Add restricted handling and inspections for energy and strange materials.
5. Add grades once the base survival economy is stable.

The world is designed to be about 3 hours across at speed — large enough that resource scarcity is real and regional, not trivially solved by flying to the next field.
