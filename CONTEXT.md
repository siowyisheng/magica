# Magica

A 1v1 duel between two mages on a hex grid. Each mage arrives with a Loadout bought from a budget of Loadout Points.

## Mages and loadouts

**Mage**:
A combatant in a duel. Every player controls exactly one.
_Avoid_: Champion, unit, hero

**Circle**:
A mage's rank, which sets their Loadout Point budget: First Circle has 30 points, Second Circle 20, Third Circle 10. Each Loadout has its own Circle, so mages of different Circles can face each other.
_Avoid_: Class, rank, tier, level

**Loadout**:
A Circle plus everything bought with that Circle's Loadout Points: a Weapon, stat increases, Abilities and Passives.
_Avoid_: Build, deck

**Loadout Points**:
The budget a Loadout is bought with.
_Avoid_: Points (alone), credits

**Ability**:
Anything a mage actively uses that was bought with Loadout Points: either a Spell or a Technique. A Loadout holds at most 8 Abilities, counting the Weapon's default Technique.
_Avoid_: Move (that means walking), skill, action

**Technique**:
A physical Ability, such as a weapon attack or a block. It costs AP but no Mana.
_Avoid_: Physical move, weapon skill

**Weapon**:
What a mage carries: exactly one per Loadout, and Unarmed counts. Each has a Loadout Point price, and may add Mana Regen, come with a default Technique, or allow weapon techniques to be bought. The Weapons are Unarmed (0 pts), Staff (3), Wand (2), Sword (3), Spear (3) and Bow (4).
_Avoid_: Item, equipment

**Weapon Technique**:
A Technique that needs a particular Weapon, and can't be used while Disarmed. A Weapon's **default Technique** (Slash, Thrust, Shoot) comes free with it, in the first Ability slot. Others (Strike for Unarmed, Staff Strike for Staff) are bought.
_Avoid_: Weapon skill

**Disarmed**:
A status that takes a mage's Weapon out of use: Weapon Techniques can't be used, and the Weapon's bonuses (such as Staff and Wand Mana Regen) are lost. A disarmed Wand mage can't cast Spells at all. Unarmed mages can't be Disarmed.

**Cooldown**:
An Ability with a Cooldown of N can't be used again until N of its mage's turns after the turn it was used, so a Cooldown of 2 means not on consecutive turns.

**Pinned**:
Unable to dodge in the next Reaction Phase: rooted, or about to have a Compelled turn. Attacks pending against a Pinned mage will hit unless they react with a Reaction Spell.
_Avoid_: Locked down, stuck

**Dodgeable**:
Describes an Attack the target could Move out of in their next Reaction Phase, given the Movement Points their 2 AP buy. Instant and homing Attacks, and anything aimed at a Pinned mage, are not dodgeable. Reaction Spells such as Blink don't count toward it.

**Compelled turn**:
A turn the mage doesn't control, caused by Sleep, Charm or Fear. The Reaction Phase is skipped (incoming Attacks land at once). A sleeper has no AP; a charmed mage spends all their AP and movement walking toward the other mage, a frightened one directly away. Damage wakes a sleeper at once, who then plays their turn as normal.

**Instant**:
An Attack that lands the moment it is cast, with no Reaction Phase, so it can't be dodged or reacted to. Soul Drain is Instant.

**Homing**:
An Attack aimed at the enemy mage rather than a hex, which lands on them wherever they have moved to by the Resolution, so no movement avoids it. Reactions that stop damage still work. Magic Missile is Homing.

**Multi**:
Marks a Fast Ability that can be used any number of times in a turn. Every other Fast Ability can be used once per turn, so that is left unsaid.

**Passive**:
An always-on effect bought with Loadout Points. It is not an Ability, because it is never used. There are none at the moment.
_Avoid_: Perk, trait, relic

## Rules variants

**Rules variant**:
An optional change to the standard rules, chosen per match on the Setup screen and kept with the match, so replays and spectators play by the same rules. Matches from before a variant existed play without it.
_Avoid_: Ruleset, mode (a Mode is You vs AI or Watch AI vs AI)

**Free Movement**:
A Rules variant meant to encourage moving: every Action Phase starts with Movement Points equal to the mage's Movespeed (less Slow, none while Rooted), without spending AP. They add to any left over from the Reaction Phase, to Haste, and to the walk of a Compelled turn; a sleeping mage gets none. Mages can still spend AP for more.

