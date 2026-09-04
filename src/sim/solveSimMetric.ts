// Iterative sim-calibrated solve: mirrors solveEHP.ts's Sequential-Linear-Programming shape
// (solve -> recompute weights around the result -> resolve until stable), but the per-round
// weight vector comes from a real tbc-new sim calibration instead of a closed-form
// derivative, since TPS/DTPS/TMI-5 have no closed form. See docs/plans/sim-backed-objectives.md's
// Phase 3 design and its note on why this needs re-linearizing each round: calibration is a
// local Taylor approximation around one gear set, and avoidance/block have real curvature.
import { getItem, transformItem } from "#/solver/items";
import { SolverConfiguration } from "#/solver/SolverConfiguration";
import {
	type SolveOptions,
	type SolveProgress,
	solveConfig,
} from "#/solver/solveConfig";
import type { InputItem, LPItem, Stat, StatName } from "#/solver/types";
import type {
	SimCalibrationProfile,
	SimMetricsSnapshot,
} from "#/types/SimCalibrationProfile";
import type { TbcUiDatabase } from "./buildStatWeightsRequest";
import {
	blendMetricEpValueStdevs,
	blendMetricEpValues,
	type CalibratedWeights,
	type CalibrationProgress,
	calibrateWeights,
	measureFinalSimMetrics,
	runCalibrationBatch,
	type SimMetric,
} from "./calibrateWeights";
import {
	type ConsumablesOverride,
	splitGearAndConsumables,
} from "./resolveGearAndConsumables";
import {
	LOWER_IS_BETTER_METRICS,
	STAT_NAME_TO_TBC_STAT,
} from "./statTranslation";
import type { GearPiece } from "./toTbcItemSpec";

export const SIM_CALIBRATION_STATS = Object.keys(
	STAT_NAME_TO_TBC_STAT,
) as StatName[];

export type SimMetricSolvePhase = "calibrating" | "solving" | "measuring";

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
	simMetrics: SimMetricsSnapshot;
	// The calibrated per-stat weight vector that produced `items` - i.e. the accepted round's
	// optimizeStats, not necessarily the last round the loop ran (a converged loop's final round
	// is the *rejected* one - see the loop below).
	finalStatWeights: Stat[];
	// That same accepted round's per-stat uncertainty (calibrateWeights.ts's stdevStats) - kept
	// alongside finalStatWeights so the UI can show how much noise is in each weight, not just
	// the point estimate.
	finalStatWeightStdevs: Stat[];
	// Round 1's own calibrated weights (precomputed or freshly calibrated - see
	// solveConfigForSimMetric's precomputedRound1 param) - always populated, since round 0 always
	// runs. Deliberately separate from finalStatWeights: by round 2+, finalStatWeights reflects a
	// re-centered, pool-specific gear set, which would be the wrong thing to cache and reuse as a
	// future solve's round-1 baseline for a different item pool - see round1WeightsCache.ts.
	round1StatWeights: CalibratedWeights;
}

// Require a round's proposed gear to beat the previous round's by more than this many
// "stdev-equivalents" (see scoreGearSet/stdevStats below) before accepting it - otherwise the
// apparent improvement is indistinguishable from this round's own calibration noise. k=1 means
// "more likely better than not"; raise it for a more conservative (slower to switch) loop.
const HYSTERESIS_CONFIDENCE_K = 1;

/**
 * The actual accept/reject arithmetic, pulled out of isSignificantImprovement as a pure
 * function so it's unit-testable without a real item database: accept `delta` only if it clears
 * `k` "stdev-equivalents" of `stdevDelta`. Negative/zero delta never passes regardless of k
 * (a round's LP result can't score worse than the previous round's gear under its own weights -
 * see isSignificantImprovement - so a non-positive delta here would itself be a sign something
 * upstream is wrong, not just noise).
 */
