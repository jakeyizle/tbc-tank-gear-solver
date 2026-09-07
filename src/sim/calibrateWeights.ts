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
import { perfTrace } from "#/helpers/perfTrace";
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
	type StatWeightRequestsData,
	StatWeightsRequest,
	type StatWeightsResult,
} from "./proto/api.js";
import { Stat as TbcStat } from "./proto/common.js";
import type { SimJob } from "./simJobQueue";
import { runSimJobQueue } from "./simJobQueue";
import {
	effectiveCalibrationSampleSize,
	STAT_NAME_TO_TBC_STAT,
} from "./statTranslation";
import {
	buildStatWeightJobs,
	computeStatWeightsFromJobResults,
	getPool,
	measureRaidSim,
} from "./statWeightsClient";
import type { GearPiece } from "./toTbcItemSpec";

export { resetSimEnvironment } from "./statWeightsClient";

export type SimMetric = "tps" | "dtps" | "tmi";

/** Cumulative progress across the whole calibration batch (every stat's +/- perturbation run). */
export interface CalibrationProgress {
	completedIterations: number;
	totalIterations: number;
	completedSims: number;
	totalSims: number;
}

/**
 * Blends one or more metrics' calibrated `epValues` into a single `Stat[]` weight vector, one
 * entry per `statsToWeigh` that has a translation entry (see statTranslation.ts).
 *
 * IMPORTANT: each metric's `epValue` is normalized against *its own* reference stat (Spell
 * Power for tps; Armor, hardcoded Go-side, for dtps/tmi/pdeath - see statweight.go's
 * calcEpResults) - two completely different physical quantities with very different intrinsic
 * magnitudes (real sim output: tmi/dtps epValues routinely run 5-40x larger than tps epValues
 * for the same stat). That makes different metrics' numbers comparable *in sign* (a bigger
 * epValue is always better - see below) but NOT in scale - summing a multi-metric `metricRatios`
 * directly here, unadjusted, does not distribute influence in proportion to the given ratios (a
 * caller wanting a meaningful multi-metric blend should normalize each metric's vector to a
 * common scale first - see blendNormalizedPerMetricWeights - rather than pass a multi-metric
 * `metricRatios` straight into this function). This function itself is still exactly right for
 * a single-metric ratio (e.g. `{tmi: 1}`), which is its only caller today (computePerMetricStatWeights).
 *
 * No sign flip is applied for a lower-is-better metric (dtps/tmi) - `epValue` is already a
 * "bigger is better" ratio by construction: it's the stat's raw slope against the metric,
 * divided by the *reference* stat's own raw slope (DTPSReferenceStat = Armor, a mitigation
 * stat whose slope against DTPS/TMI is itself negative). Two mitigation stats' slopes share
 * the same sign, so the ratio comes out positive before the Go side's `math.Abs()` even
 * applies - exactly the standard EP convention (a bigger EP number is always better),
 * matching what the solver's objective (always maximizing - see decomposedModel.ts's fixed
 * GLP_MAX) needs directly, with no re-signing. A metric ratio of 0 (or omitted) is skipped
 * entirely, and a metric with no `epValues` for a given stat (e.g. its reference-stat weight
 * came out to exactly 0) is skipped for that stat rather than treated as an error.
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
			blended += ratio * epValue;
		}
		stats.push({ name: statName, value: blended, type: "flat" });
	}
	return stats;
}

/**
 * Builds the metric ratio for the "balance Threat/Survivability" objective mode: a plain
 * weighted blend of TPS against whichever metric backs "Survivability" - `balance` (clamped to
 * [0,1]) is the TPS share, `1 - balance` goes to `survivabilityMetric`. Feeding this into
 * `calibrateWeights` (which blends via blendNormalizedPerMetricWeights, not blendMetricEpValues
 * directly - see that function's own doc comment on why a raw multi-metric blend doesn't
 * distribute influence proportionally) reproduces a pure `{tps: 1}` solve at balance=1 and a
 * pure `{[survivabilityMetric]: 1}` solve at balance=0, with a smooth blend in between - no
 * endpoint solves or LP constraint needed.
 */
