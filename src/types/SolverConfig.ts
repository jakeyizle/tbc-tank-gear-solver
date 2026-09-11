import { CONSUMABLES } from "#/data/consumables";
import { SIM_CALIBRATION_STAT_NAMES } from "#/sim/statTranslation";
import type {
	LPItem,
	ResistanceFloor,
	Stat,
	StatName,
} from "#/solver/types";
import type { CharacterStatsSnapshot } from "#/types/CharacterStats";
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
	// 'hardAvoidance' = ignore optimizeStats and maximize Dodge% + Parry% + Miss% (excludes
	// Block); also force-disables the Avoidance floor constraint, since holding hard avoidance to
	// a Block-inclusive floor while maximizing it is redundant - see solveConfigForHardAvoidance.
	// 'tps'/'dtps'/'tmi' = sim-calibrated objective (Protection Paladin only for now) - see
	// docs/plans/sim-backed-objectives.md - purely maximizing (tps) or minimizing (dtps/tmi) that
	// one metric, no blend with anything else. 'balanced' = a weighted blend of tps against
	// whichever metric `survivabilityMetric` names, per `balance` - see
	// calibrateWeights.ts's metricRatiosForBalance. Like 'ehp', all of these ignore
	// optimizeStats; the solver recalibrates its own weight vector via a real combat sim instead.
	objectiveMode:
		| "stats"
		| "ehp"
		| "hardAvoidance"
		| "tps"
		| "dtps"
		| "tmi"
		| "balanced";
	// A single 0 (pure Survivability) .. 1 (pure Threat) dial for 'balanced' mode - see
	// calibrateWeights.ts's metricRatiosForBalance. Unused (but always present) in other modes.
	balance: number;
	// Which metric backs the "Survivability" end of `balance`. Unused (but always present) in
	// other modes.
	survivabilityMetric: "tmi" | "dtps";
	// Which stats get a +/- perturbation sim during calibration for 'tps'/'dtps'/'tmi'/'balanced'
	// modes - see solveSimMetric.ts's resolveCalibrationStats and statTranslation.ts's
	// SIM_CALIBRATION_STAT_NAMES (the full default list this is a subset of). Unused (but always
	// present) in 'stats'/'ehp' mode.
	enabledCalibrationStats: StatName[];
	resistanceFloors: ResistanceFloor[];
	enabledConsumableIds: string[];
}

export interface SolveResult {
	id: string;
	name: string;
	items: LPItem[];
	baseConfig: BaseConfig;
	solverConfig: SolverConfiguration;
	// Absolute TPS/DTPS/TMI-5 for this result's gear - only set for a "tps"/"dtps"/"tmi"/"balanced" solve.
	// All three are always included here, regardless of which one was the actual objective.
	simMetrics?: SimMetricsSnapshot;
	// Pure (unblended) per-metric stat weight breakdowns - one vector each for TPS, DTPS, and
	// TMI-5, all always populated together for a "tps"/"dtps"/"tmi"/"balanced" solve regardless of
	// which one (or blend) actually drove the objective, since the sim always computes all three
	// from the same calibration batch - see solveSimMetric.ts's finalPerMetricStatWeights.
	perMetricStatWeights?: Record<"tps" | "dtps" | "tmi", Stat[]>;
	// Per-stat uncertainty on perMetricStatWeights (see solveSimMetric.ts's
	// finalPerMetricStatWeightStdevs) - only set for a "tps"/"dtps"/"tmi"/"balanced" solve.
	perMetricStatWeightStdevs?: Record<"tps" | "dtps" | "tmi", Stat[]>;
	// Authoritative character stats for this gear, straight from the sim's own computeStats
	// (see src/sim/measureCharacterStats.ts). Set for every objective mode. Optional only
	// because results persisted before this existed do not carry it.
	characterStats?: CharacterStatsSnapshot;
	/**
	 * Non-stat physical damage reduction for this gear's character - today only Improved
	 * Righteous Fury (2% per rank). It is a multiplier, not a stat, so it appears in no
	 * computeStats vector and has to be carried alongside them.
	 *
	 * Captured at solve time from the LinearStatModel the solver actually used, rather than
	 * recomputed for display, so the panel's Effective HP can never disagree with the number
	 * the EHP objective optimized against. Optional only because results persisted before this
	 * existed do not carry it.
	 */
	physicalDamageTakenMultiplier?: number;
}

export interface BaseConfig {
	areEnchantsGemsLocked: boolean;
	excludeUniqueGems: boolean;
	excludeJewelcraftingItems: boolean;
	excludeEnchantingItems: boolean;
	// When true, every config solves independently from the same original item
	// pool instead of inheriting prior configs' picks - for comparing configs
	// on equal footing rather than building one gear set across all of them.
	independentConfigs: boolean;
	phase: number;
	raceId: string;
	classId: string;
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
		balance: 0.5,
		survivabilityMetric: "tmi",
		enabledCalibrationStats: [...SIM_CALIBRATION_STAT_NAMES],
		resistanceFloors: [],
		enabledConsumableIds: CONSUMABLES.map((consumable) => consumable.id),
	};
}