export function exceedsHysteresisThreshold(
	delta: number,
	stdevDelta: number,
	k: number = HYSTERESIS_CONFIDENCE_K,
): boolean {
	return delta > k * Math.abs(stdevDelta);
}

/**
 * Scores a full gear set's `optimizeStats` objective under `config` - the same per-item
 * objectiveScore solveConfig's LP already computes, just re-derived for a `GearPiece[]` (plain
 * id/enchant/gemSlots) rather than the LP's own scored `LPItem[]` output, since `currentGear`
 * only ever carries the former. `getItem` returning undefined for an unknown id is treated as
 * contributing 0 rather than throwing - this is a hysteresis sanity check, not the source of
 * truth for which items exist.
 */
function scoreGearSet(gear: GearPiece[], config: SolverConfiguration): number {
	return gear.reduce((sum, piece) => {
		const item = getItem({
			id: piece.id,
			enchant: piece.enchant.id || undefined,
			gems: piece.gemSlots,
		});
		if (!item) return sum;
		return sum + transformItem(item, config).objectiveScore;
	}, 0);
}

/**
 * Whether this round's `proposed` gear is a statistically meaningful improvement over
 * `previous`, given this round's calibrated weights and their uncertainty - see this session's
 * measurement finding that a handful of near-tied items in a realistic pool can cause the loop
 * to oscillate indefinitely between them rather than converging, since each round's noisy
 * calibration can flip which one looks marginally ahead. Scoring both gear sets under a second
 * "stdevConfig" (whose weights are the calibration's own per-stat uncertainty, not the point
 * estimate) reuses the same linear objectiveScore machinery to get a noise band for the delta:
 * `objectiveScore` is a plain weighted sum of stat values (see scores.ts's
 * calculateObjectiveScore), so it's exactly linear in the weight vector - substituting stdevs in
 * place of point estimates and differencing the two gear sets' scores gives
 * Σ_stat stdev[stat] * (proposed.stat - previous.stat), a valid (if conservative - it's an L1,
 * not L2/RMS, combination) noise-band estimate for the delta, with no new stat-aggregation code
 * needed beyond what solveConfig already relies on.
 */
export function isSignificantImprovement(
	previous: GearPiece[],
	proposed: GearPiece[],
	proposedScore: number,
	optimizeStats: Stat[],
	stdevStats: Stat[],
	baseOptions: Omit<SolveOptions, "optimizeStats" | "objectiveMode">,
): boolean {
	const config = new SolverConfiguration({ ...baseOptions, optimizeStats });
	const stdevConfig = new SolverConfiguration({
		...baseOptions,
		optimizeStats: stdevStats,
	});

	const previousScore = scoreGearSet(previous, config);
	const delta = proposedScore - previousScore;

	const stdevDelta =
		scoreGearSet(proposed, stdevConfig) - scoreGearSet(previous, stdevConfig);

	return exceedsHysteresisThreshold(delta, stdevDelta);
}

/**
 * A hard floor/ceiling on a second sim metric, expressed in the *user-facing, real-world* sense
 * ("TMI-5 must not exceed X") - not yet linearized into an LP-facing SecondaryConstraint (see
 * SolverConfiguration.ts), since that requires re-deriving a bound every SLP round around
 * whatever gear that round is centered on (see deriveSecondaryConstraintBound below).
 */
export interface SecondaryMetricConstraintSpec {
	metric: SimMetric;
	targetAbsolute: number;
	kind: "floor" | "ceiling";
}

/** Pulls the one absolute value out of a SimMetricsSnapshot that corresponds to `metric` - the
 * public snapshot's field names ("tmi5") don't quite match SimMetric's own ("tmi"), same
 * wrinkle calibrateWeights.ts's own header comment already calls out for the ratio UI's
 * "tmi5"/"tmi" naming mismatch. */
export function absoluteValueForMetric(
	snapshot: SimMetricsSnapshot,
	metric: SimMetric,
): number {
	return metric === "tmi" ? snapshot.tmi5 : snapshot[metric];
}