export function metricRatiosForBalance(
	balance: number,
	survivabilityMetric: SimMetric,
): Partial<Record<SimMetric, number>> {
	const tps = Math.min(1, Math.max(0, balance));
	return { tps, [survivabilityMetric]: 1 - tps };
}

/**
 * Sibling to `blendMetricEpValues`: blends the same metrics' `epValuesStdev` into a per-stat
 * *standard error of the mean weight* for the blended weight vector, for the solve loop's
 * hysteresis check (see solveSimMetric.ts) and for display - without this, every round's weight
 * vector is treated as exact, so two items within noise of each other's true value keep trading
 * places forever instead of the loop recognizing it can't actually tell them apart.
 *
 * The Go sim's own `epValuesStdev` (statweight.go's aggregator.meanAndStdDev(), see utils.go) is
 * the raw *population* standard deviation of the individual per-iteration paired-difference
 * values - it does not shrink with more iterations on its own, and using it directly here would
 * overstate uncertainty by roughly sqrt(n) (e.g. ~60x at 4000 iterations) - see
 * effectiveCalibrationSampleSize's own doc comment. Dividing by sqrt(n) here, at the point the
 * raw value is first read, converts it into an actual standard error of the mean before it's
 * blended - every downstream consumer (averageStatStdevs' cross-replicate combination, the UI,
 * the significance test) then automatically gets a correctly-scaled value with no other code
 * changes needed.
 *
 * Each metric's (now-corrected) standard error is an independent Monte Carlo estimate (a
 * separate sim batch), so the blended ratios' variances are summed (not the values) before
 * taking the square root - standard propagation of uncertainty through a linear combination.
 * Sign is irrelevant here since variance is never negative.
 */
export function blendMetricEpValueStdevs(
	result: StatWeightsResult,
	statsToWeigh: StatName[],
	metricRatios: Partial<Record<SimMetric, number>>,
	iterations: number,
): Stat[] {
	const stats: Stat[] = [];
	for (const statName of statsToWeigh) {
		const tbcStatName = STAT_NAME_TO_TBC_STAT[statName];
		if (!tbcStatName) continue;
		const index = TbcStat[
			tbcStatName as keyof typeof TbcStat
		] as unknown as number;
		const sampleSize = effectiveCalibrationSampleSize(statName, iterations);

		let varianceSum = 0;
		for (const [metric, ratio] of Object.entries(metricRatios) as [
			SimMetric,
			number | undefined,
		][]) {
			if (!ratio) continue;
			const populationStdev = result[metric]?.epValuesStdev?.stats[index];
			if (populationStdev == null) continue;
			const standardError = populationStdev / Math.sqrt(sampleSize);
			varianceSum += (ratio * standardError) ** 2;
		}
		stats.push({ name: statName, value: Math.sqrt(varianceSum), type: "flat" });
	}
	return stats;
}

export interface CalibratedWeights {
	optimizeStats: Stat[];
	/** Per-stat standard error of the mean on `optimizeStats` - see blendMetricEpValueStdevs'
	 * own doc comment for why this is a standard error (sqrt(n)-corrected), not the sim's raw
	 * per-iteration population stdev. */
	stdevStats: Stat[];
	// The gear's absolute TPS/DTPS/TMI-5 at calibration time, read off this same batch's
	// unperturbed baseline sim (StatWeightsResult.baseline - see statweight.go's
	// computeStatWeights echoing swcr.BaseResult back onto the result) instead of a second,
	// separate sim call. Undefined only if the wasm build predates that field (e.g. a stale
	// lib.wasm.gz) - callers that need it should treat a missing value as "not yet available"
	// rather than throwing.
	baselineMetrics?: SimMetricsSnapshot;
	// Pure (unblended) per-metric weight breakdowns for all three metrics, derived from the exact
	// same calibration batches as optimizeStats/stdevStats - free, since the sim always computes
	// EP values for tps/dtps/tmi (and dps/hps/pdeath) for every perturbed stat, regardless of
	// which metric(s) metricRatios actually blends into optimizeStats. See
	// computePerMetricStatWeights. Optional so existing hand-built {optimizeStats, stdevStats}
	// test fixtures/mocks keep compiling.
	perMetricStatWeights?: Record<SimMetric, Stat[]>;
	/** Standard error of the mean on perMetricStatWeights - see stdevStats' own doc comment. */
	perMetricStatWeightStdevs?: Record<SimMetric, Stat[]>;
}

