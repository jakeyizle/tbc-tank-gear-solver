import type { CalibratedWeights } from "#/sim/calibrateWeights";
import type { SolveOptions } from "./solveConfig";
import { solveGearSet } from "./solveEHP";
import type { InputItem } from "./types";

self.onmessage = async (e) => {
	const { items, options, precomputedRound1 } = e.data as {
		items: InputItem[];
		options: SolveOptions;
		// Round 1's weights from a previous solve with the same profile/metric blend, computed on
		// the main thread (this Worker has no `localStorage` to read the cache itself) - see
		// solver/index.ts's round1CacheKeyFor and round1WeightsCache.ts.
		precomputedRound1?: CalibratedWeights;
	};

	try {
		let result: Awaited<ReturnType<typeof solveGearSet>>;
		if (
			options.objectiveMode === "tps" ||
			options.objectiveMode === "dtps" ||
			options.objectiveMode === "tmi" ||
			options.objectiveMode === "balanced"
		) {
			// Dispatched here rather than from solveGearSet/solveEHP.ts so src/solver/ (the
			// generic LP core) never has to import from src/sim/ (the tbc-new integration) -
			// see docs/plans/sim-backed-objectives.md's "Open decisions" note.
			const [
				{ solveConfigForSimMetric },
				{ metricRatiosForBalance },
				{ loadTbcDatabase },
				{ PROT_PALADIN_BASELINE_GEAR },
				{ DEFAULT_SIM_CALIBRATION_PROFILE },
			] = await Promise.all([
				import("#/sim/solveSimMetric"),
				import("#/sim/calibrateWeights"),
				import("#/sim/simDatabaseClient"),
				import("#/sim/protPaladinBaselineGear"),
				import("#/types/SimCalibrationProfile"),
			]);
			const db = await loadTbcDatabase();
			const metricRatios =
				options.objectiveMode === "balanced"
					? metricRatiosForBalance(
							options.balance ?? 0.5,
							options.survivabilityMetric ?? "tmi",
						)
					: { [options.objectiveMode]: 1 };
			const simResult = await solveConfigForSimMetric(
				items,
				options,
				PROT_PALADIN_BASELINE_GEAR,
				db,
				metricRatios,
				options.simCalibrationProfile ?? DEFAULT_SIM_CALIBRATION_PROFILE,
				(progress) => postMessage({ type: "progress", ...progress }),
				precomputedRound1,
			);
			result = simResult.items;
			postMessage({
				type: "result",
				items: result,
				simMetrics: simResult.simMetrics,
				perMetricStatWeights: simResult.finalPerMetricStatWeights,
				perMetricStatWeightStdevs: simResult.finalPerMetricStatWeightStdevs,
				round1StatWeights: simResult.round1StatWeights,
			});
			return;
		}
		result = await solveGearSet(items, options, (progress) =>
			postMessage({ type: "progress", ...progress }),
		);

		postMessage({ type: "result", items: result });
	} catch (error) {
		console.error(error);
		postMessage({
			type: "error",
			message: error instanceof Error ? error.message : String(error),
		});
	}
};
