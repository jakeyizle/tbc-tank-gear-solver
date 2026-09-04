import { getBuffs } from "#/data/buffs";
import { CONSUMABLES } from "#/data/consumables";
import type { BalanceEndpoint } from "#/sim/solveBalancedSimMetric";
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
	// recalibrates its own weight vector via a real combat sim instead, per simBalance.
	objectiveMode: "stats" | "ehp" | "simWeighted";
	// A single 0 (pure Survivability) .. 1 (pure Threat) dial for 'simWeighted' mode - see
	// solveBalancedSimMetric.ts. Replaced an earlier raw {tps,dtps,tmi5} ratio blend, which had
	// no principled interpretation (different metrics' calibrated weights live on incomparable
	// scales - see docs/plans/sim-backed-objectives.md's rejection of exactly that mechanism).
	// Unused (but kept) in other modes.
	simBalance: { balance: number };
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
	// The calibrated per-stat weight vector that produced this result - only set for a
	// "simWeighted" solve. See solveSimMetric.ts's finalStatWeights.
	statWeights?: Stat[];
	// Per-stat uncertainty on statWeights (see solveSimMetric.ts's finalStatWeightStdevs) - only
	// set for a "simWeighted" solve.
	statWeightStdevs?: Stat[];
	// The two real anchors the balance slider interpolates between - see
	// solveBalancedSimMetric.ts. Only set for a "simWeighted" solve, so the UI can show e.g.
	// "100% Threat: 5,200 TPS / 9.8 TMI-5" instead of a bare, uninterpretable balance value.
	simBalanceEndpoints?: { threat: BalanceEndpoint; survival: BalanceEndpoint };
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
		simBalance: { balance: 0.5 },
		resistanceFloors: [],
		abilities: [],
		talents: [],
		buffs: getBuffs(),
		enabledConsumableIds: CONSUMABLES.map((consumable) => consumable.id),
	};
}
