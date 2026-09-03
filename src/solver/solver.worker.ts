import type { SolveOptions } from "./solveConfig";
import { solveGearSet } from "./solveEHP";
import type { InputItem } from "./types";

// The public simMetricWeights key "tmi5" is distinct from calibrateWeights.ts's internal
// SimMetric ("tmi") - the former is a user-facing UI value, the latter matches tbc-new's own
// StatWeightsResult field name. Kept as a separate mapping rather than renaming one to match
// the other, since "TMI-5" (the actual metric name) reads oddly as a bare "tmi" in the UI.
function toMetricRatios(
	simMetricWeights: NonNullable<SolveOptions["simMetricWeights"]>,
): Partial<Record<"tps" | "dtps" | "tmi", number>> {
	return {
		tps: simMetricWeights.tps,
		dtps: simMetricWeights.dtps,
		tmi: simMetricWeights.tmi5,
	};
}

self.onmessage = async (e) => {
	const { items, options } = e.data as {
		items: InputItem[];
		options: SolveOptions;
	};

	try {
		let result: Awaited<ReturnType<typeof solveGearSet>>;
		if (options.objectiveMode === "simWeighted" && options.simMetricWeights) {
			// Dispatched here rather than from solveGearSet/solveEHP.ts so src/solver/ (the
			// generic LP core) never has to import from src/sim/ (the tbc-new integration) -
			// see docs/plans/sim-backed-objectives.md's "Open decisions" note.
			const [
				{ solveConfigForSimMetric },
				{ loadTbcDatabase },
				{ PROT_PALADIN_BASELINE_GEAR },
				{ DEFAULT_SIM_CALIBRATION_PROFILE },
			] = await Promise.all([
				import("#/sim/solveSimMetric"),
				import("#/sim/simDatabaseClient"),
				import("#/sim/protPaladinBaselineGear"),
				import("#/types/SimCalibrationProfile"),
			]);
			const db = await loadTbcDatabase();
			const simResult = await solveConfigForSimMetric(
				items,
				options,
				PROT_PALADIN_BASELINE_GEAR,
				db,
				toMetricRatios(options.simMetricWeights),
				options.simCalibrationProfile ?? DEFAULT_SIM_CALIBRATION_PROFILE,
				(progress) => postMessage({ type: "progress", ...progress }),
			);
			result = simResult.items;
			postMessage({
				type: "result",
				items: result,
				simMetrics: simResult.simMetrics,
			});
			return;
		}
		result = await solveGearSet(items, options, (progress) =>
			postMessage({ type: "progress", ...progress }),
		);

		postMessage({ type: "result", items: result });
	} catch (error) {
		postMessage({
			type: "error",
			message: error instanceof Error ? error.message : String(error),
		});
	}
};
