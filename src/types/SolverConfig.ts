import type { LPItem, Stat } from "#/solver/types";

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
	id: string;
	name: string;
	items: LPItem[];
	baseAvoidance: number;
	baseUncritability: number;
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