## Turn structure

**Round**:
One turn by each mage. A match lasts 12 Rounds, shown as "12 Rounds Left" counting down to "Final Round". If both mages are still standing after the last one, the higher percentage of Max HP remaining wins, and the mage who goes second wins a tie.
_Avoid_: Cycle

**Turn**:
One mage's Reaction Phase followed by their Action Phase. The defender's pending Attacks resolve between the two phases.

**Reaction Phase**:
The first phase of a turn, where a mage responds to incoming attacks with Reactions. It happens only when an attack is pending against them; otherwise it is skipped. A mage can Move in it, but more slowly (see Movespeed).

**Action Phase**:
The main phase of a turn, where a mage moves, casts spells, attacks and absorbs mana. Reaction-only Abilities can't be used in it.

**Attack**:
An offensive Spell or Technique. It doesn't land immediately: it becomes pending, and resolves after the defender's next Reaction Phase. Pending attacks resolve in the order they were launched.
_Avoid_: Hit, strike (as the general term)

**Launch**:
Committing an Attack in the Action Phase. It fixes the Attack's Threat Area and makes it pending. Casting an instant (non-Attack) Spell takes effect at once and is not a Launch.
_Avoid_: Fire, cast (for an Attack)

**Resolution**:
The moment after a defender's Reaction Phase when their pending Attacks land, in the order they were launched. The Attacks that land together are one Resolution.
_Avoid_: Impact, landing

**Threat Area**:
The hexes a pending Attack will hit, fixed when the Attack is launched. At resolution it hits every mage standing in it, the caster included. It is shown to both players until it resolves.

**Hit**:
A mage standing in an Attack's Threat Area at Resolution, whether or not the Attack takes any HP off them (a status-only Attack still hits). A Hit that takes HP off a mage is a damaging Hit.
_Avoid_: Attack (a Hit is what an Attack does to a mage)

**Move**:
Walking from hex to hex by spending Movement Points, in either phase. Walking in the Reaction Phase is a dodge, but it is still a Move.
_Avoid_: Using "move" for an Ability

## Threat Area shapes

**Line**:
A straight run of hexes from next to the caster out to a range, stopped by the first Rock.
_Avoid_: Ray, beam (as the shape name)

**Explosive Line**:
A projectile that flies toward a chosen hex and ends in a Burst. The Rock stops it on the hex before. If the enemy is in its way it bursts on them, but the Threat Area also includes the Burst at the end of its flight, because the enemy may dodge in their Reaction Phase and the projectile then flies on. The hexes it flew over are part of the Threat Area.

**Single Hex**:
One chosen hex, not blocked by Rock. Some Single Hex Attacks need line of sight: a Rock between the caster and the hex blocks the aim.

**Cone**:
A 60° wedge spreading out from the caster to a range.

**Melee Arc**:
The 3 hexes in front of the caster: the hex it faces plus the two neighbours of that hex that also touch the caster.

**Fan**:
Three Lines fired at once: the aimed direction plus the two directions 30° either side of it. A Cone with gaps.
_Avoid_: Trident, spread

**Wall**:
A path of 5 connected hexes that the caster draws freely, starting within range and avoiding Rock. Like every Threat Area, it hits once and is gone.
_Avoid_: Barrier

**Burst**:
Every hex within a radius of 1 to 4 around a chosen hex, not blocked by Rock. Radius 1 covers 7 hexes; radius 4 covers 61.

**Self-Burst**:
A Burst centred on the caster that leaves out the caster's own hex.

## Board

**Rock**:
Impassable terrain that also stops Lines and line of sight. The two mages never start in line of sight of each other: every board has Rock across the line between the starting hexes. It is the only terrain besides open ground. About a third of the board is Rock, laid out as walls with doorways so the open ground forms rooms and corridors, all connected. Stone Pillar can create more mid-duel.
_Avoid_: Wall (a Wall is a Threat Area shape), obstacle

## Resources

**Action Point (AP)**:
The per-turn budget for doing things. Each mage has 2 per turn, shared by the Reaction Phase and the Action Phase. AP is spent on movement, casting non-Fast spells, attacking, absorbing mana and Reactions.

**Movement Points**:
The hexes a mage can still walk this turn. Spending 1 AP grants Movement Points equal to Movespeed. Under Free Movement, the Action Phase also starts with that many for free. Unspent points are lost at the end of the turn.

