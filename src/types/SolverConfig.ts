import type { Stat } from "#/solver/types";

export interface SolverConfiguration {
	id: string;
	name: string;
	uncritabilitySetting: number;
	uncrushabilitySetting: number;
	optimizeStats: Stat[];
	buffs: {
		markOfTheWild: boolean;
		improvedMotw: boolean;
		blessingOfKings: boolean;
		graceOfAir: boolean;
	};
	consumables: {
		scrollOfAgilityV: boolean;
		elixir: string;
		flask: string;
	};
}

export interface SolveResult {
	configId: string;
	configName: string;
	items: any[];
	baseAvoidance: number;
	baseUncritability: number;
	timestamp: number;
}

export function createEmptyConfig(id: string, name: string): SolverConfiguration {
	return {
		id,
		name,
		uncritabilitySetting: 2,
		uncrushabilitySetting: 1,
		optimizeStats: [
			{ name: "Stamina", value: 1 },
			{ name: "SpellPower", value: 1 },
			{ name: "SpellHit", value: 1 },
		],
		buffs: {
			markOfTheWild: true,
			improvedMotw: true,
			blessingOfKings: true,
			graceOfAir: false,
		},
		consumables: {
			scrollOfAgilityV: false,
			elixir: "",
			flask: "",
		},
	};
}
