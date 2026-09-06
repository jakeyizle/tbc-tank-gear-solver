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
import type {
	SimCalibrationProfile,
	SimMetricsSnapshot,
} from "#/types/SimCalibrationProfile";
import {
	buildStatWeightsRequest,
	type TbcUiDatabase,
} from "./buildStatWeightsRequest";
import {
	type RaidSimResult,
	StatWeightsRequest,
	type StatWeightsResult,
} from "./proto/api.js";
import { Stat as TbcStat } from "./proto/common.js";
import {
	LOWER_IS_BETTER_METRICS,
	STAT_NAME_TO_TBC_STAT,
} from "./statTranslation";
import { measureRaidSim, runStatWeightsAsync } from "./statWeightsClient";
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
 * Sibling to `blendMetricEpValues`: blends the same metrics' `epValuesStdev` into a per-stat
 * uncertainty for the blended weight vector, for the solve loop's hysteresis check (see
 * solveSimMetric.ts) - without this, every round's weight vector is treated as exact, so two
 * items within noise of each other's true value keep trading places forever instead of the loop
 * recognizing it can't actually tell them apart.
 *
 * Each metric's stdev is an independent Monte Carlo estimate (a separate sim batch), so the
 * blended ratios' variances are summed (not the values) before taking the square root - standard
 * propagation of uncertainty through a linear combination. The sign a metric's value would carry
 * (`LOWER_IS_BETTER_METRICS`) is irrelevant here since variance is never negative.
 */
export function blendMetricEpValueStdevs(
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

		let varianceSum = 0;
		for (const [metric, ratio] of Object.entries(metricRatios) as [
			SimMetric,
			number | undefined,
		][]) {
			if (!ratio) continue;
			const stdev = result[metric]?.epValuesStdev?.stats[index];
			if (stdev == null) continue;
			varianceSum += (ratio * stdev) ** 2;
		}
		stats.push({ name: statName, value: Math.sqrt(varianceSum), type: "flat" });
	}
	return stats;
}

export interface CalibratedWeights {
	optimizeStats: Stat[];
	/** Per-stat uncertainty on `optimizeStats` - see blendMetricEpValueStdevs. */
	stdevStats: Stat[];
	// The gear's absolute TPS/DTPS/TMI-5 at calibration time, read off this same batch's
	// unperturbed baseline sim (StatWeightsResult.baseline - see statweight.go's
	// computeStatWeights echoing swcr.BaseResult back onto the result) instead of a second,
	// separate sim call. Undefined only if the wasm build predates that field (e.g. a stale
	// lib.wasm.gz) - callers that need it should treat a missing value as "not yet available"
	// rather than throwing.
	baselineMetrics?: SimMetricsSnapshot;
}

export interface CalibrationBatch {
	result: StatWeightsResult;
	// See CalibratedWeights.baselineMetrics - same value, exposed here too so a caller that needs
	// a second blend (e.g. a secondary sim-metric constraint - see solveSimMetric.ts) doesn't have
	// to re-derive it from `result.baseline` itself.
	baselineMetrics?: SimMetricsSnapshot;
}

/**
 * Runs one real sim calibration batch around `gear` - the expensive, only-do-this-once-per-round
 * part of calibrateWeights() below, pulled out so a caller that needs more than one blend of the
 * same batch (e.g. an objective vector AND an independent secondary-constraint vector) can call
 * `blendMetricEpValues`/`blendMetricEpValueStdevs` against the same `result` twice, at no extra
 * sim cost, instead of running this twice.
 */
export async function runCalibrationBatch(
	gear: GearPiece[],
	db: TbcUiDatabase,
	statsToWeigh: StatName[],
	profile: SimCalibrationProfile,
	onProgress?: (progress: CalibrationProgress) => void,
	// See runCalibrationBatches - only ever passed by that loop, to guarantee each replicate gets
	// an independent seed rather than relying on enough wall-clock time elapsing between calls.
	seedOverride?: string,
): Promise<CalibrationBatch> {
	const requestJson = buildStatWeightsRequest(
		gear,
		db,
		statsToWeigh,
		profile.calibration.iterations,
		profile,
		seedOverride,
	);
	const request = StatWeightsRequest.fromJson(
		requestJson as unknown as Parameters<typeof StatWeightsRequest.fromJson>[0],
		{
			ignoreUnknownFields: true,
		},
	);
	const requestBytes = StatWeightsRequest.toBinary(request);

	const result = await runStatWeightsAsync(
		requestBytes,
		(metrics) => {
			onProgress?.({
				completedIterations: metrics.completedIterations,
				totalIterations: metrics.totalIterations,
				completedSims: metrics.completedSims,
				totalSims: metrics.totalSims,
			});
		},
		profile.calibration.workerCount,
	);

	return {
		result,
		baselineMetrics: result.baseline
			? extractSimMetrics(result.baseline)
			: undefined,
	};
}

