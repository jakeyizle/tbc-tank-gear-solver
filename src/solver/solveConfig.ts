import GLPK, { type GLPK as GLPKType, type LP } from "glpk.js";
import { perfTrace } from "#/helpers/perfTrace";
import { calculateStatValue } from "#/helpers/stats";
import type { SimCalibrationProfile } from "#/types/SimCalibrationProfile";
import { getConsumableLPItems } from "./consumables";
import {
	allBinaryVarNames,
	allItemHeaders,
	buildDecomposedLinkingConstraints,
	buildResistanceVars,
	buildScoreVars,
	buildUniqueGemVars,
	type ItemHeader,
	type LPVar,
	resolveChosenDecomposableItems,
	type SubjectTo,
} from "./decomposedModel";
import { prepareItemCandidates, transformItem } from "./items";
import { SolverConfiguration } from "./SolverConfiguration";
import type {
	DecomposableItem,
	Enchant,
	InputItem,
	LPItem,
	ModifierSource,
	ProcessedItemType,
	ResistanceFloor,
	Stat,
	StatName,
} from "./types";

export interface SolveOptions {
	uncrushabilitySetting: number;
	uncritabilitySetting: number;
	optimizeStats: Stat[];
	// "tps"/"dtps"/"tmi" purely maximize (or minimize) that one sim-calibrated metric - see
	// solveSimMetric.ts. "balanced" blends tps against `survivabilityMetric` per `balance` - see
	// calibrateWeights.ts's metricRatiosForBalance. TPS/DTPS/TMI-5 are all measured and shown in
	// results regardless of which mode is chosen.
	objectiveMode?:
		| "stats"
		| "ehp"
		| "hardAvoidance"
		| "tps"
		| "dtps"
		| "tmi"
		| "balanced";
	// Only meaningful for "balanced" mode - see calibrateWeights.ts's metricRatiosForBalance.
	// Kept as plain literal types here (not imported from src/sim/), since this file is the
	// generic LP core and never imports from the tbc-new sim integration.
	balance?: number;
	survivabilityMetric?: "tmi" | "dtps";
	// Which stats get a +/- perturbation sim during calibration (see calibrateWeights.ts's
	// statsToWeigh) for "tps"/"dtps"/"tmi"/"balanced" modes - see SolverConfiguration.
	// enabledCalibrationStats. Optional/undefined falls back to the full default list
	// (solveSimMetric.ts's SIM_CALIBRATION_STATS).
	enabledCalibrationStats?: StatName[];
	simCalibrationProfile?: SimCalibrationProfile;
	resistanceFloors: ResistanceFloor[];
	areEnchantsGemsLocked: boolean;
	excludeUniqueGems: boolean;
	excludeJewelcraftingItems: boolean;
	excludeEnchantingItems: boolean;
	phase: number;
	raceId: string;
	classId: string;
	talentSources: ModifierSource[];
	buffs: ModifierSource[];
	abilitySources: ModifierSource[];
	enabledConsumableIds: string[];
	// Lets a caller that doesn't need this solve's final gear-picking precision (e.g.
	// measureMetricAchievableScale - see its own doc comment) trade some of it for speed.
	// Omitted entirely for every ordinary solve, which gets the global defaults - see
	// LPQualityOverride's own doc comment in this file.
	lpQualityOverride?: LPQualityOverride;
}

export interface SolveProgress {
	iteration: number;
	maxIterations: number;
}

const OPTIONAL_TYPES: ProcessedItemType[] = [
	"Flask",
	"BattleElixir",
	"GuardianElixir",
];

function typeBoundNumber(type: ProcessedItemType) {
	return type === "Finger" || type === "Trinket" ? 2 : 1;
}

const groupHeadersByType = (headers: ItemHeader[]) => {
	return headers.reduce(
		(acc, header) => {
			acc[header.type] = [...(acc[header.type] ?? []), header];
			return acc;
		},
		{} as Record<ProcessedItemType, ItemHeader[]>,
	);
};

const groupHeadersByItemId = (headers: ItemHeader[]) => {
	return headers.reduce(
		(acc, header) => {
			if (!acc[header.id]) acc[header.id] = [];
			acc[header.id].push(header);
			return acc;
		},
		{} as Record<string, ItemHeader[]>,
	);
};

