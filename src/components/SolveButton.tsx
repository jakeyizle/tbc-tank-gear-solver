import Button from "@mui/material/Button";

interface SolveButtonProps {
	onSolve: () => void;
	isSolving: boolean;
	setCount: number;
}

export default function SolveButton({ onSolve, isSolving, setCount }: SolveButtonProps) {
	return (
		<Button
			variant="contained"
			size="large"
			fullWidth
			onClick={onSolve}
			disabled={isSolving || setCount === 0}
		>
			{isSolving
				? "Solving…"
				: `Solve all ${setCount} ${setCount === 1 ? "set" : "sets"}`}
		</Button>
	);
}
