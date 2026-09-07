// Iterative sim-calibrated solve: mirrors solveEHP.ts's Sequential-Linear-Programming shape
// (solve -> recompute weights around the result -> resolve until stable), but the per-round
// weight vector comes from a real tbc-new sim calibration instead of a closed-form
// derivative, since TPS/DTPS/TMI-5 have no closed form. See docs/plans/sim-backed-objectives.md's
// Phase 3 design and its note on why this needs re-linearizing each round: calibration is a
// local Taylor approximation around one gear set, and avoidance/block have real curvature.
import { perfTrace } from "#/helpers/perfTrace";
import { getItem, transformItem } from "#/solver/items";
import { SolverConfiguration } from "#/solver/SolverConfiguration";
import {
	type SolveOptions,
	type SolveProgress,
	solveConfig,
} from "#/solver/solveConfig";
import type { InputItem, LPItem, Stat } from "#/solver/types";
import type {
	SimCalibrationProfile,
	SimMetricsSnapshot,
} from "#/types/SimCalibrationProfile";
import type { TbcUiDatabase } from "./buildStatWeightsRequest";
import {
	type CalibratedWeights,
	type CalibrationProgress,
	calibrateWeights,
	measureFinalSimMetrics,
	resetSimEnvironment,
	type SimMetric,
} from "./calibrateWeights";
import {
	type ConsumablesOverride,
	splitGearAndConsumables,
} from "./resolveGearAndConsumables";
import { resolveCalibrationStats } from "./statTranslation";
import type { GearPiece } from "./toTbcItemSpec";

export { SIM_CALIBRATION_STAT_NAMES as SIM_CALIBRATION_STATS } from "./statTranslation";

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
	// The same accepted round's *pure* (unblended) per-metric weight breakdowns - see
	// calibrateWeights.ts's computePerMetricStatWeights. Lets the Results UI show TPS/DTPS/TMI-5
	// weights simultaneously regardless of which one (or blend) actually drove the objective, at
	// no extra sim cost, since the sim always computes all three from the same calibration batch.
	finalPerMetricStatWeights: Record<SimMetric, Stat[]>;
	finalPerMetricStatWeightStdevs: Record<SimMetric, Stat[]>;
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

// A single "not significant" round is treated as inconclusive, not proof of convergence - TMI-5
// in particular is noisy enough (see this file's header comment and docs/plans/sim-backed-
// objectives.md's SNR findings) that one unlucky noisy sample can make a real improvement look
// insignificant. Require this many *consecutive* non-significant rounds - each a fresh,
// independent calibration sample around the same accepted gear - before giving up.
const CONVERGENCE_CONFIRMATION_ROUNDS = 2;

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
 * L2 norm of a calibrated weight vector's values - used by the round-diagnostics hook below to
 * check whether a round-over-round weight vector is drifting in overall scale, which would make
 * isSignificantImprovement's round-native delta (scored under that round's own weights) an
 * unreliable signal even when it looks "significant" every round - see solveConfigForSimMetric's
 * onRoundDiagnostics doc comment.
 */
function weightVectorL2Norm(stats: Stat[]): number {
	return Math.sqrt(stats.reduce((sum, stat) => sum + stat.value ** 2, 0));
}

/** Stable per-item key for the item-set-stability diagnostic below - two GearPiece entries with
 * the same id/enchant/gems are "the same pick" regardless of array order. */
function gearPieceKey(piece: GearPiece): string {
	return `${piece.id}|${piece.enchant.id}|${[...piece.gemSlots].sort().join(",")}`;
}

/**
 * Order-independent identity key for a whole gear set - two GearPiece[] with the same items in
 * any order produce the same fingerprint. Used by the round-acceptance logic below to detect
 * both true convergence (this round's proposal fingerprint matches the currently accepted one)
 * and thrashing (this round's proposal fingerprint matches an *earlier* accepted round's, i.e.
 * the LP is cycling between a small number of gear sets rather than converging on one) - see
 * this file's "why not just score-based significance" note above solveConfigForSimMetric's
 * acceptedFingerprints.
 */
function gearSetFingerprint(gear: GearPiece[]): string {
	return gear.map(gearPieceKey).sort().join(";");
}

/**
 * Counts how many item picks differ between two gear sets (as a multiset symmetric difference,
 * so a swap between two slots counts as 2, not 0, even though the same two ids are present in
 * both sets) - used by the round-diagnostics hook to tell whether the LP is still actually
 * changing its item selection, independent of whether isSignificantImprovement's score delta
 * says the round "improved."
 */