interface Objective {
	direction: number;
	name: string;
	vars: LPVar[];
}

const createModel = (
	objective: Objective,
	subjectTo: SubjectTo[],
	binaries: string[],
): LP => {
	return {
		name: "wow-gear",
		objective,
		subjectTo,
		binaries,
	};
};

const makeAvoidanceConstraint = (
	vars: LPVar[],
	avoidanceTarget: number,
	glpk: GLPKType,
) => {
	return {
		name: "avoidance",
		vars,
		bnds: {
			type: glpk.GLP_LO,
			lb: avoidanceTarget,
			ub: Number.POSITIVE_INFINITY,
		},
	};
};

const makeUncritableConstraint = (
	vars: LPVar[],
	uncritabilityTarget: number,
	glpk: GLPKType,
) => {
	return {
		name: "uncritable",
		vars,
		bnds: {
			type: glpk.GLP_LO,
			lb: uncritabilityTarget,
			ub: Number.POSITIVE_INFINITY,
		},
	};
};

const makeResistanceConstraint = (
	vars: LPVar[],
	stat: ResistanceFloor["stat"],
	target: number,
	glpk: GLPKType,
) => {
	return {
		name: `resistance_${stat}`,
		vars,
		bnds: {
			type: glpk.GLP_LO,
			lb: target,
			ub: Number.POSITIVE_INFINITY,
		},
	};
};

// each slot can have 1 (or 2 for finger/trinket) items
// flasks/elixirs are optional (0 or up to the bound), unlike mandatory gear slots
// "Shield" is excluded here - a two-hander occupies the same off-hand slot a shield would, so
// its count can't be pinned to a fixed bound independent of what's chosen for "Weapon" - see
// makeWeaponShieldConstraint below, which replaces this slot's constraint entirely.
const makeSlotConstraint = (
	headersByType: Record<ProcessedItemType, ItemHeader[]>,
	glpk: GLPKType,
) => {
	return Object.entries(headersByType)
		.filter(([type]) => type !== "Shield")
		.map(([type, headers]) => {
			const bound = typeBoundNumber(type as ProcessedItemType);
			const isOptional = OPTIONAL_TYPES.includes(type as ProcessedItemType);
			return {
				name: `type_${type}`,
				vars: headers.map((header) => ({
					name: header.uniqueId,
					coef: 1,
				})),
				// TODO: fix type cast
				bnds: isOptional
					? { type: glpk.GLP_UP, lb: 0, ub: bound }
					: { type: glpk.GLP_FX, lb: bound, ub: bound },
			};
		});
};

// A two-handed weapon can't be paired with a shield - both occupy the same off-hand slot, and
// "Weapon"/"Shield" are otherwise modeled as independent mandatory slots (see makeSlotConstraint),
// which lets the solver equip a two-hander AND a shield at once with nothing to stop it. The
// "Weapon" slot's own exactly-1 constraint still guarantees exactly one weapon (one- or
// two-handed) gets chosen; this constraint ties the off-hand to that choice: exactly one of
// {a shield, a two-hander} must be true, so a one-hander forces a shield to be picked (preserving
// the previous always-equip-a-shield behavior) and a two-hander forces the shield count to 0.
// A pool with no shield candidates at all needs no such link (the two-hander vs one-hander
// distinction is moot without an off-hand slot to contest), so this returns [] in that case.
const makeWeaponShieldConstraint = (
	headersByType: Record<ProcessedItemType, ItemHeader[]>,
	glpk: GLPKType,
): SubjectTo[] => {
	const shieldHeaders = headersByType.Shield ?? [];
	if (shieldHeaders.length === 0) return [];

	const twoHandWeaponHeaders = (headersByType.Weapon ?? []).filter(
		(header) => header.handType === "TwoHand",
	);

	return [
		{
			name: "weapon_shield_exclusivity",
			vars: [
				...shieldHeaders.map((header) => ({ name: header.uniqueId, coef: 1 })),
				...twoHandWeaponHeaders.map((header) => ({
					name: header.uniqueId,
					coef: 1,
				})),
			],
			bnds: { type: glpk.GLP_FX, lb: 1, ub: 1 },
		},
	];
};

