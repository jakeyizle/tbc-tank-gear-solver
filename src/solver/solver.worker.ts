import { loadTbcDomainDatabase } from "#/data/tbcDatabase";
import { perfTrace } from "#/helpers/perfTrace";
import {
	type CalibratedWeights,
	measureFinalSimMetrics,
	metricRatiosForBalance,
} from "#/sim/calibrateWeights";
import { deriveLinearModel } from "#/sim/deriveLinearModel";
import { measureCharacterStats } from "#/sim/measureCharacterStats";
import { PROT_PALADIN_BASELINE_GEAR } from "#/sim/protPaladinBaselineGear";
import { splitGearAndConsumables } from "#/sim/resolveGearAndConsumables";
import { loadTbcDatabase } from "#/sim/simDatabaseClient";
import { solveConfigForSimMetric } from "#/sim/solveSimMetric";
import { loadWasm } from "#/sim/wasmCoordinator";
import { DEFAULT_SIM_CALIBRATION_PROFILE } from "#/types/SimCalibrationProfile";
import { indexItemDatabase } from "./itemDatabase";
import type { SolveOptions } from "./solveConfig";
import { solveGearSet } from "./solveEHP";
import type { InputItem } from "./types";

// The one place src/solver/ is allowed to reach into src/sim/. Everywhere else in the solver
// that boundary is enforced by biome (see biome.json's noRestrictedImports override), because
// the LP core is generic over its stat model and must stay that way.
//
// These used to be dynamic import()s for the same reason, which cost a round trip and bought
// nothing: every one of them was awaited unconditionally at the top of onmessage, so the split
// chunk was always fetched immediately after the Worker booted. Now that the Worker is shared
// for the session (see src/solver/index.ts) that cost would have been paid once rather than
// per solve, but a lint rule states the constraint directly instead of encoding it in a
// module-loading trick that reads like a performance decision.

// Every request carries an id and every reply echoes it. This Worker is now shared across
// solves and across the configs within one solve (see src/solver/index.ts), so "the message
// that just arrived belongs to the solve that is currently awaiting" is no longer automatic -
// a progress message from an abandoned request must not be routed to its successor.
interface SolveRequest {
	type?: "solve";
	requestId: number;
	items: InputItem[];
	// The main thread does not have the sim loaded, so it cannot build the stat model or the
	// item pool - both happen here, below, before anything is solved.
	options: Omit<SolveOptions, "linearModel" | "itemDatabase">;
	// Round 1's weights from a previous solve with the same profile/metric blend, computed on
	// the main thread (this Worker has no `localStorage` to read the cache itself) - see
	// solver/index.ts's round1CacheKeyFor and round1WeightsCache.ts.
	precomputedRound1?: CalibratedWeights;
}

// Sent once at app mount so the two fixed, profile-independent costs of a solve - instantiating
// the 37MB Go wasm and fetching + parsing + adapting the 3.1MB database - are already paid by
// the time the user presses Solve. Both memoize at module scope, which only became worth warming
// when this Worker started outliving a single solve.
interface WarmRequest {
	type: "warm";
	requestId: number;
}

type WorkerRequest = SolveRequest | WarmRequest;

async function warm(): Promise<void> {
	// Deliberately not deriveLinearModel: that depends on the calibration profile, which the
	// user may still edit before solving. These two do not depend on it at all.
	await Promise.all([loadWasm(), loadTbcDomainDatabase()]);
}