function countChangedItems(
	previous: GearPiece[],
	proposed: GearPiece[],
): number {
	const remaining = new Map<string, number>();
	for (const piece of previous) {
		const key = gearPieceKey(piece);
		remaining.set(key, (remaining.get(key) ?? 0) + 1);
	}
	let changed = 0;
	for (const piece of proposed) {
		const key = gearPieceKey(piece);
		const count = remaining.get(key) ?? 0;
		if (count > 0) {
			remaining.set(key, count - 1);
		} else {
			changed++;
		}
	}
	// Whatever's left in `remaining` was in `previous` but never matched - each one is also a
	// "changed" slot (the other side of the swap).
	for (const count of remaining.values()) changed += count;
	return changed;
}

/**
 * Per-round data for the maxRounds/convergence investigation (see docs/plans - this session's
 * "Investigate sim-solve loop convergence" plan). Purely a read-only reporting hook: passing
 * `onRoundDiagnostics` to solveConfigForSimMetric changes no solve behavior, it only exposes data
 * the loop already computes internally (plus two extra scoreGearSet calls under a *fixed*
 * round-1 weight vector) so a caller can tell "real progress" apart from "the round-native
 * significance check just looks like progress because the weight vector it's scored under keeps
 * drifting in scale round to round."
 */
export interface RoundDiagnostics {
	roundIndex: number;
	accepted: boolean;
	// undefined only for round 0, which has no significance check to compare against.
	delta?: number;
	stdevDelta?: number;
	significant?: boolean;
	// How many item slots differ between this round's proposal and the previously accepted gear
	// (see countChangedItems) - real, ongoing item churn vs. a stabilized pick under a still-
	// moving yardstick.
	itemsChangedCount: number;
	// proposalGear's score minus currentGear's score, both under round 1's weight vector held
	// fixed for the whole solve (not this round's own weights) - if this plateaus while `delta`
	// above doesn't, the round-native comparison is the misleading one, not real non-convergence.
	fixedYardstickDelta: number;
	// L2 norm of this round's freshly calibrated optimizeStats - large swings here would help
	// explain why round-native deltas of similar magnitude keep appearing under superficially
	// different weight vectors.
	weightVectorL2Norm: number;
}

