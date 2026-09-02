// Runs a real tbc-new sim calibration for a gear set and returns the result as this repo's
// `Stat[]` weight-vector shape - the same shape `optimizeStats` already accepts, so callers
// can feed it straight into the existing solver ("stats" objective mode) with no other
// solver changes. See docs/plans/sim-backed-objectives.md's Phase 3 design.
//
// A single calibration batch computes tps/dtps/tmi together (see buildStatWeightsRequest.ts),
// so `metricRatios` lets a caller blend more than one of them into one weight vector at no
// extra sim cost - the "Weighted Sim Metrics" objective mode generalizes the old
// pick-exactly-one-metric modes this way (ratio {tmi: 1, others: 0} reproduces the old
// "Minimize TMI-5" mode exactly).
import type { Stat, StatName } from "#/solver/types";
import {
	buildStatWeightsRequest,
	type TbcUiDatabase,
} from "./buildStatWeightsRequest";
import { StatWeightsRequest, type StatWeightsResult } from "./proto/api.js";
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
 * Blends one or more metrics' calibrated `epValues` (per-stat weight already normalized
 * against a reference stat - see statweight.go's calcEpResults - so different metrics' numbers
 * are comparable before summing) into a single `Stat[]` weight vector, one entry per
 * `statsToWeigh` that has a translation entry (see statTranslation.ts).
 *
 * `epValues` are always non-negative (the Go side takes their absolute value), so
 * `LOWER_IS_BETTER_METRICS` still supplies the sign each metric should contribute with - same
 * convention as the solver's objective always maximizing (see decomposedModel.ts's fixed
 * GLP_MAX). A metric ratio of 0 (or omitted) is skipped entirely, and a metric with no
 * `epValues` for a given stat (e.g. its reference-stat weight came out to exactly 0) is
 * skipped for that stat rather than treated as an error.
 *
 * Extracted from calibrateWeights() as a pure function so the blending math can be unit
 * tested against a hand-built StatWeightsResult, without a real wasm/browser environment.
 */
export function blendMetricEpValues(
	result: StatWeightsResult,
	statsToWeigh: StatName[],
	metricRatios: Partial<Record<SimMetric, number>>,
): Stat[] {
	const stats: Stat[] = [];
	for (const statName of statsToWeigh) {
		const tbcStatName = STAT_NAME_TO_TBC_STAT[statName];
		if (!tbcStatName) continue;
		const index = TbcStat[
			tbcStatName as keyof typeof TbcStat
		] as unknown as number;

		let blended = 0;
		for (const [metric, ratio] of Object.entries(metricRatios) as [
			SimMetric,
			number | undefined,
		][]) {
			if (!ratio) continue;
			const epValue = result[metric]?.epValues?.stats[index];
			if (epValue == null) continue;
			const sign = LOWER_IS_BETTER_METRICS.has(metric) ? -1 : 1;
			blended += ratio * sign * epValue;
		}
		stats.push({ name: statName, value: blended, type: "flat" });
	}
	return stats;
}

/**
 * Calibrates and blends `metricRatios`' per-stat marginal weights around `gear` via the real
 * sim, for every stat in `statsToWeigh` that has a translation entry.
 */
export async function calibrateWeights(
	gear: GearPiece[],
	db: TbcUiDatabase,
	statsToWeigh: StatName[],
	metricRatios: Partial<Record<SimMetric, number>>,
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

	return blendMetricEpValues(result, statsToWeigh, metricRatios);
}