/**
 * Averages one Stat[] per stat name across replicate batches (see runCalibrationBatches) - each
 * batch is an independent Monte Carlo estimate of the same underlying weight vector, so a plain
 * mean is the standard way to combine N of them into one lower-variance estimate. Assumes every
 * list carries the same set of stat names (true for callers here, which always blend the same
 * `statsToWeigh` against every batch).
 */
export function averageStats(statLists: Stat[][]): Stat[] {
	const byName = new Map<
		string,
		{ type: Stat["type"]; sum: number; count: number }
	>();
	for (const stats of statLists) {
		for (const stat of stats) {
			const entry = byName.get(stat.name) ?? {
				type: stat.type,
				sum: 0,
				count: 0,
			};
			entry.sum += stat.value;
			entry.count += 1;
			byName.set(stat.name, entry);
		}
	}
	return Array.from(byName.entries()).map(([name, { type, sum, count }]) => ({
		name: name as Stat["name"],
		value: sum / count,
		type,
	}));
}

/**
 * Combines N replicates' independent stdev estimates for the same stat into the stdev of their
 * *average* - not another plain mean. Each replicate's stdev already estimates the same
 * underlying Monte Carlo noise, so averaging their point estimates shrinks that noise by
 * sqrt(N); the combined stdev reflects that: mean(stdevs) / sqrt(N), not mean(stdevs) itself
 * (which would understate how much averaging actually helped).
 */
export function averageStatStdevs(stdevLists: Stat[][]): Stat[] {
	const averaged = averageStats(stdevLists);
	const n = stdevLists.length || 1;
	return averaged.map((stat) => ({
		...stat,
		value: stat.value / Math.sqrt(n),
	}));
}

/** Plain per-field mean across replicate batches' baseline metrics - see averageStats. */
export function averageSimMetricsSnapshots(
	snapshots: SimMetricsSnapshot[],
): SimMetricsSnapshot | undefined {
	if (snapshots.length === 0) return undefined;
	return {
		tps: snapshots.reduce((sum, s) => sum + s.tps, 0) / snapshots.length,
		dtps: snapshots.reduce((sum, s) => sum + s.dtps, 0) / snapshots.length,
		tmi5: snapshots.reduce((sum, s) => sum + s.tmi5, 0) / snapshots.length,
	};
}

/**
 * Runs `profile.calibration.replicates` (default 1 - today's behavior) independent calibration
 * batches around the same `gear` and returns all of them, for a caller to blend and average
 * (see calibrateWeights() below) - a brute-force variance reduction for noisy metrics like
 * TMI-5: averaging N independent Monte Carlo estimates shrinks the effective noise by sqrt(N),
 * at the cost of N times the sim time. Runs sequentially (not in parallel) so each batch's own
 * `Date.now()`-derived fallback seed would already differ - explicit per-replicate seeds
 * (below) just make that guaranteed rather than incidental.
 */
export async function runCalibrationBatches(
	gear: GearPiece[],
	db: TbcUiDatabase,
	statsToWeigh: StatName[],
	profile: SimCalibrationProfile,
	onProgress?: (progress: CalibrationProgress) => void,
): Promise<CalibrationBatch[]> {
	const replicates = Math.max(1, profile.calibration.replicates ?? 1);
	const progressPerReplicate: CalibrationProgress[] = new Array(
		replicates,
	).fill({
		completedIterations: 0,
		totalIterations: 0,
		completedSims: 0,
		totalSims: 0,
	});
	const reportAggregateProgress = () => {
		if (!onProgress) return;
		onProgress(
			progressPerReplicate.reduce(
				(acc, p) => ({
					completedIterations: acc.completedIterations + p.completedIterations,
					totalIterations: acc.totalIterations + p.totalIterations,
					completedSims: acc.completedSims + p.completedSims,
					totalSims: acc.totalSims + p.totalSims,
				}),
				{
					completedIterations: 0,
					totalIterations: 0,
					completedSims: 0,
					totalSims: 0,
				},
			),
		);
	};

	const batches: CalibrationBatch[] = [];
	const baseSeed = Date.now();
	for (let i = 0; i < replicates; i++) {
		const batch = await runCalibrationBatch(
			gear,
			db,
			statsToWeigh,
			profile,
			(progress) => {
				progressPerReplicate[i] = progress;
				reportAggregateProgress();
			},
			String(baseSeed + i),
		);
		batches.push(batch);
	}
	return batches;
}

