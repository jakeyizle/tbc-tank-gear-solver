import Button from "@mui/material/Button";

interface SolveButtonProps {
	onSolve: () => void;
	isSolving: boolean;
}

export default function SolveButton({ onSolve, isSolving }: SolveButtonProps) {
	return (
		<Button
			variant="contained"
			size="large"
			fullWidth
			onClick={onSolve}
			disabled={isSolving}
		>
			{isSolving ? "Solving..." : "Solve All"}
		</Button>
	);
}
