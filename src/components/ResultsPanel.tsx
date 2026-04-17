import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import EmptyResultsPlaceholder from "#/components/EmptyResultsPlaceholder";
import ItemGroupDisplay from "#/components/ItemGroupDisplay";
import ResultsTabs from "#/components/ResultsTabs";
import StatsSummary from "#/components/StatsSummary";
import type { SolveResult } from "#/types/SolverConfig";
import LoadingResultsPlaceholder from "./LoadingResultsPlaceHolder";

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
						baseAvoidance={activeResult.baseAvoidance}
						baseUncritability={activeResult.baseUncritability}
					/>
				</>
			)}
		</>
	);
}