/**
 * Calibrates and blends `metricRatios`' per-stat marginal weights (and their uncertainty) around
 * `gear` via the real sim, for every stat in `statsToWeigh` that has a translation entry.
 * Averages over `profile.calibration.replicates` independent batches (see
 * runCalibrationBatches) - a no-op average over a single batch when replicates is 1/unset.
 */
export async function calibrateWeights(
	gear: GearPiece[],
	db: TbcUiDatabase,
	statsToWeigh: StatName[],
	metricRatios: Partial<Record<SimMetric, number>>,
	profile: SimCalibrationProfile,
	onProgress?: (progress: CalibrationProgress) => void,
): Promise<CalibratedWeights> {
	const batches = await runCalibrationBatches(
		gear,
		db,
		statsToWeigh,
		profile,
		onProgress,
	);

	const baselineMetricsList = batches
		.map((b) => b.baselineMetrics)
		.filter((m): m is SimMetricsSnapshot => m != null);

	return {
		optimizeStats: averageStats(
			batches.map((b) =>
				blendMetricEpValues(b.result, statsToWeigh, metricRatios),
			),
		),
		stdevStats: averageStatStdevs(
			batches.map((b) =>
				blendMetricEpValueStdevs(b.result, statsToWeigh, metricRatios),
			),
		),
		baselineMetrics: averageSimMetricsSnapshots(baselineMetricsList),
	};
}

/**
 * Pulls the player's absolute TPS/DTPS/TMI-5 out of a raid sim result - a stat missing entirely
 * (e.g. an empty/errored result) reads as 0 rather than throwing, since this is only ever used
 * for display. Extracted as a pure function so it can be unit tested directly, same rationale
 * as blendMetricEpValues above.
 */
export function extractSimMetrics(result: RaidSimResult): SimMetricsSnapshot {
	const player = result.raidMetrics?.parties[0]?.players[0];
	return {
		tps: player?.threat?.avg ?? 0,
		dtps: player?.dtps?.avg ?? 0,
		tmi5: player?.tmi?.avg ?? 0,
	};
}

/**
 * Runs one real raid sim against `gear` and returns its absolute TPS/DTPS/TMI-5 values, for
 * display - `calibrateWeights`/`blendMetricEpValues` above only ever produce marginal per-stat
 * weights, never an absolute metric value (see statweight.go's calcEpResults). Intended to be
 * called once, after a sim-backed solve's gear has been finalized (see solveSimMetric.ts).
 */
export async function measureFinalSimMetrics(
	gear: GearPiece[],
	db: TbcUiDatabase,
	profile: SimCalibrationProfile,
	onProgress?: (progress: CalibrationProgress) => void,
): Promise<SimMetricsSnapshot> {
	// buildStatWeightRequests (Go side) unconditionally halves SimOptions.Iterations for the
	// +/- perturbation split before this measurement's single un-split base request even gets
	// pulled out - double the configured iterations here so the actual measurement sim runs at
	// the count the "Sim iterations" setting promises.
	const requestJson = buildStatWeightsRequest(
		gear,
		db,
		[],
		profile.calibration.iterations * 2,
		profile,
	);
	const request = StatWeightsRequest.fromJson(
		requestJson as unknown as Parameters<typeof StatWeightsRequest.fromJson>[0],
		{
			ignoreUnknownFields: true,
		},
	);
	const requestBytes = StatWeightsRequest.toBinary(request);

	// Single-threaded (not pool-split) - see measureRaidSim's own note on why - so there's no
	// incremental per-iteration progress to report, only a start/end signal.
	onProgress?.({
		completedIterations: 0,
		totalIterations: profile.calibration.iterations,
		completedSims: 0,
		totalSims: 1,
	});
	const result = await measureRaidSim(requestBytes);
	onProgress?.({
		completedIterations: profile.calibration.iterations,
		totalIterations: profile.calibration.iterations,
		completedSims: 1,
		totalSims: 1,
	});
	if (result.error) {
		throw new Error(`Sim measurement failed: ${result.error.message}`);
	}

	return extractSimMetrics(result);
}
