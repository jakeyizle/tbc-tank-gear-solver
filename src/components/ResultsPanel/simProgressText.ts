// Shared "what stage is a sim-backed solve in" text, used by both LoadingResultsPlaceholder
// (a full status line) and SolveButton (a short button-label replacement). Returns undefined
// for plain "stats"/"ehp" solves, whose progress objects never set `phase`.
import type { WorkerProgressDetail } from "#/solver";

// completedIterations/totalIterations count individual sim iterations summed across every
// stat-perturbation job in the batch; completedSims/totalSims count the jobs themselves (each a
// full raid-sim run). Both are real, different quantities - show both when the sims count is
// available rather than mislabeling the iteration count as a "sims" count (see
// calibrateWeights.ts's CalibrationProgress).
function formatCounts(detail: WorkerProgressDetail): string {
	const {
		calibrationCompletedIterations: doneIterations,
		calibrationTotalIterations: totalIterations,
		calibrationCompletedSims: doneSims,
		calibrationTotalSims: totalSims,
	} = detail;
	if (doneIterations == null || !totalIterations) return "";
	const iterationsText = `${doneIterations.toLocaleString()} / ${totalIterations.toLocaleString()} iterations`;
	const simsText =
		doneSims != null && totalSims
			? `, ${doneSims.toLocaleString()} / ${totalSims.toLocaleString()} sims`
			: "";
	return ` (${iterationsText}${simsText})`;
}

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
		return `Simulating ${round}${formatCounts(detail)}…`;
	}

	if (detail.phase === "measuring") {
		return `Measuring final result${formatCounts(detail)}…`;
	}

	return `Solving ${round}…`;
}
