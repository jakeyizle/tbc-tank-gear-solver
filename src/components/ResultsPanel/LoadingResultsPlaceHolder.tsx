import Box from "@mui/material/Box";
import LinearProgress from "@mui/material/LinearProgress";
import Typography from "@mui/material/Typography";
import { useEffect, useState } from "react";
import type { SolveAllProgress } from "#/solver";

interface LoadingResultsPlaceholderProps {
	solveProgress?: SolveAllProgress | null;
}

export default function LoadingResultsPlaceholder({
	solveProgress,
}: LoadingResultsPlaceholderProps) {
	const [elapsedSeconds, setElapsedSeconds] = useState(0);

	useEffect(() => {
		setElapsedSeconds(0);
		const intervalId = setInterval(() => {
			setElapsedSeconds((seconds) => seconds + 1);
		}, 1000);
		return () => clearInterval(intervalId);
	}, []);

	const progressValue = solveProgress
		? Math.min(
				((solveProgress.configIndex + solveProgress.innerFraction) /
					solveProgress.totalConfigs) *
					100,
				99,
			)
		: 0;

	return (
		<Box
			sx={{
				display: "flex",
				justifyContent: "center",
				alignItems: "center",
				flexDirection: "column",
				height: "100vh",
				gap: 1.5,
				px: 4,
			}}
		>
			<Box sx={{ width: "100%", maxWidth: 320 }}>
				<LinearProgress
					aria-label="Solving…"
					variant={solveProgress ? "determinate" : "indeterminate"}
					value={progressValue}
				/>
			</Box>
			{solveProgress && (
				<Typography variant="body2" color="text.secondary">
					Solving "{solveProgress.configName}" ({solveProgress.configIndex + 1} of{" "}
					{solveProgress.totalConfigs})…
				</Typography>
			)}
			<Typography variant="caption" color="text.secondary">
				{elapsedSeconds}s elapsed
			</Typography>
		</Box>
	);
}
