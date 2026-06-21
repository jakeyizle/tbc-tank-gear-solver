# Context

In World of Warcraft: The Burning Crusade, tanks need strike a balance in their gear between survivability and threat.
The intention of this app is to allow players to input their gear, set some customization options (such as talents buffs), set which stats they want to optimize for, set what constraints they have, and then have their optimal set of items, enchants, and gems selected for them.

This is done through a Linear Programming library. Each item is taken along with valid enchants and gems - then every unique variation of each item, enchants, and gems is generated and then opimized using the LP library.

Multiple "configurations" can be solved for in one go. When there are multiple configurations, items that are selected become "locked" and in future configurations they will not be "varied". Example - Weapon X with Enchant Y and Gem Z is selected in Config 1. When items are generated for Config 2, Weapon X will only be considered with Enchant Y and Gem Z, not with any other Enchants or Gems.

# Inputs

- Items - The pieces of gear a player currently has. These can optionally include current enchants and gems.
- Lock Enchants and Gems - If enabled, items that are already enchanted or have gems will be "locked", so alternate enchants/gems will not be considered for those items. Items that are unenchanted and ungemmed will still have enchants and gems varied for them.

- Class - determine what abilities are used and which talents are available. A class's abilities are always the same, while talents are configurable. Only Paladin is currently supported.
- Race - along with class, determines base stats. Only Human is currently supported.
- Talents - Available based on class. Talents have different effects, and are configurable.

- Configurations - A "configuration" represents a set of Constraints, Stats to Optimize, Buffs, and Elixirs/Flasks. Multiple configurations can be solved for at once. Configurations are solved in order - the first config is solved, then the next, etc, until the last. 

- Constraint - Currently 2 constraints are supported, crit reduction and Uncrushable.
- Optimize Stats - any number of stats can be selected, and a weight given to each stat.

- Buffs - Buffs have some effect that must be taken into account for calculations. Some buffs add a flat value to certain stats, while others offer a multiplicative increase.
- Elixirs/Flasks - Not implemented.

# Outputs

Each configuration gets a set of gear, with each piece having enchants and gems (if applicable). A summary of character statistics while wearing a set of gear is provided.