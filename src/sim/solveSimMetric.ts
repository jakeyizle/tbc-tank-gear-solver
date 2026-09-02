// Iterative sim-calibrated solve: mirrors solveEHP.ts's Sequential-Linear-Programming shape
// (solve -> recompute weights around the result -> resolve until stable), but the per-round
// weight vector comes from a real tbc-new sim calibration instead of a closed-form
// derivative, since TPS/DTPS/TMI-5 have no closed form. See docs/plans/sim-backed-objectives.md's
// Phase 3 design and its note on why this needs re-linearizing each round: calibration is a
// local Taylor approximation around one gear set, and avoidance/block have real curvature.
import {
	type SolveOptions,
	type SolveProgress,
	solveConfig,
} from "#/solver/solveConfig";
import type { InputItem, LPItem, StatName } from "#/solver/types";
import type { TbcUiDatabase } from "./buildStatWeightsRequest";
import {
	type CalibrationProgress,
	calibrateWeights,
	type SimMetric,
} from "./calibrateWeights";
import { STAT_NAME_TO_TBC_STAT } from "./statTranslation";
import type { GearPiece } from "./toTbcItemSpec";

export const SIM_CALIBRATION_STATS = Object.keys(
	STAT_NAME_TO_TBC_STAT,
) as StatName[];

export type SimMetricSolvePhase = "calibrating" | "solving";

export interface SimMetricSolveProgress extends SolveProgress {
	simIteration: number;
	maxSimIterations: number;
	phase: SimMetricSolvePhase;
	// only meaningful when phase === "calibrating"
	calibrationCompletedIterations?: number;
	calibrationTotalIterations?: number;
}

export interface SimMetricSolveResult {
	items: LPItem[];
	iterations: number;
	converged: boolean;
}

/** Stable per-item identity for convergence comparison: same base item + enchant + gems. */
function itemKey(item: GearPiece): string {
	return `${item.id}|${item.enchant.id}|${[...item.gemSlots].sort().join(",")}`;
}

function sameItemSet(a: GearPiece[], b: GearPiece[]): boolean {
	if (a.length !== b.length) return false;
	const aKeys = a.map(itemKey).sort();
	const bKeys = b.map(itemKey).sort();
	return aKeys.every((key, i) => key === bKeys[i]);
}

/**
 * Solves for a weighted blend of `metricRatios`, recalibrating sim weights each round around
 * the previous round's result until the chosen item set stabilizes (or `maxIterations` is
 * hit). A single nonzero ratio (e.g. `{tmi: 1}`) reproduces a "pick one metric" solve exactly.
 *
 * @param baselineGear Starting point for round 1's calibration - see calibrateWeights.ts's
 * note that calibration is a local approximation around whatever gear it's centered on.
 * Callers without an obvious baseline (e.g. currently-equipped gear) can pass a reference
 * preset instead.
 */
export async function solveConfigForSimMetric(
	items: InputItem[],
	options: Omit<SolveOptions, "optimizeStats" | "objectiveMode">,
	baselineGear: GearPiece[],
	db: TbcUiDatabase,
	metricRatios: Partial<Record<SimMetric, number>>,
	onProgress?: (progress: SimMetricSolveProgress) => void,
): Promise<SimMetricSolveResult> {
	const MAX_ITERATIONS = 5;
	const CALIBRATION_ITERATIONS = 4000;

	let currentGear = baselineGear;
	let result: LPItem[] = [];
	let converged = false;
	let iteration = 0;

	for (; iteration < MAX_ITERATIONS; iteration++) {
		const optimizeStats = await calibrateWeights(
			currentGear,
			db,
			SIM_CALIBRATION_STATS,
			metricRatios,
			CALIBRATION_ITERATIONS,
			(calibrationProgress: CalibrationProgress) =>
				onProgress?.({
					iteration: 0,
					maxIterations: 1,
					simIteration: iteration,
					maxSimIterations: MAX_ITERATIONS,
					phase: "calibrating",
					calibrationCompletedIterations:
						calibrationProgress.completedIterations,
					calibrationTotalIterations: calibrationProgress.totalIterations,
				}),
		);

		result = await solveConfig(
			items,
			{ ...options, objectiveMode: "stats", optimizeStats },
			(progress) =>
				onProgress?.({
					...progress,
					simIteration: iteration,
					maxSimIterations: MAX_ITERATIONS,
					phase: "solving",
				}),
		);

		if (sameItemSet(currentGear, result)) {
			currentGear = result;
			converged = true;
			iteration++;
			break;
		}
		currentGear = result;
	}

	return { items: result, iterations: iteration, converged };
}
