import type { Stat } from "#/solver/types";



export const convertStat = (stat: Stat & { name: "Parry" | "Dodge" | "Block" | "Defense" | "Resilience" | "Armor" | "SpellCrit" | "SpellHit" | "SpellHaste"}) => {
	switch (stat.name) {
		case "Parry":
            return stat.value / 23.6538;
		case "Dodge":
            return stat.value / 18.9231
		case "Block":
            return stat.value / 7.8846;
        case "Defense":
            return Math.floor(stat.value / 2.3654)
        case "Resilience":
            return Math.floor(stat.value / 39.4231)
        case "Armor":
            // TODO this differs depending on the level of attacker (ex less armor against a 73)
            return stat.value / (stat.value + 10557.5)
        case "SpellCrit":
            return stat.value/22.1
        case "SpellHit":
            return stat.value/12.6
        case "SpellHaste":
            return stat.value/15.8
	}
};