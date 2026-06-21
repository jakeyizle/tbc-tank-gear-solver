import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import type { SolveResult } from "#/types/SolverConfig";

interface ResultsTabsProps {
	solveResults: Map<string, SolveResult>;
	activeResultId: string | null;
	onResultChange: (resultId: string) => void;
}

export default function ResultsTabs({
	solveResults,
	activeResultId,
	onResultChange,
}: ResultsTabsProps) {
	return (
		<Tabs
			value={activeResultId || ""}
			onChange={(_, newValue) => onResultChange(newValue)}
			variant="scrollable"
			scrollButtons="auto"
			sx={{
				borderBottom: 1,
				borderColor: "divider",
				"& .MuiTab-root": {
					minWidth: 120,
					textTransform: "none",
					fontSize: "0.875rem",
				},
			}}
		>
			{Array.from(solveResults.values()).map((result) => (
				<Tab
					key={result.id}
					label={result.name}
					value={result.id}
				/>
			))}
		</Tabs>
	);
}
