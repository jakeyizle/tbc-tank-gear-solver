// Shared "what stage is a sim-backed solve in" text, used by both LoadingResultsPlaceholder
// (a full status line) and SolveButton (a short button-label replacement). Returns undefined
// for plain "stats"/"ehp" solves, whose progress objects never set `phase`.
import type { WorkerProgressDetail } from "#/solver";

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
		return `Calibrating ${round}${counts}…`;
	}

	return `Solving ${round}…`;
}
