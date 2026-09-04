// The "balance slider" objective: a single 0..1 dial between pure Threat (TPS) and pure
// Survivability (TMI-5), implemented as an epsilon-constraint (see docs/plans/sim-backed-
// objectives.md's rejection of a raw weighted-ratio blend for exactly the reason this replaces -
// different metrics' calibrated weights live on incomparable scales, so a ratio like {tps:1,
// tmi:1} never means what it looks like it means) anchored to two real, sim-verified endpoints
// instead of a raw threshold the user would have no intuition for.
//
// Mechanism: solve the pure-TPS optimum and the pure-TMI optimum once (the "endpoints"), then
// interpolate a TMI-5 ceiling between the two endpoints' own achieved TMI-5 values according to
// the slider position, and solve once more maximizing TPS subject to that ceiling. At balance=1
// the ceiling is exactly the threat-endpoint's own TMI-5 (trivially satisfied by that same gear);
// at balance=0 it's the tightest achievable TMI-5 (the survival-endpoint's own value) - see
// solveSimMetric.ts's deriveSecondaryConstraintBound for the per-round linearization this relies
// on every SLP round of the final constrained solve.

import type { SolveOptions } from "#/solver/solveConfig";
import type { InputItem, LPItem, Stat } from "#/solver/types";
import type {
	SimCalibrationProfile,
	SimMetricsSnapshot,
} from "#/types/SimCalibrationProfile";
import type { TbcUiDatabase } from "./buildStatWeightsRequest";
import {
	type SimMetricSolveProgress,
	solveConfigForSimMetric,
} from "./solveSimMetric";
import { resetWasmClient } from "./statWeightsClient";
import type { GearPiece } from "./toTbcItemSpec";

// A single-metric endpoint solve's result, stripped down to what the balance slider needs: its
// own achieved absolute metrics (to anchor the interpolation and show the UI real numbers) and
// the weight vector that produced it (displayable the same way a plain single-metric solve's
// stat weights already are - see StatsSummary.tsx).
export interface BalanceEndpoint {
	simMetrics: SimMetricsSnapshot;
	finalStatWeights: Stat[];
	finalStatWeightStdevs: Stat[];
}

export type BalanceSolveStage =
	| "threatEndpoint"
	| "survivalEndpoint"
	| "balancing";

export interface BalanceSolveProgress extends SimMetricSolveProgress {
	stage: BalanceSolveStage;
}

export interface SimBalanceSolveResult {
	items: LPItem[];
	iterations: number;
	converged: boolean;
	simMetrics: SimMetricsSnapshot;
	finalStatWeights: Stat[];
	finalStatWeightStdevs: Stat[];
	// The two real anchors the slider is interpolating between - for the UI to display alongside
	// the slider (e.g. "100% Threat: 5,200 TPS / 9.8 TMI-5") so a `balance` value is never shown
	// as a bare, uninterpretable number.
	threatEndpoint: BalanceEndpoint;
	survivalEndpoint: BalanceEndpoint;
}

function toBalanceEndpoint(result: {
	simMetrics: SimMetricsSnapshot;
	finalStatWeights: Stat[];
	finalStatWeightStdevs: Stat[];
}): BalanceEndpoint {
	return {
		simMetrics: result.simMetrics,
		finalStatWeights: result.finalStatWeights,
		finalStatWeightStdevs: result.finalStatWeightStdevs,
	};
}

/**
 * Interpolates a TMI-5 ceiling between the survival endpoint's own achieved value (t=0, tightest
 * possible) and the threat endpoint's own achieved value (t=1, loosest useful bound - anything
 * looser wouldn't constrain the threat-maximizing solve at all). Extracted as a pure function so
 * the interpolation math - the one place a swapped endpoint would silently invert the whole
 * slider - is directly unit-testable without a real sim.
 */
export function interpolateTmiCeiling(
	balance: number,
	threatEndpointTmi: number,
	survivalEndpointTmi: number,
): number {
	const t = Math.min(1, Math.max(0, balance));
	return survivalEndpointTmi + t * (threatEndpointTmi - survivalEndpointTmi);
}

/**
 * Solves for a `balance`-weighted point on the Threat/Survivability tradeoff curve for a
 * Protection Paladin - see this file's header comment for the mechanism. Callers that already
 * have both endpoints cached (see simBalanceCache.ts - the two endpoints only depend on the item
 * pool/options/profile, not on `balance`) can pass them in via `cachedEndpoints` to skip straight
 * to the cheaper final constrained solve.
 */
export async function solveBalancedSimMetric(
	items: InputItem[],
	options: Omit<SolveOptions, "optimizeStats" | "objectiveMode">,
	baselineGear: GearPiece[],
	db: TbcUiDatabase,
	balance: number,
	profile: SimCalibrationProfile,
	onProgress?: (progress: BalanceSolveProgress) => void,
	cachedEndpoints?: { threat: BalanceEndpoint; survival: BalanceEndpoint },
): Promise<SimBalanceSolveResult> {
	let threatEndpoint: BalanceEndpoint;
	let survivalEndpoint: BalanceEndpoint;

	if (cachedEndpoints) {
		({ threat: threatEndpoint, survival: survivalEndpoint } = cachedEndpoints);
	} else {
		const threatResult = await solveConfigForSimMetric(
			items,
			options,
			baselineGear,
			db,
			{ tps: 1 },
			profile,
			(progress) => onProgress?.({ ...progress, stage: "threatEndpoint" }),
		);
		threatEndpoint = toBalanceEndpoint(threatResult);

		// See resetWasmClient's own doc comment: without this, the wasm instances backing the
		// threat endpoint's full SLP loop stay resident (Go's wasm memory never shrinks back to
		// the host) while the survival endpoint's own full SLP loop piles on top of them in the
		// same worker - observed to run the tab out of memory before this reset was added.
		resetWasmClient();

		const survivalResult = await solveConfigForSimMetric(
			items,
			options,
			baselineGear,
			db,
			{ tmi: 1 },
			profile,
			(progress) => onProgress?.({ ...progress, stage: "survivalEndpoint" }),
		);
		survivalEndpoint = toBalanceEndpoint(survivalResult);

		// Same reasoning as above, once more before the final constrained solve's own SLP loop.
		resetWasmClient();
	}

	const tmiCeiling = interpolateTmiCeiling(
		balance,
		threatEndpoint.simMetrics.tmi5,
		survivalEndpoint.simMetrics.tmi5,
	);

	// Seeded from baselineGear (same as the endpoints, not threatEndpoint's own gear) - solveSim-
	// ConfigForSimMetric always calibrates round 1 around a fixed baseline (see its own doc
	// comment), so there's no meaningful "closer" starting point to seed from here.
	const balancedResult = await solveConfigForSimMetric(
		items,
		options,
		baselineGear,
		db,
		{ tps: 1 },
		profile,
		(progress) => onProgress?.({ ...progress, stage: "balancing" }),
		undefined,
		{ metric: "tmi", targetAbsolute: tmiCeiling, kind: "ceiling" },
	);

	return {
		items: balancedResult.items,
		iterations: balancedResult.iterations,
		converged: balancedResult.converged,
		simMetrics: balancedResult.simMetrics,
		finalStatWeights: balancedResult.finalStatWeights,
		finalStatWeightStdevs: balancedResult.finalStatWeightStdevs,
		threatEndpoint,
		survivalEndpoint,
	};
}
