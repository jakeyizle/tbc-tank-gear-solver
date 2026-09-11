import { perfTrace } from "#/helpers/perfTrace";
import type { CalibratedWeights } from "#/sim/calibrateWeights";
import type { SolveOptions } from "./solveConfig";
import { solveGearSet } from "./solveEHP";
import type { InputItem } from "./types";

self.onmessage = async (e) => {
	const { items, options, precomputedRound1 } = e.data as {
		items: InputItem[];
		// The main thread does not have the sim loaded, so it cannot build the stat model or the
		// item pool - both happen here, below, before anything is solved.
		options: Omit<SolveOptions, "linearModel" | "itemDatabase">;
		// Round 1's weights from a previous solve with the same profile/metric blend, computed on
		// the main thread (this Worker has no `localStorage` to read the cache itself) - see
		// solver/index.ts's round1CacheKeyFor and round1WeightsCache.ts.
		precomputedRound1?: CalibratedWeights;
	};

	try {
		// Dynamically imported so src/solver/ (the generic LP core) never statically imports
		// src/sim/ (the tbc-new integration) - see docs/plans/sim-backed-objectives.md's
		// "Open decisions" note.
		const [
			{ loadTbcDatabase },
			{ DEFAULT_SIM_CALIBRATION_PROFILE },
			{ deriveLinearModel },
			{ measureCharacterStats },
			{ loadTbcDomainDatabase },
			{ indexItemDatabase },
		] = await Promise.all([
			import("#/sim/simDatabaseClient"),
			import("#/types/SimCalibrationProfile"),
			import("#/sim/deriveLinearModel"),
			import("#/sim/measureCharacterStats"),
			import("#/data/tbcDatabase"),
			import("./itemDatabase"),
		]);
		const db = await loadTbcDatabase();
		const profile =
			options.simCalibrationProfile ?? DEFAULT_SIM_CALIBRATION_PROFILE;

		// THE handoff from "what the game does" to "what the LP optimizes". Everything the
		// solver knows about race, talents, buffs, debuffs, consumables and stat conversions
		// arrives in this one object, measured from the sim - see src/sim/deriveLinearModel.ts.
		// One derivation per solve, shared by every SolverConfiguration the solve builds.
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
			const [
				{ solveConfigForSimMetric },
				{ metricRatiosForBalance },
				{ PROT_PALADIN_BASELINE_GEAR },
			] = await Promise.all([
				import("#/sim/solveSimMetric"),
				import("#/sim/calibrateWeights"),
				import("#/sim/protPaladinBaselineGear"),
			]);
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
				(progress) => postMessage({ type: "progress", ...progress }),
				precomputedRound1,
			);
			result = simResult.items;
			const characterStats = await measureCharacterStats(result, db, profile);
			// solveConfigForSimMetric already reset/logged its own trace internally (see its own
			// perfTrace.reset()/log() calls) - just forward the summary to the main thread so it's
			// visible without switching DevTools' worker-context dropdown (see src/solver/index.ts).
			postMessage({ type: "perf", summary: perfTrace.summary() });
			postMessage({
				type: "result",
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
			postMessage({ type: "progress", ...progress }),
		);
		perfTrace.log("solve");
		postMessage({ type: "perf", summary: perfTrace.summary() });

		// These modes never calibrate against the sim, but the finished gear is exactly what
		// measureFinalSimMetrics needs - run the same one-shot "finalize and measure" step the
		// sim-backed branch above uses (see its own comment) so TPS/DTPS/TMI-5 display for every
		// objective mode, not just the sim-backed ones.
		const [{ splitGearAndConsumables }, { measureFinalSimMetrics }] =
			await Promise.all([
				import("#/sim/resolveGearAndConsumables"),
				import("#/sim/calibrateWeights"),
			]);
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
			items: result,
			simMetrics,
			characterStats,
			physicalDamageTakenMultiplier: linearModel.physicalDamageTakenMultiplier,
		});
	} catch (error) {
		console.error(error);
		postMessage({
			type: "error",
			message: error instanceof Error ? error.message : String(error),
		});
	}
};
