import { getBuffs } from "#/data/buffs";
import type { Buff, LPItem, ModifierSource, Stat } from "#/solver/types";
export interface SolverConfiguration {
	id: string;
	name: string;
	uncritabilitySetting: number;
	uncrushabilitySetting: number;
	optimizeStats: Stat[];
	abilities: ModifierSource[];
	talents: ModifierSource[];
	buffs: Buff[];
	consumables: {
		scrollOfAgilityV: boolean;
		elixir: string;
		flask: string;
	};
}

export interface SolveResult {
	id: string;
	name: string;
	items: LPItem[];
	baseConfig: BaseConfig;
	solverConfig: SolverConfiguration;
}

export interface BaseConfig {
	areEnchantsGemsLocked: boolean;
	raceId: string;
	classId: string;
	abilitySources: ModifierSource[];
	talentSources: ModifierSource[];
}

export function createEmptyConfig(id: string, name: string): SolverConfiguration {
	return {
		id,
		name,
		uncritabilitySetting: 2,
		uncrushabilitySetting: 1,
		optimizeStats: [
			{ name: "Health", value: 0.1, type: "flat" },
			{ name: "Agility", value: 0.387, type: "flat" },
			{ name: "Strength", value: 0.237, type: "flat" },
			{ name: "Intellect", value: 0.017, type: "flat" },
			{ name: "Armor", value: 0.044, type: "flat" },
			{ name: "Defense", value: 0.448, type: "flat" },
			{ name: "Dodge", value: 0.219, type: "flat" },
			{ name: "Parry", value: 0.215, type: "flat" },
			{ name: "Block", value: 0.403, type: "flat" },
			{ name: "BlockValue", value: 0.324, type: "flat" },
			{ name: "MeleeHit", value: 0.524, type: "flat" },
			{ name: "Expertise", value: 1.155, type: "flat" },
			{ name: "SpellHit", value: 0.713, type: "flat" },
			{ name: "SpellCrit", value: 0.057, type: "flat" },
			{ name: "SpellPower", value: 0.775, type: "flat" },

		],
		abilities: [],
		talents: [],
		buffs: getBuffs(),
		consumables: {
			scrollOfAgilityV: false,
			elixir: "",
			flask: "",
		},
	};
}
