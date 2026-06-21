import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import type { SolveResult } from "#/types/SolverConfig";
import EmptyResultsPlaceholder from "./EmptyResultsPlaceholder";
import ItemGroupDisplay from "./ItemGroupDisplay";
import LoadingResultsPlaceholder from "./LoadingResultsPlaceHolder";
import ResultsTabs from "./ResultsTabs";
import StatsSummary from "./StatsSummary";

interface ResultsPanelProps {
	solveResults: Map<string, SolveResult>;
	activeResultId: string | null;
	setActiveResultId: (id: string) => void;
	isLoading: boolean;
}

export default function ResultsPanel({
	solveResults,
	activeResultId,
	setActiveResultId,
	isLoading,
}: ResultsPanelProps) {
	const activeResult = activeResultId
		? solveResults.get(activeResultId)
		: null;

	if (isLoading) {
		return <LoadingResultsPlaceholder />;
	}

	if (solveResults.size === 0) {
		return <EmptyResultsPlaceholder />;
	}

	return (
		<>
			<ResultsTabs
				solveResults={solveResults}
				activeResultId={activeResultId}
				onResultChange={setActiveResultId}
			/>

			{activeResult && (
				<>
					{/* Equipment Slots */}
					<Paper elevation={1} sx={{ p: 2 }}>
						<Typography variant="h6" gutterBottom>
							Equipment
						</Typography>
						<ItemGroupDisplay items={activeResult.items} />
					</Paper>

					{/* Stats Summary */}
					<StatsSummary
						items={activeResult.items}
						baseConfig={activeResult.baseConfig}
						solverConfig={activeResult.solverConfig}
					/>
				</>
			)}
		</>
	);
}
