import { getBuffs } from "#/data/buffs";
import { CONSUMABLES } from "#/data/consumables";
import type {
	Buff,
	LPItem,
	ModifierSource,
	ResistanceFloor,
	Stat,
} from "#/solver/types";
export interface SolverConfiguration {
	id: string;
	name: string;
	uncritabilitySetting: number;
	uncrushabilitySetting: number;
	optimizeStats: Stat[];
	// 'stats' = maximize the weighted sum in optimizeStats (default). 'ehp' = ignore
	// optimizeStats and let the solver directly maximize armor-mitigated Effective HP.
	objectiveMode: "stats" | "ehp";
	resistanceFloors: ResistanceFloor[];
	abilities: ModifierSource[];
	talents: ModifierSource[];
	buffs: Buff[];
	enabledConsumableIds: string[];
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
	excludeUniqueGems: boolean;
	phase: number;
	raceId: string;
	classId: string;
	abilitySources: ModifierSource[];
	talentSources: ModifierSource[];
}

export function createEmptyConfig(
	id: string,
	name: string,
): SolverConfiguration {
	return {
		id,
		name,
		uncritabilitySetting: 2,
		uncrushabilitySetting: 1,
		optimizeStats: [],
		objectiveMode: "stats",
		resistanceFloors: [],
		abilities: [],
		talents: [],
		buffs: getBuffs(),
		enabledConsumableIds: CONSUMABLES.map((consumable) => consumable.id),
	};
}
