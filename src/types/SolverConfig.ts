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
			{ name: "Stamina", value: 1, type: "flat" },
			{ name: "SpellPower", value: 1, type: "flat" },
			{ name: "SpellHit", value: 1, type: "flat" },
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
