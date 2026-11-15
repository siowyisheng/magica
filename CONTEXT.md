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
A Circle plus everything bought with that Circle's Loadout Points: stat increases, Abilities and Passives.
_Avoid_: Build, deck

**Loadout Points**:
The budget a Loadout is bought with.
_Avoid_: Points (alone), credits

**Ability**:
Anything a mage actively uses that was bought with Loadout Points: either a Spell or a Technique. A Loadout holds at most 8 Abilities.
_Avoid_: Move (that means walking), skill, action

**Technique**:
A physical Ability, such as a weapon attack. It costs AP but no Mana.
_Avoid_: Physical move, weapon skill

**Staff Strike**:
The free Technique in every Loadout. It is a Melee Arc attack and always takes one of the 8 Ability slots.

**Passive**:
An always-on effect bought with Loadout Points. It is not an Ability, because it is never used.
_Avoid_: Perk, trait, relic

## Turn structure

**Round**:
One turn by each mage. The round number starts at 1 and drives the game's escalation.
_Avoid_: Cycle

**Turn**:
One mage's Reaction Phase followed by their Action Phase. The defender's pending Attacks resolve between the two phases.

**Reaction Phase**:
The first phase of a turn, where a mage responds to incoming attacks. It happens only when an attack is pending against them; otherwise it is skipped.

**Action Phase**:
The main phase of a turn, where a mage moves, casts spells, attacks and absorbs mana.

**Attack**:
An offensive Spell or Technique. It doesn't land immediately: it becomes pending, and resolves after the defender's next Reaction Phase. Pending attacks resolve in the order they were launched.
_Avoid_: Hit, strike (as the general term)

**Threat Area**:
The hexes a pending Attack will hit, fixed when the Attack is launched. At resolution it hits every mage standing in it, the caster included. It is shown to both players until it resolves.

**Move**:
Walking from hex to hex by spending Movement Points.
_Avoid_: Using "move" for an Ability

## Threat Area shapes

**Line**:
A straight run of hexes from next to the caster out to a range, stopped by the first Rock.
_Avoid_: Ray, beam (as the shape name)

**Explosive Line**:
A Line that ends in a Burst, at its last hex or the hex before a Rock.

**Single Hex**:
One chosen hex, not blocked by Rock.

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
A Burst centred on the caster.

## Board

**Rock**:
Impassable terrain that also stops Lines. It is the only terrain besides open ground.
_Avoid_: Wall (a Wall is a Threat Area shape), obstacle

## Resources

**Action Point (AP)**:
The per-turn budget for doing things. Each mage has 2 per turn. AP is spent on movement, casting non-Fast spells, attacking and absorbing mana.

**Movement Points**:
The hexes a mage can still walk this turn. Spending 1 AP grants Movement Points equal to Movespeed, and unspent points carry from the Reaction Phase into the Action Phase.

**Mana**:
The resource every Spell costs. A mage starts the duel with Mana equal to their Magic, regains that much each turn, and can hold at most 10 × Magic.

**Mana Crystal**:
One of the two crystals that are always on the board: one Large, one Small. Each is in one of three states: Spawning, Almost Ready or Ready. A mage standing on a Ready crystal can Absorb Mana from it.

**Spawning**:
The state of a crystal that has just appeared after being absorbed. Its position is fixed and visible, but it can't be absorbed yet. It becomes Almost Ready on the next round.

**Almost Ready**:
The state between Spawning and Ready. The crystal can't be absorbed yet, and becomes Ready on the next round.

**Ready**:
The state in which a crystal can be absorbed. Absorbing it removes it, and the same size of crystal reappears elsewhere as Spawning.

**Absorb Mana**:
An action costing 1 AP that takes Mana from the Mana Crystal the mage is standing on. A Small crystal gives Mana equal to the round number; a Large crystal gives double that.

## Stats

**HP**:
A mage's health. The base is 10, and the mage loses when it reaches 0.

**Movespeed**:
The Movement Points a mage gets per AP spent on movement. The base is 3.

**Magic**:
The stat that sets a mage's Mana economy: starting Mana, Mana regained per turn, and the Mana cap. The base is 3.
_Avoid_: Power, Mana (Mana is the resource, Magic is the stat)

## Spells

**Spell**:
An Ability that costs Mana.

**Reaction**:
Anything a defender does in their Reaction Phase: Moving out of a Threat Area or casting a Reaction Spell. A reaction can't itself be reacted to.

**Fast Spell**:
A spell that costs no AP to cast. It still costs Mana.

**Reaction Spell**:
A defensive Spell cast during the Reaction Phase to mitigate, counter, deflect or block incoming Attacks. It costs no AP. Some target one specific pending Attack; others cover every Attack in that resolution.