// a flask replaces both elixirs, so a flask can't be combined with either elixir type
const makeConsumableExclusionConstraint = (
	headersByType: Record<ProcessedItemType, ItemHeader[]>,
	glpk: GLPKType,
): SubjectTo[] => {
	const flaskVars = (headersByType.Flask ?? []).map((header) => ({
		name: header.uniqueId,
		coef: 1,
	}));
	if (flaskVars.length === 0) return [];

	const guardianVars = (headersByType.GuardianElixir ?? []).map((header) => ({
		name: header.uniqueId,
		coef: 1,
	}));
	const battleVars = (headersByType.BattleElixir ?? []).map((header) => ({
		name: header.uniqueId,
		coef: 1,
	}));

	return [
		{
			name: "flask_vs_guardian_elixir",
			vars: [...flaskVars, ...guardianVars],
			bnds: { type: glpk.GLP_UP, lb: 0, ub: 1 },
		},
		{
			name: "flask_vs_battle_elixir",
			vars: [...flaskVars, ...battleVars],
			bnds: { type: glpk.GLP_UP, lb: 0, ub: 1 },
		},
	];
};

// each item base can only be used once - otherwise multiple rings will be used
const makeBaseItemConstaint = (
	headersByItemId: Record<string, ItemHeader[]>,
	glpk: GLPKType,
) => {
	return Object.entries(headersByItemId).map(([id, headers]) => ({
		name: `unique_${id}`,
		vars: headers.map((header) => ({
			name: header.uniqueId,
			coef: 1,
		})),
		bnds: { type: glpk.GLP_UP, ub: 1, lb: 0 },
	}));
};

// the same Unique-Equipped gem can only be socketed once across the whole gear set
const makeUniqueGemConstraint = (
	gemVarsByGemId: Record<string, LPVar[]>,
	glpk: GLPKType,
) => {
	return Object.entries(gemVarsByGemId).map(([gemId, vars]) => ({
		name: `unique_gem_${gemId}`,
		vars,
		bnds: { type: glpk.GLP_UP, ub: 1, lb: 0 },
	}));
};

// mipgap=0 demands an exhaustive proof of exact optimality - fine for the typical few-hundred-
// variable model, but for a larger item pool (thousands of gem/enchant decomposable binaries),
// branch-and-bound routinely finds a solution within a fraction of a percent of optimal almost
// immediately, then spends many extra minutes grinding just to shave that last sliver to exactly
// 0% (confirmed live: a 1654-var solve sat at "< 0.1%" for 3+ minutes with zero further
// improvement, indistinguishable from a hang from the outside even though glpk was still actively
// searching). 0.0001 (0.01%) trades that long tail for a solution that's numerically
// indistinguishable in gear stat totals, while still stopping well short of settling for a
// meaningfully worse pick.
const MIP_GAP_TOLERANCE = 0.0001;

// A gap tolerance alone can't bound worst-case time - two independent live incidents (see
// solveConfig.ts's git history / session notes) showed the achievable solution plateau within
// ~5 seconds and then sit completely unchanged (same incumbent, same bound, to the digit) for
// 100+ more seconds and 150,000+ additional branch-and-bound nodes, unable to close the last
// sliver down to MIP_GAP_TOLERANCE. tmlim forces a hard stop regardless, returning the best
// feasible solution found (glpk reports GLP_FEAS rather than GLP_OPT in that case - see the
// status check below). 15s gives real solves (almost all of which finish in well under a second)
// a wide margin, while capping the rare pathological instance to a short, predictable wait - a
// multi-round sim solve can call solveConfig dozens of times, so an unbounded per-call tail
// multiplies badly.
const SOLVE_TIME_LIMIT_SECONDS = 15;

// Lets a caller that doesn't need the final gear-picking solve's precision (e.g.
// measureMetricAchievableScale, which only uses its result to normalize a blend ratio, not to
// choose gear) trade some of that precision for speed. Omitted fields fall back to the global
// defaults above, which is what every ordinary solveConfig call gets.
export interface LPQualityOverride {
	mipGap?: number;
	timeLimitSeconds?: number;
}

const solveOptions = (glpk: GLPKType, override?: LPQualityOverride) => ({
	msglev: glpk.GLP_MSG_ON,
	mipgap: override?.mipGap ?? MIP_GAP_TOLERANCE,
	tmlim: override?.timeLimitSeconds ?? SOLVE_TIME_LIMIT_SECONDS,
});

