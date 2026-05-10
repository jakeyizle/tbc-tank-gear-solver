# Things that need doing

## Implement Talents & Abilities in UI
Need to select talents and abilities in the UI and pass to the solver

## Better Stat Display
Breakdown by items, talents, base stats?

## Tests
duh

# Problems that need fixing

## Stat calculation code needs cleanup. 
Ratings and Percentages need to be distinguished. StatConverter mixes Rating/Percentage conversion and Stat->Stat conversion (ex: Agility -> Dodge).
- There's Dodge Rating <-> Dodge Chance
- Then there's Stamina -> Health, Agility -> Dodge, Agility -> Armor, etc.
Stat calculation is very verbose and just overall messy, can be more concise and readable.
The objective/optimization stat entry uses the same type as Stats even though it is different.

## Base Stats aren't totally correct
Health/Mana for class/race combo aren't correct in data

## Missing Items/Enchants/Gems
At the very least some enchants are missing (ex: block rating to shield)

## solverconfig context is too similar
There's 2 very similarly named solver config contexts, should be more obviously separated