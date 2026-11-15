# Remove archetypes and relics in favour of point-bought Loadouts

Mages used to be built from a fixed archetype (base stats plus ability and relic slot counts) and stat-modifying relics. We replaced both with one Loadout Point budget set by the mage's Circle, which buys stats, Abilities and Passives, with a fixed cap of 8 Spells. We deleted the archetype and relic code rather than leaving it switched off behind a flag. A dormant system would have complicated every new rule in the turn engine. If archetypes come back, the old implementation is in git history before this change.