const describeConstraints = (config: SolverConfiguration): string => {
	const parts: string[] = [];
	if (config.avoidanceTarget > 0) {
		parts.push(
			`${config.avoidanceStatName} target ${config.avoidanceTarget.toFixed(2)}`,
		);
	}
	if (config.uncritabilityTarget > 0) {
		parts.push(`Uncritability target ${config.uncritabilityTarget.toFixed(2)}`);
	}
	for (const { stat, target } of config.resistanceTargets) {
		if (target > 0) {
			parts.push(`${stat} resistance target ${target.toFixed(2)}`);
		}
	}
	return parts.length > 0 ? parts.join(", ") : "the configured constraints";
};

const EMPTY_ENCHANT: Enchant = {
	name: "",
	id: "",
	effectID: "",
	type: "Ranged",
	stats: [],
};

// glpk.js's web build spins up a brand-new dedicated Worker + WASM instance on every GLPK() call
// (see node_modules/glpk.js/src/glpk-web.js's createWorker/default export) - that's expensive
// (a fresh WASM compile each time) and, worse, was found to be genuinely unreliable under
// concurrency: a live console-log trace across several sim-backed rounds showed rounds 1-4 each
// cleanly create+terminate their handful of concurrent glpk workers (measureMetricAchievableScale
// runs several `runLPModel` calls in parallel via Promise.all), but round 5 hit a race where 3 of
// 5 concurrent `await GLPK()` calls simply never resolved - no error, no onerror, nothing - and
// everything downstream hung forever. This wasn't a monotonic leak (round 4 was clean, round 5
// wasn't), so terminating each call's worker after use (tried first) didn't fix it either -
// spinning up one-shot workers under concurrency is just an inherently flaky pattern.
//
// The actual fix: don't create one per call at all. glpk.js's own wrapper already queues
// concurrent `.solve()` calls onto a single worker via a FIFO `work[]` array (see glpk-web.js's
// `post`/`onmessage`), matching each response back to its request in send order - it's designed
// for exactly this, one instance safely serving many concurrent solves, the same pattern
// simWorkerPool.ts already uses on the sim side for the same reason. So this module creates
// exactly one GLPK() instance, lazily, and reuses it for the lifetime of this Worker - never
// terminated (nothing else needs that worker once this process's solveConfig work is done, and
// the browser reclaims it when this whole Worker itself is torn down - see solver/index.ts).
let sharedGlpkPromise: ReturnType<typeof GLPK> | undefined;
function getSharedGlpk(): ReturnType<typeof GLPK> {
	if (!sharedGlpkPromise) {
		console.log(
			`[lp] creating shared glpk worker (t=${performance.now().toFixed(0)}ms)`,
		);
		sharedGlpkPromise = GLPK();
		sharedGlpkPromise.then(() =>
			console.log(
				`[lp] shared glpk worker ready (t=${performance.now().toFixed(0)}ms)`,
			),
		);
	}
	return sharedGlpkPromise;
}