export interface CalibrationBatch {
	result: StatWeightsResult;
	// See CalibratedWeights.baselineMetrics - same value, exposed here too so a caller that needs
	// a second blend (e.g. a secondary sim-metric constraint - see solveSimMetric.ts) doesn't have
	// to re-derive it from `result.baseline` itself.
	baselineMetrics?: SimMetricsSnapshot;
}

/**
 * Builds one replicate's flat SimJob[] (see statWeightsClient.ts's buildStatWeightJobs) around
 * `gear`, tagging every job id with `replicateIndex` so runCalibrationBatches can concatenate
 * every replicate's jobs into one shared SimJobQueue and later route each result back to the
 * right replicate - see runCalibrationBatches' own doc comment for why replicates must share one
 * queue rather than each independently claiming the pool.
 */
async function buildReplicateJobBundle(
	gear: GearPiece[],
	db: TbcUiDatabase,
	statsToWeigh: StatName[],
	profile: SimCalibrationProfile,
	replicateIndex: number,
	seedOverride: string,
): Promise<{
	replicateIndex: number;
	jobs: SimJob[];
	reqData: StatWeightRequestsData;
}> {
	const stopBuildRequest = perfTrace.mark("buildStatWeightsRequest");
	const requestJson = buildStatWeightsRequest(
		gear,
		db,
		statsToWeigh,
		profile.calibration.iterations,
		profile,
		seedOverride,
	);
	stopBuildRequest();

	const stopEncode = perfTrace.mark("statWeightsRequestEncode");
	const request = StatWeightsRequest.fromJson(
		requestJson as unknown as Parameters<typeof StatWeightsRequest.fromJson>[0],
		{
			ignoreUnknownFields: true,
		},
	);
	const requestBytes = StatWeightsRequest.toBinary(request);
	stopEncode();

	const { jobs, reqData } = await buildStatWeightJobs(requestBytes);
	return {
		replicateIndex,
		reqData,
		jobs: jobs.map((job) => ({
			...job,
			id: `rep:${replicateIndex}:${job.id}`,
		})),
	};
}

/** Splits a `rep:${replicateIndex}:${originalJobId}` id back into its parts - originalJobId may
 * itself contain colons (e.g. "stat:3:low"), so only the first two segments are replicate
 * bookkeeping. */
