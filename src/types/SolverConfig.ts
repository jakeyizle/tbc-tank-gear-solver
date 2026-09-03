import { getBuffs } from "#/data/buffs";
import { CONSUMABLES } from "#/data/consumables";
import type {
	Buff,
	LPItem,
	ModifierSource,
	ResistanceFloor,
	Stat,
} from "#/solver/types";
import type {
	SimCalibrationProfile,
	SimMetricsSnapshot,
} from "./SimCalibrationProfile";
export interface SolverConfiguration {
	id: string;
	name: string;
	uncritabilitySetting: number;
	uncrushabilitySetting: number;
	optimizeStats: Stat[];
	// 'stats' = maximize the weighted sum in optimizeStats (default). 'ehp' = ignore
	// optimizeStats and let the solver directly maximize armor-mitigated Effective HP.
	// 'simWeighted' = sim-calibrated objective (Protection Paladin only for now) - see
	// docs/plans/sim-backed-objectives.md. Like 'ehp', this ignores optimizeStats; the solver
	// recalibrates its own weight vector via a real combat sim instead, blended per
	// simMetricWeights.
	objectiveMode: "stats" | "ehp" | "simWeighted";
	// Per-metric ratios for 'simWeighted' mode - e.g. {tps: 0, dtps: 0, tmi5: 1} reproduces
	// the old "Minimize TMI-5"-only behavior. Unused (but kept) in other modes.
	simMetricWeights: { tps: number; dtps: number; tmi5: number };
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
	// Absolute TPS/DTPS/TMI-5 for this result's gear - only set for a "simWeighted" solve.
	simMetrics?: SimMetricsSnapshot;
}

export interface BaseConfig {
	areEnchantsGemsLocked: boolean;
	excludeUniqueGems: boolean;
	// When true, every config solves independently from the same original item
	// pool instead of inheriting prior configs' picks - for comparing configs
	// on equal footing rather than building one gear set across all of them.
	independentConfigs: boolean;
	phase: number;
	raceId: string;
	classId: string;
	abilitySources: ModifierSource[];
	talentSources: ModifierSource[];
	// Global (not per-solver-config) sim calibration inputs for "Weighted Sim Metrics" - one
	// character fights one encounter, so this lives alongside race/class/phase rather than
	// being duplicated per config. See src/types/SimCalibrationProfile.ts.
	simCalibrationProfile: SimCalibrationProfile;
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
		simMetricWeights: { tps: 0, dtps: 0, tmi5: 1 },
		resistanceFloors: [],
		abilities: [],
		talents: [],
		buffs: getBuffs(),
		enabledConsumableIds: CONSUMABLES.map((consumable) => consumable.id),
	};
}
