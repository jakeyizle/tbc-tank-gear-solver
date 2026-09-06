import CheckIcon from "@mui/icons-material/Check";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import FormControlLabel from "@mui/material/FormControlLabel";
import Paper from "@mui/material/Paper";
import Switch from "@mui/material/Switch";
import Typography from "@mui/material/Typography";
import { useMemo, useState } from "react";
import { formatItemExport } from "#/helpers/parseItemInput";
import type { SolveAllProgress } from "#/solver";
import type { SolveResult } from "#/types/SolverConfig";
import CompareView from "./CompareView";
import EmptyResultsPlaceholder from "./EmptyResultsPlaceholder";
import ErrorResultsPlaceholder from "./ErrorResultsPlaceholder";
import ItemGroupDisplay from "./ItemGroupDisplay";
import LoadingResultsPlaceholder from "./LoadingResultsPlaceHolder";
import ResultsTabs from "./ResultsTabs";
import StatsSummary, { type GearView } from "./StatsSummary";

interface ResultsPanelProps {
	solveResults: Map<string, SolveResult>;
	activeResultId: string | null;
	setActiveResultId: (id: string) => void;
	isLoading: boolean;
	solveProgress?: SolveAllProgress | null;
	solveError?: string | null;
}

export default function ResultsPanel({
	solveResults,
	activeResultId,
	setActiveResultId,
	isLoading,
	solveProgress,
	solveError,
}: ResultsPanelProps) {
	const activeResult = activeResultId ? solveResults.get(activeResultId) : null;
	const [copied, setCopied] = useState(false);
	const [compareMode, setCompareMode] = useState(false);
	const [compareToId, setCompareToId] = useState<string | null>(null);
	const [includeBuffsConsumables, setIncludeBuffsConsumables] = useState(true);
	const [gearView, setGearView] = useState<GearView>("balanced");
	// Previewing an endpoint is scoped to whichever result was active when it was selected -
	// switching tabs should always fall back to the real solve output rather than silently
	// carrying a stale preview over to a different config. Resetting during render (React's own
	// documented pattern for "reset state when a prop changes") instead of an effect avoids an
	// extra render pass after the tab switch.
	const [gearViewResultId, setGearViewResultId] = useState(activeResultId);
	if (activeResultId !== gearViewResultId) {
		setGearViewResultId(activeResultId);
		setGearView("balanced");
	}

	const resultsArray = useMemo(
		() => Array.from(solveResults.values()),
		[solveResults],
	);

	// The gear/metrics actually shown below - either the real solve result, or one of its two
	// balance-slider endpoints (see GearView's own doc comment). The endpoint's own
	// finalStatWeights/finalStatWeightStdevs are used too so the stat-weight breakdown reflects
	// whichever gear is actually on screen, not always the balanced solve's.
	const activeEndpoint =
		activeResult?.simBalanceEndpoints && gearView !== "balanced"
			? activeResult.simBalanceEndpoints[gearView]
			: undefined;
	const displayed = activeResult && {
		items: activeEndpoint?.items ?? activeResult.items,
		simMetrics: activeEndpoint?.simMetrics ?? activeResult.simMetrics,
		statWeights: activeEndpoint?.finalStatWeights ?? activeResult.statWeights,
		statWeightStdevs:
			activeEndpoint?.finalStatWeightStdevs ?? activeResult.statWeightStdevs,
	};

	const handleCopy = () => {
		if (!displayed) return;
		navigator.clipboard.writeText(formatItemExport(displayed.items));
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
		return <LoadingResultsPlaceholder solveProgress={solveProgress ?? null} />;
	}

	if (solveError) {
		return <ErrorResultsPlaceholder message={solveError} />;
	}

	if (solveResults.size === 0) {
		return <EmptyResultsPlaceholder />;
	}

	const buffsConsumablesToggle = (
		<FormControlLabel
			sx={{ mr: 0 }}
			control={
				<Switch
					size="small"
					checked={includeBuffsConsumables}
					onChange={(e) => setIncludeBuffsConsumables(e.target.checked)}
				/>
			}
			label={
				<Typography variant="body2" color="text.secondary">
					Include buffs &amp; consumables
				</Typography>
			}
		/>
	);

	const compareToResult = compareToId ? solveResults.get(compareToId) : null;
	if (compareMode && activeResult && compareToResult) {
		return (
			<CompareView
				resultA={activeResult}
				resultB={compareToResult}
				allResults={resultsArray}
				includeBuffsConsumables={includeBuffsConsumables}
				buffsConsumablesToggle={buffsConsumablesToggle}
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

			{activeResult && displayed && (
				<Paper elevation={1} sx={{ p: 2 }}>
					<Box display="flex" alignItems="center" gap={1.5} sx={{ mb: 1.5 }}>
						<Typography variant="h6">Equipment</Typography>
						{gearView !== "balanced" && (
							<Chip
								size="small"
								color="secondary"
								variant="outlined"
								label={`Previewing: 100% ${gearView === "threat" ? "Threat" : "Survivability"} gear`}
								onDelete={() => setGearView("balanced")}
							/>
						)}
						<Box
							sx={{ ml: "auto", display: "flex", alignItems: "center", gap: 1 }}
						>
							{buffsConsumablesToggle}
							{nextResult && (
								<Button
									size="small"
									variant="outlined"
									onClick={handleEnterCompare}
								>
									Compare to other results
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
								{copied ? "Copied!" : "Export for Sixty Upgrades"}
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
							<ItemGroupDisplay items={displayed.items} />
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
								items={displayed.items}
								baseConfig={activeResult.baseConfig}
								solverConfig={activeResult.solverConfig}
								includeBuffsConsumables={includeBuffsConsumables}
								simMetrics={displayed.simMetrics}
								statWeights={displayed.statWeights}
								statWeightStdevs={displayed.statWeightStdevs}
								simBalanceEndpoints={activeResult.simBalanceEndpoints}
								selectedGearView={gearView}
								onSelectGearView={setGearView}
							/>
						</Box>
					</Box>
				</Paper>
			)}
		</>
	);
}