/**
 * Derives this round's LP-facing secondary constraint from a user-facing spec, re-linearized
 * around whatever gear this round's `constraintVector` was calibrated against (same rationale as
 * the primary objective's own per-round recalibration - see this file's header comment).
 *
 * `constraintVector` already carries the correct sign for a maximizing LP (blendMetricEpValues
 * flips lower-is-better metrics), so a first-order Taylor expansion around the baseline gives:
 * `rawMetric(gear) ≈ currentAbsolute + sign * (constraintScore(gear) - constraintScoreAtBaseline)`
 * where `sign` is +1 for a higher-is-better metric (tps) and -1 for a lower-is-better one
 * (dtps/tmi). Solving the user's desired `rawMetric(gear) <= / >= targetAbsolute` for
 * `constraintScore(gear)` gives the bound below - and for a lower-is-better metric, flips which
 * LP-facing row kind (floor vs ceiling) actually encodes the user's real-world floor/ceiling,
 * since the vector's own sign is already inverted relative to the raw metric.
 *
 * Extracted as a pure function (no sim/LP access) so this arithmetic - the one place a sign
 * mistake would silently produce a constraint on the wrong side of the tradeoff - is directly
 * unit-testable.
 */
export function deriveSecondaryConstraintBound(
	spec: SecondaryMetricConstraintSpec,
	constraintVector: Stat[],
	currentAbsolute: number,
	constraintScoreAtBaseline: number,
): { statWeights: Stat[]; bound: number; kind: "floor" | "ceiling" } {
	const sign = LOWER_IS_BETTER_METRICS.has(spec.metric) ? -1 : 1;
	const bound =
		constraintScoreAtBaseline + sign * (spec.targetAbsolute - currentAbsolute);
	const kind =
		sign === 1 ? spec.kind : spec.kind === "floor" ? "ceiling" : "floor";
	return { statWeights: constraintVector, bound, kind };
}

/**
 * Drops candidate items another class can't actually equip in-game (e.g. "Onslaught
 * Shoulderguards" is plate armor a Paladin could physically wear, but its `classAllowlist`
 * restricts it to Warriors). Without this, the LP is free to pick 2+ pieces of a
 * class-restricted tier set for a round's gear - tbc-new's sim then panics applying that set's
 * bonus (a hard, unguarded `agent.(WarriorAgent)` type assertion in
 * vendor/tbc-sim/sim/warrior/items.go), crashing calibration outright. An item missing from
 * `db.items` entirely (shouldn't happen for a real item id, but not this function's job to
 * validate) is kept rather than dropped, since we have no restriction data to act on either way.
 */
