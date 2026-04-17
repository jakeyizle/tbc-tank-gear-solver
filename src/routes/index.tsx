import Box from "@mui/material/Box";
import Grid from "@mui/material/Grid";
import Stack from "@mui/material/Stack";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import CharacterSection from "#/components/CharacterSection";
import ConfigurationPanel from "#/components/ConfigurationPanel";
import ItemInputSection from "#/components/ItemInputSection";
import ResultsPanel from "#/components/ResultsPanel";
import SolveButton from "#/components/SolveButton";
import { parseItemInput } from "#/helpers.ts/parseItemInput";
import { useSolveConfig } from "#/hooks/useSolveConfig";
import { useSolverConfigs } from "#/hooks/useSolverConfigs";
import { solveAll } from "#/solver";
import type { SolveResult } from "#/types/SolverConfig";

export const Route = createFileRoute("/")({ component: App });


function App() {
	const [itemInput, setItemInput] = useState("");
	const [classValue, setClassValue] = useState("2");
	const [raceValue, setRaceValue] = useState("1");
	const [areEnchantsGemsLocked, setAreEnchantsGemsLocked] = useState(false);

	const {
		configs,
		activeConfig,
		activeConfigId,
		setActiveConfigId,
		addConfig,
		deleteConfig,
		renameConfig,
		updateConstraints,
		updateOptimizeStats,
	} = useSolverConfigs();

	const { updateSolveConfig } = useSolveConfig();

	const [solveResults, setSolveResults] = useState<Map<string, SolveResult>>(
		new Map()
	);
	const [isSolving, setIsSolving] = useState(false);
	const [activeResultId, setActiveResultId] = useState<string | null>(null);

	const handleSolveAll = async () => {
		setIsSolving(true);
		const newResults = new Map<string, SolveResult>();
		let firstResultId: string | null = null;

		const items = parseItemInput(itemInput);
		const baseConfig = {
			raceId: raceValue.toString(),
			classId: classValue.toString(),
			areEnchantsGemsLocked,
		}

		// Store the solve configuration values in context
		updateSolveConfig({
			classId: classValue.toString(),
			raceId: raceValue.toString(),
		});

		try {
			const solverResults = await solveAll(items, baseConfig, configs);
			for (const result of solverResults) {
				newResults.set(result.id, result);
				if (!firstResultId) {
					firstResultId = result.id;
				}
			}
			setSolveResults(newResults);
			if (firstResultId) {
				setActiveResultId(firstResultId);
			}
		} finally {
			setIsSolving(false);
		}
	};

	return (
		<Grid container spacing={2}>
			{/* Left Panel - Input Section */}
			<Grid size={6}>
				<Box sx={{ p: 2 }}>
					<Grid container spacing={2}>
						{/* Fixed Inputs */}
						<Grid size={12}>
							<ItemInputSection
								itemInput={itemInput}
								setItemInput={setItemInput}
								areEnchantsGemsLocked={areEnchantsGemsLocked}
								setAreEnchantsGemsLocked={setAreEnchantsGemsLocked}
							/>

							<CharacterSection
								classValue={classValue}
								setClassValue={setClassValue}
								raceValue={raceValue}
								setRaceValue={setRaceValue}
							/>
						</Grid>

						{/* Configuration Panel */}
						<Grid size={12}>
							<ConfigurationPanel
								configs={configs}
								activeConfig={activeConfig}
								activeConfigId={activeConfigId}
								setActiveConfigId={setActiveConfigId}
								addConfig={addConfig}
								deleteConfig={deleteConfig}
								renameConfig={renameConfig}
								updateConstraints={updateConstraints}
								updateOptimizeStats={updateOptimizeStats}
							/>
						</Grid>

						{/* Solve Button */}
						<Grid size={12}>
							<SolveButton onSolve={handleSolveAll} isSolving={isSolving} />
						</Grid>
					</Grid>
				</Box>
			</Grid>

			{/* Right Panel - Results Section */}
			<Grid size={6}>
				<Stack spacing={2} sx={{ p: 2 }}>
					<ResultsPanel
						solveResults={solveResults}
						activeResultId={activeResultId}
						setActiveResultId={setActiveResultId}
						isLoading={isSolving}
					/>
				</Stack>
			</Grid>
		</Grid>
	);
}
