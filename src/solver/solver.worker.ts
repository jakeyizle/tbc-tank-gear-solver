import type { BalanceEndpoint } from "#/sim/solveBalancedSimMetric";
import type { SolveOptions } from "./solveConfig";
import { solveGearSet } from "./solveEHP";
import type { InputItem } from "./types";

self.onmessage = async (e) => {
	const { items, options, cachedEndpoints } = e.data as {
		items: InputItem[];
		options: SolveOptions;
		cachedEndpoints?: { threat: BalanceEndpoint; survival: BalanceEndpoint };
	};

	try {
		let result: Awaited<ReturnType<typeof solveGearSet>>;
		if (options.objectiveMode === "simWeighted" && options.simBalance) {
			// Dispatched here rather than from solveGearSet/solveEHP.ts so src/solver/ (the
			// generic LP core) never has to import from src/sim/ (the tbc-new integration) -
			// see docs/plans/sim-backed-objectives.md's "Open decisions" note.
			const [
				{ solveBalancedSimMetric },
				{ loadTbcDatabase },
				{ PROT_PALADIN_BASELINE_GEAR },
				{ DEFAULT_SIM_CALIBRATION_PROFILE },
			] = await Promise.all([
				import("#/sim/solveBalancedSimMetric"),
				import("#/sim/simDatabaseClient"),
				import("#/sim/protPaladinBaselineGear"),
				import("#/types/SimCalibrationProfile"),
			]);
			const db = await loadTbcDatabase();
			const simResult = await solveBalancedSimMetric(
				items,
				options,
				PROT_PALADIN_BASELINE_GEAR,
				db,
				options.simBalance.balance,
				options.survivabilityMetric ?? "tmi",
				options.simCalibrationProfile ?? DEFAULT_SIM_CALIBRATION_PROFILE,
				(progress) => postMessage({ type: "progress", ...progress }),
				cachedEndpoints,
			);
			result = simResult.items;
			postMessage({
				type: "result",
				items: result,
				simMetrics: simResult.simMetrics,
				statWeights: simResult.finalStatWeights,
				statWeightStdevs: simResult.finalStatWeightStdevs,
				simBalanceEndpoints: {
					threat: simResult.threatEndpoint,
					survival: simResult.survivalEndpoint,
				},
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
