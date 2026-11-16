# Magica

A modern, hex-tile, 1v1, fast-paced tactical fantasy duel between two mages. You build a mage from a point budget, then outguess your opponent on a symmetric hex arena. Every attack is telegraphed and can be dodged or countered. Every match can be spectated live or replayed.

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

The vocabulary used here is defined in [`CONTEXT.md`](CONTEXT.md).

**Mages and Loadouts.** Every mage starts with 10 HP, Movespeed 3 and Magic 3. Your **Circle** sets your Loadout Point budget: First Circle has 30, Second 20 and Third 10. Points buy:
- **Stat steps.** Each step costs more than the last:

  | Stat | Gain per step | Step costs |
  |---|---|---|
  | HP | +3 | 1, 2, 3, … |
  | Magic | +1 | 2, 3, 4, … |
  | Movespeed | +1 | 3, 5, 7, … |

- **Abilities.** At most 8, including the free Staff Strike. An Ability is either a **Spell** (costs Mana) or a **Technique** (physical, no Mana).
- **Passives**, which are always on.

**Mana.** You start with Mana equal to your Magic and regain that much at the start of each of your turns, except your first. You can hold at most 10 × Magic. P2 starts with one extra turn of regen to offset going second.

**Mana Crystals.** There are always two on the board: a Large one and a Small one. Each goes **Spawning → Almost Ready → Ready**, one step per round. Standing on a Ready crystal, spend 1 AP to **Absorb Mana**: the Small crystal gives Mana equal to the round number and the Large one gives double. An absorbed crystal reappears elsewhere as Spawning.

**AP and movement.** Each turn you get 2 AP:
- Your first Move spends 1 AP for Movement Points equal to your Movespeed. Once those run out, another AP buys another batch.
- Each cast and each Technique costs 1 AP. **Fast** Spells cost none.

**Two-phase turns.**
1. **Reaction Phase.** This only happens if attacks are pending against you. Every incoming Attack shows its **Threat Area**. You can walk out of it, or cast **Reaction Spells** for Mana and 0 AP:
   - **Counterspell** cancels one incoming Spell.
   - **Deflect** sends a Line back at the attacker.
   - **Ward** shields you against everything landing this turn.
   - **Blink** teleports you out.
2. **Resolution.** Pending Attacks land in the order they were cast, on anyone standing in their area, the caster included.
3. **Action Phase.** Move, attack, absorb Mana and set up your defences.

**Contested Spells and secret bids.** Some Spells, like Stasis, aren't dodged. Casting one opens a 7-second **Bidding** window, and the caster's turn timer pauses while it is open. Both mages secretly bid Mana: the caster to land the Spell, the target to Resist it. The Spell lands if the caster bids at least as much, and both bids are spent either way. The bids are revealed together, and the caster's timer resumes with 2s added. Bids are kept secret by commit-and-reveal (see `docs/adr/0003-secret-bids-by-commit-and-reveal.md`), so they stay hidden from spectators and, later, online opponents.

Attacks never land right away. Every one gives the opponent a chance to react, so a hit is about where you can force them to be.

**Threat Area shapes:**
- **Line:** stopped by rock.
- **Explosive Line:** a Line that explodes where it stops.
- **Single Hex.**
- **Cone:** a 60° wedge.
- **Fan:** three Lines spread 30° apart.
- **Melee Arc:** 3 hexes in front of the caster.
- **Burst:** radius 1 to 4 around a chosen hex.
- **Self-Burst:** centred on the caster. Step out before it lands!
- **Wall:** 5 connected hexes that you draw.

| | |
|---|---|
| **Terrain** | 🪨 Rock covers about 18% of the board and blocks movement and Lines. Everything else is open ground. |
| **Statuses** | Burn and poison deal damage each turn. Slow means fewer Movement Points per AP, and root means no movement. Vulnerable adds +damage to every hit you take. |
| **Win** | Reduce the enemy to 0 HP. After 30 rounds, the higher HP % wins. |

**Controls:**
- Click a lit hex to move. Hexes drawn with dashes would cost an AP.
- `1`–`8` selects an Ability, then click to aim. Self-targeted Spells cast immediately.
- For a Wall, click 5 connected hexes. Click the last one again to undo it.
- `A` absorbs Mana.
- `Space` ends the phase or the turn. `Esc` cancels.
- `M` mutes or unmutes the music. Music volume is under ⚙️ Settings: open it from the main menu or the bottom-left corner (even mid-match), and it's remembered between visits.

## Architecture

```
src/game/            ← pure TypeScript, no React, no DOM
  hex.ts             axial hex math
  types.ts           all game data types
  content.ts         Abilities, Passives, built-in Loadouts (add new content here)
  loadout.ts         Circles, stat step costs, validation, building a Mage
  board.ts           seeded, point-symmetric arena generation
  threat.ts          Threat Area geometry for every shape
  crystals.ts        Mana Crystal lifecycle and placement
  engine.ts          createGame / applyAction / replay, phases, resolution
  ai.ts              greedy bot: dodges, reacts, scores attacks by how hard they are to dodge
  storage.ts, rng.ts
src/net/spectate.ts  spectating protocol + pluggable transport (BroadcastChannel today)
src/audio/           original music as note data (score.ts) + a tiny Web Audio synth/sequencer (synth.ts)
src/ui/              React: board, panels, match, loadout builder, spectate & replays
```

**The one key idea:** the engine is a pure, deterministic reducer: `(state, action) → state`. In-match randomness, such as where crystals land, comes from a seeded stream kept in the state. A match is therefore just its config plus its list of actions, which gives replays, live spectating and (later) online play almost for free.

**Adding content:**
- **Abilities and Passives:** add entries to `content.ts`.
- **A new effect:** extend `AbilityEffect` in `types.ts`, then handle it in `engine.ts` and in `ai.ts`'s `scoreCast`.
- **A new Threat Area shape:** add it to `Shape`, then implement it in `threat.ts`, which provides its geometry and aimable hexes.

## Packaging for Windows (planned)

The Vite build already uses relative asset paths (`base: './'`), so `dist/` loads from `file://`. There are two good options:

- **Electron + electron-builder:** add `electron/main.ts` that opens `dist/index.html`, then `electron-builder --win nsis` → `.exe` installer. This is the most mature option and easy to wire up with Steamworks later.
- **Tauri:** much smaller binaries (~10 MB) and a Rust backend. It needs the Rust toolchain on the build machine.

When packaging, swap `storage.ts` to a file-backed store, and swap the spectate transport for a WebSocket so spectators can watch from other machines.

## Roadmap ideas

- Online PvP over peer-to-peer WebRTC: both clients run `engine.ts` and exchange actions (secret bids already use commit-and-reveal for this). For now, play is single-player against the AI, and you are always P1.
- Squads (2–3 units per side), push/pull effects, destructible terrain
- Smarter AI (lookahead search over `applyAction`)
- Sound, sprite art, camera shake on crits
