import Button from "@mui/material/Button";
import type { SolveAllProgress } from "#/solver";

interface SolveButtonProps {
	onSolve: () => void;
	isSolving: boolean;
	setCount: number;
	solveProgress?: SolveAllProgress | null;
}

export default function SolveButton({
	onSolve,
	isSolving,
	setCount,
	solveProgress,
}: SolveButtonProps) {
	const label = solveProgress
		? `Solving set ${solveProgress.configIndex + 1} of ${solveProgress.totalConfigs}…`
		: "Solving…";

	return (
		<Button
			variant="contained"
			size="large"
			fullWidth
			onClick={onSolve}
			disabled={isSolving || setCount === 0}
		>
			{isSolving ? label : `Solve all ${setCount} ${setCount === 1 ? "set" : "sets"}`}
		</Button>
	);
}
