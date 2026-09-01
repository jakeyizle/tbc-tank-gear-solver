import type { SolveOptions } from "./solveConfig";
import { solveGearSet } from "./solveEHP";
import type { InputItem } from "./types";

// objectiveMode's public "tmi5" is distinct from calibrateWeights.ts's internal SimMetric
// ("tmi") - the former is a user-facing UI value, the latter matches tbc-new's own
// StatWeightsResult field name. Kept as a separate mapping rather than renaming one to match
// the other, since "TMI-5" (the actual metric name) reads oddly as a bare "tmi" in the UI.
const SIM_METRIC_BY_OBJECTIVE_MODE = {
	tps: "tps",
	dtps: "dtps",
	tmi5: "tmi",
} as const;

self.onmessage = async (e) => {
	const { items, options } = e.data as {
		items: InputItem[];
		options: SolveOptions;
	};

	try {
		const simMetric = options.objectiveMode
			? SIM_METRIC_BY_OBJECTIVE_MODE[
					options.objectiveMode as keyof typeof SIM_METRIC_BY_OBJECTIVE_MODE
				]
			: undefined;

		let result: Awaited<ReturnType<typeof solveGearSet>>;
		if (simMetric) {
			// Dispatched here rather than from solveGearSet/solveEHP.ts so src/solver/ (the
			// generic LP core) never has to import from src/sim/ (the tbc-new integration) -
			// see docs/plans/sim-backed-objectives.md's "Open decisions" note.
			const [
				{ solveConfigForSimMetric },
				{ loadTbcDatabase },
				{ PROT_PALADIN_BASELINE_GEAR },
			] = await Promise.all([
				import("#/sim/solveSimMetric"),
				import("#/sim/simDatabaseClient"),
				import("#/sim/protPaladinBaselineGear"),
			]);
			const db = await loadTbcDatabase();
			const simResult = await solveConfigForSimMetric(
				items,
				options,
				PROT_PALADIN_BASELINE_GEAR,
				db,
				simMetric,
				(progress) => postMessage({ type: "progress", ...progress }),
			);
			result = simResult.items;
		} else {
			result = await solveGearSet(items, options, (progress) =>
				postMessage({ type: "progress", ...progress }),
			);
		}

		postMessage({ type: "result", items: result });
	} catch (error) {
		postMessage({
			type: "error",
			message: error instanceof Error ? error.message : String(error),
		});
	}
};
