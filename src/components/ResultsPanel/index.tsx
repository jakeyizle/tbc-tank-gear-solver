import CheckIcon from "@mui/icons-material/Check";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import { useMemo, useState } from "react";
import { formatItemExport } from "#/helpers/parseItemInput";
import { summarizeEquipment } from "#/solver/itemSlots";
import type { SolveResult } from "#/types/SolverConfig";
import CompareView from "./CompareView";
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
	const activeResult = activeResultId ? solveResults.get(activeResultId) : null;
	const [copied, setCopied] = useState(false);
	const [compareMode, setCompareMode] = useState(false);
	const [compareToId, setCompareToId] = useState<string | null>(null);

	const resultsArray = useMemo(
		() => Array.from(solveResults.values()),
		[solveResults],
	);

	const handleCopy = () => {
		if (!activeResult) return;
		navigator.clipboard.writeText(formatItemExport(activeResult.items));
		setCopied(true);
		setTimeout(() => setCopied(false), 1500);
	};

	const handleEnterCompare = () => {
		if (!activeResult) return;
		const index = resultsArray.findIndex((r) => r.id === activeResult.id);
		const next = resultsArray[(index + 1) % resultsArray.length];
		if (!next || next.id === activeResult.id) return;
		setCompareToId(next.id);
		setCompareMode(true);
	};

	if (isLoading) {
		return <LoadingResultsPlaceholder />;
	}

	if (solveResults.size === 0) {
		return <EmptyResultsPlaceholder />;
	}

	const compareToResult = compareToId ? solveResults.get(compareToId) : null;
	if (compareMode && activeResult && compareToResult) {
		return (
			<CompareView
				resultA={activeResult}
				resultB={compareToResult}
				allResults={resultsArray}
				onChangeCompareTo={setCompareToId}
				onExit={() => setCompareMode(false)}
			/>
		);
	}

	const nextResult =
		activeResult && resultsArray.length > 1
			? resultsArray[
					(resultsArray.findIndex((r) => r.id === activeResult.id) + 1) %
						resultsArray.length
				]
			: null;

	return (
		<>
			<ResultsTabs
				solveResults={solveResults}
				activeResultId={activeResultId}
				onResultChange={setActiveResultId}
			/>

			{activeResult && (
				<Paper elevation={1} sx={{ p: 2 }}>
					<Box display="flex" alignItems="center" gap={1.5} sx={{ mb: 1.5 }}>
						<Typography variant="h6">Equipment</Typography>
						<Box sx={{ ml: "auto", display: "flex", gap: 1 }}>
							{nextResult && (
								<Button
									size="small"
									variant="outlined"
									onClick={handleEnterCompare}
								>
									Compare to {nextResult.name}
								</Button>
							)}
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
					</Box>

					<Box
						sx={{
							display: "flex",
							gap: 2.75,
							alignItems: "flex-start",
							flexWrap: { xs: "wrap", lg: "nowrap" },
						}}
					>
						<Box sx={{ flex: 1, minWidth: 0, width: "100%" }}>
							<ItemGroupDisplay items={activeResult.items} />
						</Box>

						{/* Stats Summary — nested sticky rail */}
						<Box
							sx={{
								flex: { xs: "1 1 100%", lg: "0 0 380px" },
								width: { xs: "100%", lg: 380 },
								position: { lg: "sticky" },
								top: { lg: 16 },
							}}
						>
							<StatsSummary
								items={activeResult.items}
								baseConfig={activeResult.baseConfig}
								solverConfig={activeResult.solverConfig}
							/>
						</Box>
					</Box>
				</Paper>
			)}
		</>
	);
}