const runLPModel = async (
	fixedItems: LPItem[],
	decomposableItems: DecomposableItem[],
	avoidanceTarget: number,
	uncritabilityTarget: number,
	resistanceTargets: { stat: ResistanceFloor["stat"]; target: number }[],
	config: SolverConfiguration,
	lpQualityOverride?: LPQualityOverride,
) => {
	const stopRunLPModel = perfTrace.mark("runLPModel");
	let glpkAcquireMs = 0;
	let buildLpModelMs = 0;
	let glpkSolveMs = 0;
	let transformMs = 0;
	try {
		const stopGlpkAcquire = perfTrace.mark("glpkModuleAcquire");
		const glpk = await getSharedGlpk();
		glpkAcquireMs = stopGlpkAcquire();

		const stopBuildModel = perfTrace.mark("buildLpModel");
		const headers = allItemHeaders(fixedItems, decomposableItems);
		const headersByType = groupHeadersByType(headers);
		const headersByItemId = groupHeadersByItemId(headers);
		const binaries = allBinaryVarNames(fixedItems, decomposableItems);

		const objective = {
			direction: glpk.GLP_MAX,
			name: "obj",
			vars: buildScoreVars(fixedItems, decomposableItems, "objectiveScore"),
		};

		const slotConstraint = makeSlotConstraint(headersByType, glpk);
		const weaponShieldConstraint = makeWeaponShieldConstraint(
			headersByType,
			glpk,
		);
		const baseItemConstraint = makeBaseItemConstaint(headersByItemId, glpk);
		const uniqueGemVars = buildUniqueGemVars(fixedItems, decomposableItems);
		const uniqueGemConstraint = makeUniqueGemConstraint(uniqueGemVars, glpk);
		const consumableExclusionConstraint = makeConsumableExclusionConstraint(
			headersByType,
			glpk,
		);
		const linkingConstraints = buildDecomposedLinkingConstraints(
			decomposableItems,
			glpk,
		);

		const constraints: SubjectTo[] = [
			...slotConstraint,
			...weaponShieldConstraint,
			...baseItemConstraint,
			...uniqueGemConstraint,
			...consumableExclusionConstraint,
			...linkingConstraints,
		];

		if (avoidanceTarget > 0) {
			constraints.push(
				makeAvoidanceConstraint(
					buildScoreVars(fixedItems, decomposableItems, "avoidanceScore"),
					avoidanceTarget,
					glpk,
				),
			);
		}

		if (uncritabilityTarget > 0) {
			constraints.push(
				makeUncritableConstraint(
					buildScoreVars(fixedItems, decomposableItems, "uncritabilityScore"),
					uncritabilityTarget,
					glpk,
				),
			);
		}

		for (const { stat, target } of resistanceTargets) {
			if (target <= 0) continue;
			constraints.push(
				makeResistanceConstraint(
					buildResistanceVars(fixedItems, decomposableItems, stat),
					stat,
					target,
					glpk,
				),
			);
		}

		const model = createModel(objective, constraints, binaries);
		buildLpModelMs = stopBuildModel();

		const stopGlpkSolve = perfTrace.mark("glpkSolve");
		// Live (not perfTrace-buffered) timing around the single glpk.solve() call - past
		// investigation found multi-minute "stuck" reports were actually one pathologically slow
		// glpk.solve() call, not a runaway loop (the outer avoidance-convergence loop is bounded -
		// see runLPModelWithAvoidanceConvergence's maxIterations). Logging the variable/constraint
		// counts alongside the timing lets a slow solve be correlated with problem size.
		console.log(
			`[lp] starting glpk.solve (t=${performance.now().toFixed(0)}ms, ${model.objective.vars.length} vars, ${constraints.length} constraints)`,
		);
		const result = await glpk.solve(
			model,
			solveOptions(glpk, lpQualityOverride),
		);
		glpkSolveMs = stopGlpkSolve();
		console.log(
			`[lp] glpk.solve done in ${glpkSolveMs.toFixed(0)}ms (t=${performance.now().toFixed(0)}ms, status=${result.result.status})`,
		);
		// With MIP_GAP_TOLERANCE > 0, glpk legitimately reports GLP_FEAS (not GLP_OPT) when it
		// stops early because the best-found solution is already within that tolerance of the
		// proven bound - that's success, not a failure to find a feasible solution, so it must be
		// accepted here alongside GLP_OPT.
		if (
			result.result.status !== glpk.GLP_OPT &&
			result.result.status !== glpk.GLP_FEAS
		) {
			throw new Error(
				`No gear combination satisfies: ${describeConstraints(config)}.`,
			);
		}

		const varValues = result.result.vars as Record<string, number>;

		const stopTransform = perfTrace.mark("transformChosenItems");
		const chosenFixedItems = fixedItems.filter(
			(item) => varValues[item.uniqueId] === 1,
		);
		const chosenDecomposable = resolveChosenDecomposableItems(
			decomposableItems,
			varValues,
		).map((resolved) =>
			transformItem(
				{
					...resolved.base,
					gems: resolved.gems,
					gemSlots: resolved.gemSlots,
					enchant: resolved.enchant ?? EMPTY_ENCHANT,
					uniqueId: resolved.uniqueId,
					locked: false,
				},
				config,
			),
		);
		transformMs = stopTransform();

		return [...chosenFixedItems, ...chosenDecomposable];
	} finally {
		// No glpk.terminate() here - see getSharedGlpk's doc comment above. This instance is
		// shared and reused for the whole process's lifetime, not owned by this one call.
		const runLPModelMs = stopRunLPModel();
		perfTrace.recordGap("runLPModel", runLPModelMs, [
			glpkAcquireMs,
			buildLpModelMs,
			glpkSolveMs,
			transformMs,
		]);
	}
};