**Mana**:
The resource every Spell costs. A mage starts the duel with Mana equal to their Mana Regen, regains that much at the start of each of their later turns, and can hold at most their Max Mana.

**Mana Crystal**:
One of the two crystals that are always on the board: one Large, one Small. Each is in one of three states: Spawning, Almost Ready or Ready. A mage standing on a Ready crystal can Absorb Mana from it.

**Spawning**:
The state of a crystal that has just appeared after being absorbed. Its position is fixed and visible, but it can't be absorbed yet. It becomes Almost Ready on the next round.

**Almost Ready**:
The state between Spawning and Ready. The crystal can't be absorbed yet, and becomes Ready on the next round.

**Ready**:
The state in which a crystal can be absorbed. Absorbing it removes it, and the same size of crystal reappears elsewhere as Spawning.

**Absorb Mana**:
An action costing 1 AP that takes Mana from the Mana Crystal the mage is standing on. A Small crystal always gives 4 Mana and a Large crystal 6 (before Passives and the Max Mana cap).

## Stats

**HP**:
A mage's health. The base is 10, and the mage loses when it reaches 0. A Loadout buys HP 1 point at a time: +3 HP for each of the first 2 points, +2 for the next 3, then +1.

**Movespeed**:
The Movement Points a mage gets per AP spent on movement. The base is 3. In the Reaction Phase it is 3 lower, so a mage with Movespeed 3 can't Move there and one with 4 walks 1 hex per AP.

**Max Mana**:
The stat that caps how much Mana a mage can hold. The base is 10, and each Loadout Point adds 10.
_Avoid_: Magic, Mana (Mana is the resource, Max Mana is the stat)

**Mana Regen**:
The stat for Mana regained at the start of each of a mage's turns after their first, and also the Mana they start the duel with. The base is 2, and each step adds 1.
_Avoid_: Magic, regen on its own (that is HP regeneration)

## Spells

**Spell**:
An Ability that costs Mana.

**Contested Spell**:
A Spell settled by a secret Bid instead of a Threat Area. Casting it opens Bidding between the caster and the target, and its effect lands if the caster's Bid is at least the target's. Ties go to the caster, and both Bids are spent either way. Stasis and Doom are Contested Spells.
_Avoid_: Bid spell, opposed spell

**Max Bid**:
The most Mana a duellist may Bid on a particular Contested Spell (for example Stasis 4, Doom 5, Hold Person 7). Bidding more counts as 0 and forfeits all of that mage's Mana, like bidding more than they have.

**Bidding**:
The window of up to 7 seconds after a Contested Spell is cast, in which both duellists lock in their Bids without seeing each other's. It ends as soon as both have bid. Nothing else can happen during it, and the caster's turn timer stops. When the Bids are revealed, the timer resumes with 2 seconds added.

**Bid**:
The Mana a duellist secretly commits during Bidding: the caster's to make a Contested Spell land, the target's to Resist it. Bids are shown only after Bidding closes. Not bidding counts as 0, and so does a Bid of more Mana than the duellist has, which also forfeits all of their Mana.
_Avoid_: Stake, wager

**Resist**:
The outcome when the target's Bid is higher than the caster's, so a Contested Spell has no effect.
_Avoid_: Save, dodge (dodging is Moving out of a Threat Area)

**Reaction**:
An Ability a defender uses in their Reaction Phase: a Reaction Spell or a Reaction Technique. Like any Ability it costs 1 AP unless it is Fast, so reacting usually leaves less AP for the Action Phase. The defender can also Move out of an Attack.

**Fast Spell**:
A spell that costs no AP to cast. It still costs Mana.

**Reaction Spell**:
A defensive Spell cast during the Reaction Phase to mitigate incoming Attacks. Ward is the only one for now: it is Fast, costs Mana and no AP, and covers every Attack in that resolution.

**Reaction Technique**:
A Technique usable only in the Reaction Phase. It costs 1 AP and no Mana. Block is one.

**Range**:
How far an Ability reaches, in hexes. Some Lines and the Fireball have unlimited range: only the board edge, Rock or the enemy stops them, and no range is shown for them.

**Block**:
A Reaction Technique. It reduces the damage of the first incoming Attack, in launch order, by 4, whether or not that Attack would hit the mage.
