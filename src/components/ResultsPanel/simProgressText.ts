// Shared "what stage is a sim-backed solve in" text, used by both LoadingResultsPlaceholder
// (a full status line) and SolveButton (a short button-label replacement). Returns undefined
// for plain "stats"/"ehp" solves, whose progress objects never set `phase`.
import type { WorkerProgressDetail } from "#/solver";

// The balance-slider objective runs three independent SLP loops back to back (see
// solveBalancedSimMetric.ts) - each restarts its own round counter from 1, so without this
// prefix a round count dropping from e.g. 3 back to 1 looks like the solve reset itself, when
// really it's just moved on to the next of the three phases.
const STAGE_LABELS: Record<
	NonNullable<WorkerProgressDetail["stage"]>,
	string
> = {
	threatEndpoint: "100% Threat",
	survivalEndpoint: "100% Survivability",
	balancing: "Balanced solve",
};

export function simProgressText(
	detail?: WorkerProgressDetail,
): string | undefined {
	if (
		!detail?.phase ||
		detail.simIteration == null ||
		detail.maxSimIterations == null
	) {
		return undefined;
	}

	const stagePrefix = detail.stage ? `${STAGE_LABELS[detail.stage]} — ` : "";
	const round = `round ${detail.simIteration + 1} of ${detail.maxSimIterations}`;

	if (detail.phase === "calibrating") {
		const {
			calibrationCompletedIterations: done,
			calibrationTotalIterations: total,
		} = detail;
		const counts =
			done != null && total
				? ` (${done.toLocaleString()} / ${total.toLocaleString()} sims)`
				: "";
		return `${stagePrefix}Calibrating ${round}${counts}…`;
	}

	return `${stagePrefix}Solving ${round}…`;
}