/**
 * Whether this round's `proposed` gear is a statistically meaningful improvement over
 * `previous`, given this round's calibrated weights and their uncertainty.
 *
 * NOT used to gate round acceptance in solveConfigForSimMetric below - kept only as informational
 * diagnostics (see RoundDiagnostics' delta/stdevDelta/significant fields). A real investigation
 * (this session - see docs/plans' "Investigate sim-solve loop convergence" plan) found this test
 * structurally biased toward "significant" even when nothing real changed: `optimizeStats` is
 * always renormalized to unit L2 norm (see calibrateWeights.ts's normalizeStatVector), so its
 * *magnitude* never drifts, but its *direction* rotates slightly every round from ordinary
 * calibration noise - and since `proposed` was, by LP construction, chosen to be optimal under
 * this exact freshly-rotated direction while `previous` was not, scoring the two under it is
 * biased to always favor `proposed`, regardless of whether the gear actually improved. Confirmed
 * empirically: real solves showed rounds where the LP proposed the *exact same items* as already
 * accepted (0 changed) yet this function still reported "significant" by a wide margin. See
 * gearSetFingerprint/acceptedFingerprints below for the replacement, artifact-free test.
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
	// Investigation-only reporting hook - see RoundDiagnostics' doc comment. Never affects solve
	// behavior; omit it and nothing changes.
	onRoundDiagnostics?: (diagnostics: RoundDiagnostics) => void,
): Promise<SimMetricSolveResult> {
	// Each real solve gets its own freshly spawned solver.worker.ts (see src/solver/index.ts's
	// solve()), so a shared perfTrace has no cross-solve contamination risk in production - but
	// reset explicitly anyway so repeated calls within one process (e.g. many solves in one test
	// file, or a future non-Worker caller) each report a clean, self-contained breakdown instead
	// of an ever-growing aggregate.
	perfTrace.reset();
	const stopSolveConfigForSimMetric = perfTrace.mark("solveConfigForSimMetric");
	const roundMsList: number[] = [];

	const maxIterations = profile.calibration.maxRounds;
	const stopFilterItems = perfTrace.mark("filterItemsForClass");
	const eligibleItems = filterItemsForClass(items, db, options.classId);
	const filterItemsMs = stopFilterItems();
	const solvingConsumables = options.enabledConsumableIds.length > 0;
	// A user can turn individual stats off per config (see SolverConfiguration.
	// enabledCalibrationStats) to skip their +/- perturbation sims entirely - cheaper calibration
	// rounds, or excluding a stat whose itemization isn't present in this pool.
	// resolveCalibrationStats falls back to the full default when unset/empty, or when every
	// selected entry turns out stale/invalid - a defensive backstop against a corrupted config
	// producing an all-zero objective (the UI itself already prevents unchecking every stat).
	const calibrationStats = resolveCalibrationStats(
		options.enabledCalibrationStats,
	);

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
	let finalPerMetricStatWeights = {} as Record<SimMetric, Stat[]>;
	let finalPerMetricStatWeightStdevs = {} as Record<SimMetric, Stat[]>;
	let round1StatWeights: CalibratedWeights = {
		optimizeStats: [],
		stdevStats: [],
	};
	let converged = false;
	let iteration = 0;
	let noImprovementStreak = 0;
	// Built once round 0's weights are known, then held fixed for the rest of the solve - see
	// RoundDiagnostics' fixedYardstickDelta doc comment.
	let round1Config: SolverConfiguration | undefined;
	// Fingerprint (see gearSetFingerprint) of every round's accepted gear so far, including round
	// 0's - the actual convergence gate (see the iteration>0 branch below). A proposal that
	// repeats ANY earlier accepted fingerprint, not just the immediately-previous one, means the
	// LP is cycling between a small number of gear sets rather than making new progress -
	// replaces the score-based isSignificantImprovement check, which this session's investigation
	// found structurally biased toward "significant" even when nothing real changed (see that
	// function's doc comment).
	const acceptedFingerprints: string[] = [];

	for (; iteration < maxIterations; iteration++) {
		const roundIndex = iteration;
		const stopRound = perfTrace.mark(`round:${roundIndex}`);
		let resetMs = 0;
		let calibrateMs = 0;
		let solveMs = 0;
		let splitMs = 0;
		let significanceMs = 0;
		try {
			const onCalibrationProgress = (
				calibrationProgress: CalibrationProgress,
			) =>
				onProgress?.({
					iteration: 0,
					maxIterations: 1,
					simIteration: iteration,
					maxSimIterations: maxIterations,
					phase: "calibrating",
					calibrationCompletedIterations:
						calibrationProgress.completedIterations,
					calibrationTotalIterations: calibrationProgress.totalIterations,
				});

			let optimizeStats: Stat[];
			let stdevStats: Stat[];
			let perMetricStatWeights: Record<SimMetric, Stat[]> | undefined;
			let perMetricStatWeightStdevs: Record<SimMetric, Stat[]> | undefined;

			if (iteration === 0 && precomputedRound1) {
				({
					optimizeStats,
					stdevStats,
					perMetricStatWeights,
					perMetricStatWeightStdevs,
				} = precomputedRound1);
			} else {
				// Periodically reset the coordinator wasm instance + worker pool between rounds - see
				// simWorkerPool.ts's header comment and statWeightsClient.ts's resetSimEnvironment doc
				// comment for why long-lived reused wasm instances can wedge after enough cumulative
				// calls. Never before round 1 (nothing has accumulated yet); always placed strictly
				// between whole calibrateWeights() calls, never mid-batch.
				if (iteration > 0) {
					const stopReset = perfTrace.mark("resetSimEnvironment");
					resetSimEnvironment();
					resetMs = stopReset();
				}
				const stopCalibrate = perfTrace.mark("calibrateWeights");
				({
					optimizeStats,
					stdevStats,
					perMetricStatWeights,
					perMetricStatWeightStdevs,
				} = await calibrateWeights(
					currentGear,
					db,
					calibrationStats,
					metricRatios,
					withConsumablesOverride(profile, currentConsumablesOverride),
					onCalibrationProgress,
				));
				calibrateMs = stopCalibrate();
			}
			if (iteration === 0) {
				round1StatWeights = { optimizeStats, stdevStats };
				round1Config = new SolverConfiguration({ ...options, optimizeStats });
			}

			const stopSolve = perfTrace.mark("solveConfig");
			const proposal = await solveConfig(
				eligibleItems,
				{
					...options,
					objectiveMode: "stats",
					optimizeStats,
				},
				(progress) =>
					onProgress?.({
						...progress,
						simIteration: iteration,
						maxSimIterations: maxIterations,
						phase: "solving",
					}),
			);
			solveMs = stopSolve();

			// scoreGearSet (inside isSignificantImprovement) re-derives each piece's score via
			// getItem(), which only knows about real equipment - a consumable LPItem's `id` is the
			// CONSUMABLES slug (see resolveGearAndConsumables.ts), not a real item id, so it must be
			// split out before comparison rather than passing the LP's raw gear+consumables output
			// straight through.
			const stopSplit = perfTrace.mark("splitGearAndConsumables");
			const proposalSplit = splitGearAndConsumables(proposal);
			splitMs = stopSplit();
			const proposalGear = proposalSplit.gear;

			// Investigation-only (see RoundDiagnostics) - computed unconditionally, before the
			// accept/reject branches below, since every one of them needs to report it.
			const itemsChangedCount = countChangedItems(currentGear, proposalGear);
			const fixedYardstickDelta = round1Config
				? scoreGearSet(proposalGear, round1Config) -
					scoreGearSet(currentGear, round1Config)
				: 0;
			const roundWeightNorm = weightVectorL2Norm(optimizeStats);
			const proposalFingerprint = gearSetFingerprint(proposalGear);

			// Round 1 has nothing but the hand-picked baseline to compare against - always accept
			// it (same as before) rather than running it through a convergence test that isn't
			// meaningful against a gear set that was never itself LP-optimized.
			if (iteration > 0) {
				// isSignificantImprovement is computed purely for RoundDiagnostics' informational
				// delta/stdevDelta/significant fields now - see that function's doc comment for why
				// it's no longer what decides acceptance. The actual gate is fingerprint-based
				// (isNovel below): does this round's proposal repeat any gear set already accepted
				// earlier in this solve? That catches both a true fixed point (repeats the
				// immediately-previous round) and thrashing between a small number of near-tied gear
				// sets (repeats an *older* round's), neither of which is "real" further progress -
				// without relying on isSignificantImprovement's score, which this session's
				// investigation found gets fooled by ordinary round-to-round calibration noise.
				const proposedScore = proposal.reduce(
					(sum, item) => sum + item.objectiveScore,
					0,
				);
				const stopSignificance = perfTrace.mark("isSignificantImprovement");
				const significant = isSignificantImprovement(
					currentGear,
					proposalGear,
					proposedScore,
					optimizeStats,
					stdevStats,
					options,
				);
				significanceMs = stopSignificance();
				const config = new SolverConfiguration({ ...options, optimizeStats });
				const stdevConfig = new SolverConfiguration({
					...options,
					optimizeStats: stdevStats,
				});
				const isNovel = !acceptedFingerprints.includes(proposalFingerprint);
				onRoundDiagnostics?.({
					roundIndex,
					accepted: isNovel,
					delta: proposedScore - scoreGearSet(currentGear, config),
					stdevDelta:
						scoreGearSet(proposalGear, stdevConfig) -
						scoreGearSet(currentGear, stdevConfig),
					significant,
					itemsChangedCount,
					fixedYardstickDelta,
					weightVectorL2Norm: roundWeightNorm,
				});
				if (!isNovel) {
					// This round's proposal repeats a gear set already accepted earlier - either a
					// true fixed point or a thrashing cycle. A single such round is inconclusive, not
					// proof of convergence (see CONVERGENCE_CONFIRMATION_ROUNDS above - a fresh
					// calibration sample might still break the cycle). Keep whatever was already
					// accepted (in `result`/`currentGear`) and retry before trusting this verdict.
					noImprovementStreak++;
					if (noImprovementStreak < CONVERGENCE_CONFIRMATION_ROUNDS) {
						continue;
					}
					converged = true;
					iteration++;
					break;
				}
			} else {
				onRoundDiagnostics?.({
					roundIndex,
					accepted: true,
					itemsChangedCount,
					fixedYardstickDelta,
					weightVectorL2Norm: roundWeightNorm,
				});
			}
			noImprovementStreak = 0;
			acceptedFingerprints.push(proposalFingerprint);
			result = proposal;
			finalStatWeights = optimizeStats;
			finalStatWeightStdevs = stdevStats;
			finalPerMetricStatWeights =
				perMetricStatWeights ?? ({} as Record<SimMetric, Stat[]>);
			finalPerMetricStatWeightStdevs =
				perMetricStatWeightStdevs ?? ({} as Record<SimMetric, Stat[]>);
			currentGear = proposalGear;
			currentConsumablesOverride = solvingConsumables
				? proposalSplit.consumables
				: undefined;
		} finally {
			const roundMs = stopRound();
			roundMsList.push(roundMs);
			perfTrace.recordGap(`round:${roundIndex}`, roundMs, [
				resetMs,
				calibrateMs,
				solveMs,
				splitMs,
				significanceMs,
			]);
		}
	}

	// Calibration only ever produces marginal per-stat weights, never an absolute value - run
	// one dedicated sim against the exact final gear so the displayed TPS/DTPS/TMI-5 numbers are
	// always accurate, even if the loop above hit maxIterations without fully converging (in
	// which case a calibration round's own internal baseline would reflect the second-to-last
	// gear guess, not this final one).
	const stopMeasureFinal = perfTrace.mark("measureFinalSimMetrics");
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
	const measureFinalMs = stopMeasureFinal();

	const solveConfigForSimMetricMs = stopSolveConfigForSimMetric();
	perfTrace.recordGap("solveConfigForSimMetric", solveConfigForSimMetricMs, [
		filterItemsMs,
		...roundMsList,
		measureFinalMs,
	]);
	perfTrace.log("sim-backed solve");

	return {
		items: result,
		iterations: iteration,
		converged,
		simMetrics,
		finalStatWeights,
		finalStatWeightStdevs,
		finalPerMetricStatWeights,
		finalPerMetricStatWeightStdevs,
		round1StatWeights,
	};
}
