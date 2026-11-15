# Magica

A modern, hex-tile, 1v1, fast-paced tactical fantasy duel. You build a champion from an archetype, abilities and relics, then race a turn timer on a symmetric hex arena. Every match can be spectated live or replayed.

## Quick start

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # engine + AI tests
npm run build    # typecheck + production build into dist/
```

**Controls:** click a lit hex to move · `1`–`4` select ability, then click a target · `Esc` cancel · `Space` / `E` end turn.

**Spectating:** start a match, open a second window on the same URL, then choose **Spectate & replays**. The match appears in the lobby and updates live. Finished matches are saved as replays you can scrub through.

## Rules at a glance

| | |
|---|---|
| **Turns** | Each turn you get AP (spend on abilities) and move points. The turn ends automatically when the timer runs out (10–60s). |
| **Terrain** | 🪨 rock (about 18% of the board) blocks movement and line of sight. Everything else is open ground. |
| **Statuses** | burn / poison (damage each turn) · slow (−move) · root (no movement) · vulnerable (+damage taken) |
| **Shields** | absorb damage and expire at the start of your next turn |
| **Armor / regen** | armor cuts every hit by a flat amount (min 1). Regen heals at the start of your turn. |
| **Knockback** | shoves (or pulls) the target. Getting slammed into rock or the arena edge deals 2 damage. |
| **AoE** | splash hits everyone in the radius, **including you**, unless the ability says it spares you |
| **Win** | reduce the enemy to 0 HP. After 20 rounds the higher HP % wins. |

## Archetypes

Each archetype has a home **school**. The loadout builder suggests that school's abilities, but any archetype can equip any ability.

| | Archetype | School | Identity |
|---|---|---|---|
| 🛡️ | Warden | Steel | Tanky frontliner |
| 🔮 | Arcanist | Arcane | Glass cannon, 4 spell slots |
| 🏹 | Stalker | Nature | Fast skirmisher, 3 relic slots |
| 🧛 | Bloodreaver | Blood | Pays HP for AP, heals by hurting (lifesteal, sacrifice) |
| 🧜 | Tidecaller | Tide | Battlefield control: pulls, knockback waves, cleanses |
| 💀 | Gravebinder | Death | Poison, soul drain, long-range curses. Base regen. |
| ⛰️ | Geomancer | Earth | Slow and armored. Raises rock walls, tremors, boulders. |
| 🥷 | Shadowblade | Shadow | Fragile assassin: mark, swap in, backstab |
| 😇 | Lightbringer | Holy | Cleanses curses, radiant nova, base regen |
| 🧙 | Chronomancer | Time | Haste, stasis (root), rewind cooldowns, 4 spell slots |

There are 32 abilities across 12 schools and 19 relics. Each archetype ships with a themed default loadout.

## Architecture

```
src/
  game/              ← pure TypeScript, no React, no DOM
    hex.ts           axial hex math: distance, lines, spirals, pixel layout
    types.ts         all game data types
    content.ts       abilities, archetypes, relics (add new content here)
    loadout.ts       loadout validation + building a Unit from a Loadout
    board.ts         seeded, point-symmetric arena generation
    engine.ts        createGame / applyAction / replay + queries (reachable, LOS, targets)
    ai.ts            greedy bot: chooseAction(state, player)
    storage.ts       localStorage persistence for loadouts and replays
    rng.ts           seeded PRNG
  net/
    spectate.ts      spectating protocol + pluggable transport (BroadcastChannel today)
  ui/                ← React
    HexBoard.tsx     SVG board, units, highlights, floating combat text
    Panels.tsx       unit cards, ability bar, event log, turn timer
    MatchScreen.tsx  playable match (vs AI / hotseat), hotkeys, timer, broadcasting
    SpectateScreen   lobby, live viewer, replay viewer
    LoadoutBuilder   create/edit/duplicate loadouts
    SetupScreen      mode, loadouts, timer, arena size
```

**The one key idea:** the engine is a pure, deterministic reducer, `(state, action) → state`. It uses no clocks and no `Math.random`. A match is just `config + actions[]`. That gives us these for free:

- **Replays:** store the action list and re-run it.
- **Spectating:** the host broadcasts the config once, then each action. Spectators rebuild state locally.
- **Online multiplayer (next step):** a server relays and validates actions with the same `applyAction`. To build it, implement `SpectateTransport` over a WebSocket.
- **Tests:** AI-vs-AI games run headlessly in `engine.test.ts` and must replay identically.

### Adding content

Add an entry to `ABILITIES`, `ARCHETYPES` or `RELICS` in `src/game/content.ts`. The builder, engine and AI pick it up automatically. To add a new effect type, extend `AbilityEffect` in `types.ts`, then handle it in `resolveEffect` (engine) and `scoreCast` (AI).

## Packaging for Windows (planned)

The Vite build already uses relative asset paths (`base: './'`), so `dist/` loads from `file://`. There are two good options:

- **Electron + electron-builder:** add `electron/main.ts` that opens `dist/index.html`, then `electron-builder --win nsis` → `.exe` installer. This is the most mature option and easy to wire up with Steamworks later.
- **Tauri:** much smaller binaries (~10 MB) and a Rust backend. It needs the Rust toolchain on the build machine.

When packaging, swap `storage.ts` to a file-backed store, and swap the spectate transport for a WebSocket so spectators can watch from other machines.

## Roadmap ideas

- Online matchmaking and spectating over WebSockets (authoritative server reusing `engine.ts`)
- Squads (2–3 units per side), push/pull effects, destructible terrain
- Smarter AI (lookahead search over `applyAction`)
- Sound, sprite art, camera shake on crits
