import CheckIcon from "@mui/icons-material/Check";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import { useState } from "react";
import { formatItemExport } from "#/helpers/parseItemInput";
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
	const [copied, setCopied] = useState(false);

	const handleCopy = () => {
		if (!activeResult) return;
		navigator.clipboard.writeText(formatItemExport(activeResult.items));
		setCopied(true);
		setTimeout(() => setCopied(false), 1500);
	};

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
						<Box
							display="flex"
							justifyContent="space-between"
							alignItems="center"
						>
							<Typography variant="h6" gutterBottom>
								Equipment
							</Typography>
							<Button
								size="small"
								variant="outlined"
								color={copied ? "success" : "primary"}
								startIcon={
									copied ? (
										<CheckIcon fontSize="small" />
									) : (
										<ContentCopyIcon fontSize="small" />
									)
								}
								onClick={handleCopy}
							>
								{copied ? "Copied!" : "Export Gear"}
							</Button>
						</Box>
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
