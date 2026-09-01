// Runs a real tbc-new sim calibration for a gear set and returns the result as this repo's
// `Stat[]` weight-vector shape - the same shape `optimizeStats` already accepts, so callers
// can feed it straight into the existing solver ("stats" objective mode) with no other
// solver changes. See docs/plans/sim-backed-objectives.md's Phase 3 design.
import type { Stat, StatName } from "#/solver/types";
import {
	buildStatWeightsRequest,
	type TbcUiDatabase,
} from "./buildStatWeightsRequest";
import { StatWeightsRequest } from "./proto/api.js";
import { Stat as TbcStat } from "./proto/common.js";
import {
	LOWER_IS_BETTER_METRICS,
	STAT_NAME_TO_TBC_STAT,
} from "./statTranslation";
import { runStatWeightsAsync } from "./statWeightsClient";
import type { GearPiece } from "./toTbcItemSpec";

export type SimMetric = "tps" | "dtps" | "tmi";

/** Cumulative progress across the whole calibration batch (every stat's +/- perturbation run). */
export interface CalibrationProgress {
	completedIterations: number;
	totalIterations: number;
	completedSims: number;
	totalSims: number;
}

/**
 * Calibrates `metric`'s per-stat marginal weights around `gear` via the real sim, for every
 * stat in `statsToWeigh` that has a translation entry (see statTranslation.ts). DTPS/TMI-5
 * weights are sign-flipped (metric is "lower is better", but the solver's objective is
 * always maximized - see decomposedModel.ts's fixed GLP_MAX), so a `Stat[]` returned here is
 * always ready to use as-is, no further sign handling needed by the caller.
 */
export async function calibrateWeights(
	gear: GearPiece[],
	db: TbcUiDatabase,
	statsToWeigh: StatName[],
	metric: SimMetric,
	iterations = 4000,
	onProgress?: (progress: CalibrationProgress) => void,
): Promise<Stat[]> {
	const requestJson = buildStatWeightsRequest(
		gear,
		db,
		statsToWeigh,
		iterations,
	);
	const request = StatWeightsRequest.fromJson(
		requestJson as unknown as Parameters<typeof StatWeightsRequest.fromJson>[0],
		{
			ignoreUnknownFields: true,
		},
	);
	const requestBytes = StatWeightsRequest.toBinary(request);

	const result = await runStatWeightsAsync(requestBytes, (metrics) => {
		onProgress?.({
			completedIterations: metrics.completedIterations,
			totalIterations: metrics.totalIterations,
			completedSims: metrics.completedSims,
			totalSims: metrics.totalSims,
		});
	});

	const metricWeights = result[metric]?.weights?.stats;
	if (!metricWeights) {
		throw new Error(`Calibration result had no weights for metric "${metric}"`);
	}

	const sign = LOWER_IS_BETTER_METRICS.has(metric) ? -1 : 1;

	const stats: Stat[] = [];
	for (const statName of statsToWeigh) {
		const tbcStatName = STAT_NAME_TO_TBC_STAT[statName];
		if (!tbcStatName) continue;
		const index = TbcStat[
			tbcStatName as keyof typeof TbcStat
		] as unknown as number;
		const rawWeight = metricWeights[index] ?? 0;
		stats.push({ name: statName, value: sign * rawWeight, type: "flat" });
	}
	return stats;
}
