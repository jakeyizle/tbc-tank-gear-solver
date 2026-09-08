import Box from "@mui/material/Box";
import LinearProgress from "@mui/material/LinearProgress";
import Typography from "@mui/material/Typography";
import { useEffect, useRef, useState } from "react";
import type { SolveAllProgress } from "#/solver";
import { simProgressText } from "./simProgressText";

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

	// Identifies the current user-visible stage: which config, which sim-backed round (if any),
	// and which phase within that round. Changing any of these means the stage timer below should
	// restart - a plain stats/ehp solve (no phase/simIteration at all) has just one stage per
	// config, so it falls back to a key that only changes when the config itself changes.
	const stageKey = solveProgress
		? `${solveProgress.configIndex}:${solveProgress.detail?.phase ?? "lp"}:${solveProgress.detail?.simIteration ?? 0}`
		: "idle";

	// Tracked via refs (not state) so switching stages doesn't need its own effect/dependency
	// array - a plain render-time ref comparison resets the start timestamp the instant the key
	// changes, and the shared 1s tick above (elapsedSeconds' interval) is reused to re-render.
	const stageKeyRef = useRef(stageKey);
	const stageStartedAtRef = useRef(Date.now());
	if (stageKeyRef.current !== stageKey) {
		stageKeyRef.current = stageKey;
		stageStartedAtRef.current = Date.now();
	}
	const stageElapsedSeconds = Math.floor(
		(Date.now() - stageStartedAtRef.current) / 1000,
	);

	const progressValue = solveProgress
		? Math.min(
				((solveProgress.configIndex + solveProgress.innerFraction) /
					solveProgress.totalConfigs) *
					100,
				99,
			)
		: 0;
	const simText = simProgressText(solveProgress?.detail);

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
					Solving "{solveProgress.configName}" ({solveProgress.configIndex + 1}{" "}
					of {solveProgress.totalConfigs})…
				</Typography>
			)}
			{simText && (
				<Typography variant="body2" color="text.secondary">
					{simText}
				</Typography>
			)}
			<Typography variant="caption" color="text.secondary">
				{stageElapsedSeconds}s in this stage · {elapsedSeconds}s elapsed
			</Typography>
		</Box>
	);
}