// Runs runLPModel repeatedly, tightening the avoidance/uncritability targets until the
// rounded (in-game) values actually clear them. Factored out so callers that need to
// re-solve with a different objective each round (e.g. the EHP linearization loop in
// solveEHP.ts) can reuse this convergence behavior instead of duplicating it.
export const runLPModelWithAvoidanceConvergence = async (
	fixedItems: LPItem[],
	decomposableItems: DecomposableItem[],
	config: SolverConfiguration,
	onProgress?: (progress: SolveProgress) => void,
	lpQualityOverride?: LPQualityOverride,
): Promise<LPItem[]> => {
	// defense skill is rounded down in game, but the LP solver cannot account for this so it does not round values
	// so the total avoidance/uncritability can be off by up to 1 defense skill, which is 0.16 avoidance or 0.04 uncrit
	// we step by half of the maximum error
	const AVOIDANCE_STEP = 0.16 / 2;
	const UNCRIT_STEP = 0.04 / 2;
	const MAX_AVOIDANCE_ROUNDING_ERROR = 0.16;
	const MAX_UNCRIT_ROUNDING_ERROR = 0.04;
	// worst case, each step closes the gap left by rounding error; add a small safety margin
	// since this is not a hard guarantee, just an expectation based on the rounding error bound above
	const maxIterations =
		Math.max(
			Math.ceil(MAX_AVOIDANCE_ROUNDING_ERROR / AVOIDANCE_STEP),
			Math.ceil(MAX_UNCRIT_ROUNDING_ERROR / UNCRIT_STEP),
		) + 3;

	// The real, meaningful thresholds - captured before the loop mutates config.avoidanceTarget/
	// uncritabilityTarget via stepAvoidanceTarget/stepUncritabilityTarget below. Those two fields
	// do double duty as both "the hard constraint fed to this iteration's LP solve" AND, if
	// compared against directly, "the bar the rounded result must clear" - conflating them was a
	// real bug: every failed iteration permanently raises config's own field, so checking the
	// rounded result against `config.avoidanceTarget` compares it to an ever-climbing bar instead
	// of the one fixed target that actually matters, even after the real target has long been
	// cleared (confirmed live: a run's rounded avoidance cleared the real target on iteration 2,
	// but iteration 2's own already-stepped comparison target had moved past it too, so the loop
	// kept escalating both sides in lockstep and never recognized success, right up until the
	// maxIterations bailout). The constraint fed to runLPModel below should keep escalating (that
	// part compensates for defense skill's floor-rounding, same as before) - only the success
	// check needs to stay pinned to the original target.
	const originalAvoidanceTarget = config.avoidanceTarget;
	const originalUncritabilityTarget = config.uncritabilityTarget;

	const stopOuter = perfTrace.mark("runLPModelWithAvoidanceConvergence");
	// Raw performance.now() deltas here (not perfTrace.mark()) are deliberate - runLPModel already
	// records its own "runLPModel" span internally (see its own gap-checked breakdown), so this
	// local sum is purely for this function's own recordGap below, not a second named span.
	let runLPModelTotalMs = 0;
	let result: LPItem[];
	let iteration = 0;
	try {
		while (true) {
			iteration++;
			console.log(
				`[lp] avoidance-convergence iteration ${iteration}/${maxIterations} starting (t=${performance.now().toFixed(0)}ms)`,
			);
			const runLPModelStart = performance.now();
			result = await runLPModel(
				fixedItems,
				decomposableItems,
				config.avoidanceTarget,
				config.uncritabilityTarget,
				config.resistanceTargets,
				config,
				lpQualityOverride,
			);
			runLPModelTotalMs += performance.now() - runLPModelStart;

			const itemAvoidance = calculateStatValue({
				items: result,
				modifierSources: config.multiplierModifierSources,
				baseStats: [],
				statName: config.avoidanceStatName,
				roundDefenseAndResilience: true,
			});
			const itemUncrit = calculateStatValue({
				items: result,
				modifierSources: config.multiplierModifierSources,
				baseStats: [],
				statName: "Uncritability",
				roundDefenseAndResilience: true,
			});

			const isAvoidanceTargetMet = itemAvoidance >= originalAvoidanceTarget;
			const isUncritTargetMet = itemUncrit >= originalUncritabilityTarget;
			if (isAvoidanceTargetMet && isUncritTargetMet) {
				break;
			}

			// maxIterations is a rounding-error-based expectation, not a hard guarantee (see its
			// own comment above) - stepping the target every failed iteration should converge
			// within it, but without this check a pool/config combination where it doesn't
			// (observed live: a run stuck for 2000s+ with no error) spins forever, since
			// stepAvoidanceTarget/stepUncritabilityTarget only ever raise the bar higher. Bail out
			// with the closest result found instead of hanging indefinitely.
			if (iteration >= maxIterations) {
				console.warn(
					`runLPModelWithAvoidanceConvergence: gave up after ${iteration} iterations without reaching ` +
						`avoidance target ${originalAvoidanceTarget} (got ${itemAvoidance}, LP was solving against ` +
						`escalated constraint ${config.avoidanceTarget}) / uncrit target ${originalUncritabilityTarget} ` +
						`(got ${itemUncrit}, LP was solving against escalated constraint ${config.uncritabilityTarget}) ` +
						"- returning the closest result found instead of continuing indefinitely.",
				);
				break;
			}

			console.log(
				`item avoidance: ${itemAvoidance}, real target: ${originalAvoidanceTarget}, LP constraint this iteration: ${config.avoidanceTarget}`,
			);
			console.log(
				`item uncrit: ${itemUncrit}, real target: ${originalUncritabilityTarget}, LP constraint this iteration: ${config.uncritabilityTarget}`,
			);
			if (!isAvoidanceTargetMet) {
				config.stepAvoidanceTarget(AVOIDANCE_STEP);
			}
			if (!isUncritTargetMet) {
				config.stepUncritabilityTarget(UNCRIT_STEP);
			}

			onProgress?.({ iteration, maxIterations });
		}

		return result;
	} finally {
		perfTrace.record("avoidanceConvergenceIterations", iteration);
		const outerMs = stopOuter();
		perfTrace.recordGap("runLPModelWithAvoidanceConvergence", outerMs, [
			runLPModelTotalMs,
		]);
	}
};