function parseReplicateJobId(jobId: string): {
	replicateIndex: number;
	originalId: string;
} {
	const [, replicateIndexStr, ...rest] = jobId.split(":");
	return {
		replicateIndex: Number(replicateIndexStr),
		originalId: rest.join(":"),
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
 * TMI-5: averaging N independent Monte Carlo estimates shrinks the effective noise by sqrt(N).
 *
 * Every replicate's jobs (baseline + every stat's low/high perturbation - see
 * buildStatWeightJobs) are concatenated into ONE shared SimJobQueue dispatch, rather than each
 * replicate claiming the SimWorkerPool one after another (today's behavior pre-dating this
 * comment) or independently (which would be unsafe - see simJobQueue.ts's header comment on why
 * two concurrent run() calls on the same pool slot corrupts that worker's sim). This is what
 * actually lets `replicates > 1` run concurrently instead of multiplying wall-clock time
 * linearly: with everything sharing one queue, the pool's fixed worker count naturally spreads
 * across however many total jobs exist, from however many replicates.
 *
 * Building each replicate's request/jobs is cheap and side-effect-free (see
 * buildStatWeightJobs's own doc comment), so it's done for every replicate up front, before any
 * sim runs - this is also what lets `totalIterations`/`totalSims` be known exactly from the
 * start instead of growing as replicates are discovered.
 */
export async function runCalibrationBatches(
	gear: GearPiece[],
	db: TbcUiDatabase,
	statsToWeigh: StatName[],
	profile: SimCalibrationProfile,
	onProgress?: (progress: CalibrationProgress) => void,
): Promise<CalibrationBatch[]> {
	const stopRunCalibrationBatches = perfTrace.mark("runCalibrationBatches");
	const replicates = Math.max(1, profile.calibration.replicates ?? 1);
	const baseSeed = Date.now();

	// Snapshots taken before/after the concurrent Promise.all below, rather than threading a
	// single call's elapsed value through - replicates build their jobs concurrently, so several
	// of them may be recording into these same named spans simultaneously; a before/after delta
	// on the shared trace correctly isolates just this call's contribution regardless.
	const childSpanNames = [
		"buildStatWeightsRequest",
		"statWeightsRequestEncode",
		"statWeightRequestsWasmCall",
	];
	const childTotalsBefore = childSpanNames.map((name) =>
		perfTrace.totalFor(name),
	);

	const stopBuildBundles = perfTrace.mark("buildReplicateJobBundles");
	const bundles = await Promise.all(
		Array.from({ length: replicates }, (_, i) =>
			buildReplicateJobBundle(
				gear,
				db,
				statsToWeigh,
				profile,
				i,
				String(baseSeed + i),
			),
		),
	);
	const buildBundlesMs = stopBuildBundles();
	perfTrace.recordGap(
		"buildReplicateJobBundles",
		buildBundlesMs,
		childSpanNames.map(
			(name, i) => perfTrace.totalFor(name) - childTotalsBefore[i],
		),
	);

	const allJobs: SimJob[] = bundles.flatMap((bundle) => bundle.jobs);
	const jobsById = new Map(allJobs.map((job) => [job.id, job]));
	const totalIterations = allJobs.reduce(
		(sum, j) => sum + j.totalIterations,
		0,
	);
	const totalSims = allJobs.length;
	const resultsByReplicate = new Map<number, Map<string, RaidSimResult>>(
		bundles.map((bundle) => [bundle.replicateIndex, new Map()]),
	);

	// Mirrors statWeightsClient.ts's runStatWeightsAsync progress bookkeeping - see its own
	// comment on why a job's final iteration count only ever arrives bundled with its "done"
	// result, never as a trailing progress message of its own.
	const inFlightIterations = new Map<string, number>();
	let completedIterationsFromDoneJobs = 0;
	let simsDone = 0;
	const reportProgress = () => {
		if (!onProgress) return;
		const inFlightTotal = Array.from(inFlightIterations.values()).reduce(
			(a, b) => a + b,
			0,
		);
		onProgress({
			completedIterations: completedIterationsFromDoneJobs + inFlightTotal,
			totalIterations,
			completedSims: simsDone,
			totalSims,
		});
	};

	const pool = getPool(profile.calibration.workerCount);
	const stopDispatch = perfTrace.mark("simJobQueueDispatch");
	let dispatchMs = 0;
	try {
		await runSimJobQueue(pool, allJobs, {
			onJobProgress: (jobId, completed) => {
				inFlightIterations.set(jobId, completed);
				reportProgress();
			},
			onJobDone: (jobId, result) => {
				inFlightIterations.delete(jobId);
				completedIterationsFromDoneJobs +=
					jobsById.get(jobId)?.totalIterations ?? 0;
				simsDone++;
				const { replicateIndex, originalId } = parseReplicateJobId(jobId);
				const resultsMap = resultsByReplicate.get(replicateIndex);
				if (!resultsMap) {
					throw new Error(
						`SimJobQueue produced a result for unknown replicate ${replicateIndex} (job "${jobId}")`,
					);
				}
				resultsMap.set(originalId, result);
				reportProgress();
			},
		});
	} finally {
		dispatchMs = stopDispatch();
	}

	const stopCompute = perfTrace.mark("computeStatWeights");
	const batches = bundles.map((bundle): CalibrationBatch => {
		const resultsMap = resultsByReplicate.get(bundle.replicateIndex);
		if (!resultsMap) {
			throw new Error(
				`Missing results for replicate ${bundle.replicateIndex} - this indicates a bug in runCalibrationBatches, not a sim failure (runSimJobQueue would have rejected the whole call above if any job failed).`,
			);
		}
		const result = computeStatWeightsFromJobResults(bundle.reqData, resultsMap);
		return {
			result,
			baselineMetrics: result.baseline
				? extractSimMetrics(result.baseline)
				: undefined,
		};
	});
	const computeMs = stopCompute();

	const runCalibrationBatchesMs = stopRunCalibrationBatches();
	perfTrace.recordGap("runCalibrationBatches", runCalibrationBatchesMs, [
		buildBundlesMs,
		dispatchMs,
		computeMs,
	]);

	return batches;
}

const ALL_SIM_METRICS: SimMetric[] = ["tps", "dtps", "tmi"];

/**
 * Derives all three metrics' *pure* (unblended) weight breakdowns from calibration batches
 * already fetched for some other purpose - each metric's EP values are already present in every
 * batch's `result` regardless of what `metricRatios` a caller actually blended (see this file's
 * header comment and blendMetricEpValues' own doc comment on why the sim always computes
 * tps/dtps/tmi together), so this is pure post-processing with no extra sim cost. Lets a caller
 * (e.g. the Results UI) show "what would TPS/DTPS/TMI-5 weight this gear at" simultaneously, even
 * though only one of them (or a blend) actually drove the solve's objective.
 */
export function computePerMetricStatWeights(
	batches: CalibrationBatch[],
	statsToWeigh: StatName[],
	iterations: number,
): { weights: Record<SimMetric, Stat[]>; stdevs: Record<SimMetric, Stat[]> } {
	const weights = {} as Record<SimMetric, Stat[]>;
	const stdevs = {} as Record<SimMetric, Stat[]>;
	for (const metric of ALL_SIM_METRICS) {
		const ratio: Partial<Record<SimMetric, number>> = { [metric]: 1 };
		weights[metric] = averageStats(
			batches.map((b) => blendMetricEpValues(b.result, statsToWeigh, ratio)),
		);
		stdevs[metric] = averageStatStdevs(
			batches.map((b) =>
				blendMetricEpValueStdevs(b.result, statsToWeigh, ratio, iterations),
			),
		);
	}
	return { weights, stdevs };
}

/**
 * Rescales `stats` to a unit L2 norm (`sqrt(sum of value^2)` over the given stats), returning
 * both the normalized vector and the `scale` divided out - callers that also need to rescale a
 * *dependent* vector (e.g. this stat's standard errors) by the exact same factor should reuse
 * `scale` rather than recomputing a norm of their own (see blendNormalizedPerMetricWeights).
 *
 * An all-zero input (e.g. a metric whose reference stat itself calibrated to exactly 0) returns
 * unchanged with `scale = 1` rather than dividing by zero - a no-op contribution to any blend
 * either way, since every value is already 0.
 */
export function normalizeStatVector(stats: Stat[]): {
	normalized: Stat[];
	scale: number;
} {
	const norm = Math.sqrt(stats.reduce((sum, stat) => sum + stat.value ** 2, 0));
	if (norm === 0) return { normalized: stats, scale: 1 };
	return {
		normalized: stats.map((stat) => ({ ...stat, value: stat.value / norm })),
		scale: norm,
	};
}

/**
 * Blends per-metric weight vectors (and their standard errors) that have already been rescaled
 * to a common unit-norm scale, fixing the "balance slider" bug where a raw `ratio * epValue` sum
 * (the old approach) let whichever metric happens to have larger-magnitude EP values dominate
 * regardless of the user's chosen ratio - see this session's investigation: TPS epValues
 * normalize against Spell Power's own slope, DTPS/TMI epValues normalize against Armor's, two
 * unrelated quantities whose magnitudes differ by 5-40x in practice, so a "50/50" raw blend was
 * really ~90%+ dominated by whichever metric had the larger natural scale.
 *
 * Normalizing each metric's vector to a common (unit L2 norm) scale before applying the ratio
 * means "50%" means "each metric's own internal stat-preference pattern gets equal total say" -
 * a stable, principled interpretation, though still not a literal shared real-world unit (there
 * isn't one between threat and a mitigation index).
 *
 * The same per-metric `scale` used to normalize that metric's weights is also divided into its
 * stdevs (scaling a random variable by a constant `k` scales its stdev by `k`, so dividing both
 * by the same `scale` keeps them consistent) - this is what keeps isSignificantImprovement's
 * delta/stdevDelta ratio meaningful after normalization, not just the point estimate.
 *
 * For a pure single-metric ratio (e.g. `{tps: 1}`, used by "Maximize TPS" etc., not just
 * "balanced"), this reduces to rescaling that one metric's vector by its own norm - a uniform
 * positive scalar multiply of the whole vector, which does not change which gear an LP
 * maximization picks (GLP_MAX is invariant to positive rescaling of its objective coefficients),
 * so single-metric-mode item selection is unaffected by this function existing.
 */
export function blendNormalizedPerMetricWeights(
	perMetricWeights: Record<SimMetric, Stat[]>,
	perMetricStdevs: Record<SimMetric, Stat[]>,
	metricRatios: Partial<Record<SimMetric, number>>,
): { weights: Stat[]; stdevs: Stat[] } {
	const weightSum = new Map<string, number>();
	const varianceSum = new Map<string, number>();
	const statOrder: StatName[] = [];

	for (const [metric, ratio] of Object.entries(metricRatios) as [
		SimMetric,
		number | undefined,
	][]) {
		if (!ratio) continue;
		const rawWeights = perMetricWeights[metric];
		const rawStdevs = perMetricStdevs[metric];
		if (!rawWeights) continue;
		const { normalized: normalizedWeights, scale } =
			normalizeStatVector(rawWeights);
		const stdevByName = new Map(
			(rawStdevs ?? []).map((s) => [s.name, s.value]),
		);

		for (const stat of normalizedWeights) {
			if (!weightSum.has(stat.name)) statOrder.push(stat.name);
			weightSum.set(
				stat.name,
				(weightSum.get(stat.name) ?? 0) + ratio * stat.value,
			);

			const normalizedStdev = (stdevByName.get(stat.name) ?? 0) / scale;
			const term = ratio * normalizedStdev;
			varianceSum.set(stat.name, (varianceSum.get(stat.name) ?? 0) + term ** 2);
		}
	}

	return {
		weights: statOrder.map((name) => ({
			name,
			value: weightSum.get(name) ?? 0,
			type: "flat" as const,
		})),
		stdevs: statOrder.map((name) => ({
			name,
			value: Math.sqrt(varianceSum.get(name) ?? 0),
			type: "flat" as const,
		})),
	};
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

	const { weights: perMetricStatWeights, stdevs: perMetricStatWeightStdevs } =
		computePerMetricStatWeights(
			batches,
			statsToWeigh,
			profile.calibration.iterations,
		);

	const { weights: optimizeStats, stdevs: stdevStats } =
		blendNormalizedPerMetricWeights(
			perMetricStatWeights,
			perMetricStatWeightStdevs,
			metricRatios,
		);

	return {
		optimizeStats,
		stdevStats,
		baselineMetrics: averageSimMetricsSnapshots(baselineMetricsList),
		perMetricStatWeights,
		perMetricStatWeightStdevs,
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