self.onmessage = async (e) => {
	const request = e.data as WorkerRequest;
	const { requestId } = request;

	try {
		if (request.type === "warm") {
			await warm();
			postMessage({ type: "warmed", requestId });
			return;
		}

		const { items, options, precomputedRound1 } = request;
		const db = await loadTbcDatabase();
		const profile =
			options.simCalibrationProfile ?? DEFAULT_SIM_CALIBRATION_PROFILE;

		// THE handoff from "what the game does" to "what the LP optimizes". Everything the
		// solver knows about race, talents, buffs, debuffs, consumables and stat conversions
		// arrives in this one object, measured from the sim - see src/sim/deriveLinearModel.ts.
		// One derivation per solve, shared by every SolverConfiguration the solve builds.
		//
		// Across solves this is now usually free: computeStatsClient memoizes on request
		// content, and that cache survives with the Worker, so a re-solve at an unchanged
		// profile replays the ~25 probes from memory instead of the wasm.
		const linearModel = await perfTrace.timeAsync("deriveLinearModel", () =>
			deriveLinearModel(db, profile),
		);
		// The same db.json that feeds the sim is also the solver's item pool now - one fetch,
		// no bundled item JSON, and an item the app has never heard of is simply accepted.
		// loadTbcDomainDatabase shares that single fetch and memoizes the adaptation.
		const itemDatabase = indexItemDatabase(await loadTbcDomainDatabase());
		const solveOptions: SolveOptions = {
			...options,
			linearModel,
			itemDatabase,
		};

		let result: Awaited<ReturnType<typeof solveGearSet>>;
		if (
			solveOptions.objectiveMode === "tps" ||
			solveOptions.objectiveMode === "dtps" ||
			solveOptions.objectiveMode === "tmi" ||
			solveOptions.objectiveMode === "balanced"
		) {
			const metricRatios =

				solveOptions.objectiveMode === "balanced"
					? metricRatiosForBalance(
							solveOptions.balance ?? 0.5,
							solveOptions.survivabilityMetric ?? "tmi",
						)
					: { [solveOptions.objectiveMode]: 1 };
			const simResult = await solveConfigForSimMetric(
				items,
				solveOptions,
				PROT_PALADIN_BASELINE_GEAR,
				db,
				metricRatios,
				profile,
				(progress) => postMessage({ type: "progress", requestId, ...progress }),
				precomputedRound1,
			);
			result = simResult.items;
			const characterStats = await measureCharacterStats(result, db, profile);
			// solveConfigForSimMetric already reset/logged its own trace internally (see its own
			// perfTrace.reset()/log() calls) - just forward the summary to the main thread so it's
			// visible without switching DevTools' worker-context dropdown (see src/solver/index.ts).
			postMessage({ type: "perf", requestId, summary: perfTrace.summary() });
			postMessage({
				type: "result",
				requestId,
				items: result,
				simMetrics: simResult.simMetrics,
				perMetricStatWeights: simResult.finalPerMetricStatWeights,
				perMetricStatWeightStdevs: simResult.finalPerMetricStatWeightStdevs,
				round1StatWeights: simResult.round1StatWeights,
				characterStats,
				physicalDamageTakenMultiplier:
					linearModel.physicalDamageTakenMultiplier,
			});
			return;
		}
		// Plain "stats"/"ehp"/"hardAvoidance" solves don't go through solveConfigForSimMetric
		// (which resets/logs its own trace), so do the same bookkeeping here - solveConfig.ts's
		// instrumentation (prepareItemCandidates/GLPK/runLPModel spans) benefits these solve
		// modes too.
		perfTrace.reset();
		result = await solveGearSet(items, solveOptions, (progress) =>
			postMessage({ type: "progress", requestId, ...progress }),
		);
		perfTrace.log("solve");
		postMessage({ type: "perf", requestId, summary: perfTrace.summary() });

		// These modes never calibrate against the sim, but the finished gear is exactly what
		// measureFinalSimMetrics needs - run the same one-shot "finalize and measure" step the
		// sim-backed branch above uses (see its own comment) so TPS/DTPS/TMI-5 display for every
		// objective mode, not just the sim-backed ones.
		const { gear, consumables } = splitGearAndConsumables(result);
		const simMetrics = await measureFinalSimMetrics(gear, db, {
			...profile,
			raidProfile: {
				...profile.raidProfile,
				consumables: { ...profile.raidProfile.consumables, ...consumables },
			},
		});

		// measureCharacterStats re-merges the solved consumables itself, so it takes the
		// unmerged profile - not the one measureFinalSimMetrics was handed above.
		const characterStats = await measureCharacterStats(result, db, profile);

		postMessage({
			type: "result",
			requestId,
			items: result,
			simMetrics,
			characterStats,
			physicalDamageTakenMultiplier: linearModel.physicalDamageTakenMultiplier,
		});
	} catch (error) {
		console.error(error);
		postMessage({
			type: "error",
			requestId,
			message: error instanceof Error ? error.message : String(error),
		});
	}
};