export const solveConfig = async (
	items: InputItem[],
	options: SolveOptions,
	onProgress?: (progress: SolveProgress) => void,
): Promise<LPItem[]> => {
	const stopSolveConfig = perfTrace.mark("solveConfig");
	console.log("worker started");
	console.log({ items, options });

	const config = new SolverConfiguration(options);
	const stopPrepare = perfTrace.mark("prepareItemCandidates");
	const { fixedItems, decomposableItems } = prepareItemCandidates(
		items,
		config,
	);
	const prepareMs = stopPrepare();

	const stopConsumables = perfTrace.mark("getConsumableLPItems");
	if (options.enabledConsumableIds.length > 0) {
		fixedItems.push(
			...getConsumableLPItems(config, options.enabledConsumableIds),
		);
	}
	const consumablesMs = stopConsumables();

	console.log(`avoidance target: ${config.avoidanceTarget}`);
	console.log(`uncritability target: ${config.uncritabilityTarget}`);
	console.log(`items: ${fixedItems.length + decomposableItems.length}`);

	// Raw performance.now() delta (not perfTrace.mark()) - runLPModelWithAvoidanceConvergence
	// already records its own named span internally, this local value is purely for this
	// function's own recordGap below.
	const convergenceStart = performance.now();
	try {
		return await runLPModelWithAvoidanceConvergence(
			fixedItems,
			decomposableItems,
			config,
			onProgress,
			options.lpQualityOverride,
		);
	} finally {
		const convergenceMs = performance.now() - convergenceStart;
		const solveConfigMs = stopSolveConfig();
		perfTrace.recordGap("solveConfig", solveConfigMs, [
			prepareMs,
			consumablesMs,
			convergenceMs,
		]);
	}
};