export function filterItemsForClass(
	items: InputItem[],
	db: TbcUiDatabase,
	classId: string,
): InputItem[] {
	const classNum = Number(classId);
	const allowlistById = new Map(
		db.items.map((item) => [
			item.id as number,
			item.classAllowlist as number[] | undefined,
		]),
	);
	return items.filter((item) => {
		const allowlist = allowlistById.get(Number(item.id));
		return !allowlist || allowlist.length === 0 || allowlist.includes(classNum);
	});
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
// Returns `profile` unchanged when `override` is undefined (round 0, or the gear set isn't
// solving for consumables at all - see solveConfigForSimMetric). When present, `override` is
// always the complete flask/battleElixir/guardianElixir triple (0 for whichever wasn't chosen),
// so this can never leave a stale manual flaskId sitting alongside a newly-solved elixir combo.
function withConsumablesOverride(
	profile: SimCalibrationProfile,
	override: ConsumablesOverride | undefined,
): SimCalibrationProfile {
	if (!override) return profile;
	return {
		...profile,
		raidProfile: {
			...profile.raidProfile,
			consumables: { ...profile.raidProfile.consumables, ...override },
		},
	};
}

export async function solveConfigForSimMetric(
	items: InputItem[],
	options: Omit<SolveOptions, "optimizeStats" | "objectiveMode">,
	baselineGear: GearPiece[],
	db: TbcUiDatabase,
	metricRatios: Partial<Record<SimMetric, number>>,
	profile: SimCalibrationProfile,
	onProgress?: (progress: SimMetricSolveProgress) => void,
	// When present, round 1 (iteration 0) uses this instead of calling calibrateWeights() - see
	// round1WeightsCache.ts. Round 1 always calibrates around the same fixed baselineGear, so its
	// result depends only on the profile/metricRatios, not the item pool - safe to precompute once
	// and reuse across solves/configs that share those inputs.
	precomputedRound1?: CalibratedWeights,
	// A hard floor/ceiling on a second sim metric (see solveBalancedSimMetric.ts) - when present,
	// every round derives a second, independent weight vector from the same calibration batch and
	// feeds it to the LP as a SecondaryConstraint (see SolverConfiguration.ts), re-linearized each
	// round exactly like the primary objective. Bypasses precomputedRound1 (round 1 needs a fresh
	// full calibration batch too, since only calibrateWeights()'s single-blend result is ever
	// cached there - see round1WeightsCache.ts).
	secondaryConstraintSpec?: SecondaryMetricConstraintSpec,
): Promise<SimMetricSolveResult> {
	const maxIterations = profile.calibration.maxRounds;
	const eligibleItems = filterItemsForClass(items, db, options.classId);
	const solvingConsumables = options.enabledConsumableIds.length > 0;

	// `currentGear` is always a clean, slot-ordered, consumable-free gear array (round 0's
	// hand-picked baseline is already both) - it's the calibration loop's baseline input, kept
	// separate from `result` (the last accepted round's full LP output, gear + any chosen
	// consumables, still what's returned to the caller/UI). `currentConsumablesOverride` carries
	// whichever flask/elixir combo that round's LP chose, for the sim calls below - see
	// resolveGearAndConsumables.ts.
	let currentGear = baselineGear;
	let currentConsumablesOverride: ConsumablesOverride | undefined;
	let result: LPItem[] = [];
	let finalStatWeights: Stat[] = [];
	let finalStatWeightStdevs: Stat[] = [];
	let round1StatWeights: CalibratedWeights = {
		optimizeStats: [],
		stdevStats: [],
	};
	let converged = false;
	let iteration = 0;

	for (; iteration < maxIterations; iteration++) {
		const onCalibrationProgress = (calibrationProgress: CalibrationProgress) =>
			onProgress?.({
				iteration: 0,
				maxIterations: 1,
				simIteration: iteration,
				maxSimIterations: maxIterations,
				phase: "calibrating",
				calibrationCompletedIterations: calibrationProgress.completedIterations,
				calibrationTotalIterations: calibrationProgress.totalIterations,
			});

		let optimizeStats: Stat[];
		let stdevStats: Stat[];
		// Undefined whenever secondaryConstraintSpec isn't active, or this round reused
		// precomputedRound1 (which never carries a constraint vector - see this function's
		// secondaryConstraintSpec doc comment above).
		let secondaryConstraint:
			| ReturnType<typeof deriveSecondaryConstraintBound>
			| undefined;

		if (iteration === 0 && precomputedRound1 && !secondaryConstraintSpec) {
			({ optimizeStats, stdevStats } = precomputedRound1);
		} else if (secondaryConstraintSpec) {
			const { result, baselineMetrics } = await runCalibrationBatch(
				currentGear,
				db,
				SIM_CALIBRATION_STATS,
				withConsumablesOverride(profile, currentConsumablesOverride),
				onCalibrationProgress,
			);
			optimizeStats = blendMetricEpValues(
				result,
				SIM_CALIBRATION_STATS,
				metricRatios,
			);
			stdevStats = blendMetricEpValueStdevs(
				result,
				SIM_CALIBRATION_STATS,
				metricRatios,
			);
			const constraintVector = blendMetricEpValues(
				result,
				SIM_CALIBRATION_STATS,
				{
					[secondaryConstraintSpec.metric]: 1,
				},
			);
			if (baselineMetrics) {
				const constraintScoreAtBaseline = scoreGearSet(
					currentGear,
					new SolverConfiguration({
						...options,
						optimizeStats: constraintVector,
					}),
				);
				secondaryConstraint = deriveSecondaryConstraintBound(
					secondaryConstraintSpec,
					constraintVector,
					absoluteValueForMetric(
						baselineMetrics,
						secondaryConstraintSpec.metric,
					),
					constraintScoreAtBaseline,
				);
			}
			// baselineMetrics missing means this wasm build predates the StatWeightsResult.baseline
			// field (see calibrateWeights.ts) - fall back to an unconstrained round rather than
			// throwing, since the primary objective's own weights are still perfectly valid.
		} else {
			({ optimizeStats, stdevStats } = await calibrateWeights(
				currentGear,
				db,
				SIM_CALIBRATION_STATS,
				metricRatios,
				withConsumablesOverride(profile, currentConsumablesOverride),
				onCalibrationProgress,
			));
		}
		if (iteration === 0) {
			round1StatWeights = { optimizeStats, stdevStats };
		}

		const proposal = await solveConfig(
			eligibleItems,
			{
				...options,
				objectiveMode: "stats",
				optimizeStats,
				secondaryConstraint,
			},
			(progress) =>
				onProgress?.({
					...progress,
					simIteration: iteration,
					maxSimIterations: maxIterations,
					phase: "solving",
				}),
		);

		// Round 1 has nothing but the hand-picked baseline to compare against - always accept
		// it (same as before) rather than running it through a significance test that isn't
		// meaningful against a gear set that was never itself LP-optimized.
		if (iteration > 0) {
			const proposedScore = proposal.reduce(
				(sum, item) => sum + item.objectiveScore,
				0,
			);
			if (
				!isSignificantImprovement(
					result,
					proposal,
					proposedScore,
					optimizeStats,
					stdevStats,
					options,
				)
			) {
				// This round's "better" gear isn't distinguishable from calibration noise - keep
				// whatever was already accepted (in `result`/`currentGear`) rather than chasing
				// a coin flip, and stop (a future round would face the same ambiguous choice
				// again).
				converged = true;
				iteration++;
				break;
			}
		}
		result = proposal;
		finalStatWeights = optimizeStats;
		finalStatWeightStdevs = stdevStats;
		const split = splitGearAndConsumables(proposal);
		currentGear = split.gear;
		currentConsumablesOverride = solvingConsumables
			? split.consumables
			: undefined;
	}

	// Calibration only ever produces marginal per-stat weights, never an absolute value - run
	// one dedicated sim against the exact final gear so the displayed TPS/DTPS/TMI-5 numbers are
	// always accurate, even if the loop above hit maxIterations without fully converging (in
	// which case a calibration round's own internal baseline would reflect the second-to-last
	// gear guess, not this final one).
	const simMetrics = await measureFinalSimMetrics(
		currentGear,
		db,
		withConsumablesOverride(profile, currentConsumablesOverride),
		(calibrationProgress: CalibrationProgress) =>
			onProgress?.({
				iteration: 0,
				maxIterations: 1,
				simIteration: iteration,
				maxSimIterations: maxIterations,
				phase: "measuring",
				calibrationCompletedIterations: calibrationProgress.completedIterations,
				calibrationTotalIterations: calibrationProgress.totalIterations,
			}),
	);

	return {
		items: result,
		iterations: iteration,
		converged,
		simMetrics,
		finalStatWeights,
		finalStatWeightStdevs,
		round1StatWeights,
	};
}
