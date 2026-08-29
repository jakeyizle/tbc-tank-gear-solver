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
import { getAbilities} from "#/data/abilities";
import {getTalentsByClass} from "#/data/talents";
import { parseItemInput } from "#/helpers/parseItemInput";
import { loadAppState, saveAppState } from "#/helpers/persistence";
import { useCharacterConfig } from "#/hooks/useCharacterConfig";
import { useSolverConfigs } from "#/hooks/useSolverConfigs";
import { solveAll } from "#/solver";
import type { ModifierSource } from "#/solver/types";
import type { SolveResult } from "#/types/SolverConfig";
export const Route = createFileRoute("/")({ component: App });


function App() {
	const _saved = loadAppState();

	const [itemInput, setItemInput] = useState(() => _saved?.itemInput ?? "");
	const [classValue, setClassValue] = useState(() => _saved?.classValue ?? "2");
	const [raceValue, setRaceValue] = useState(() => _saved?.raceValue ?? "1");
	const [talents, setTalents] = useState<ModifierSource[]>(() => {
		if (_saved?.talents) return _saved.talents;
		return getTalentsByClass(_saved?.classValue ?? "2").map((talent) => ({ ...talent, rank: talent.maxRank }));
	});
	const [areEnchantsGemsLocked, setAreEnchantsGemsLocked] = useState(
		() => _saved?.areEnchantsGemsLocked ?? false
	);

	const {
		configs,
		activeConfigId,
		setActiveConfigId,
		addConfig,
		deleteConfig,
		renameConfig,
		duplicateConfig,
		reorderConfig,
		updateConstraints,
		updateOptimizeStats,
		updateResistanceFloors,
		updateConfig,
	} = useSolverConfigs();

	const { updateCharacterConfig } = useCharacterConfig();

	const [solveResults, setSolveResults] = useState<Map<string, SolveResult>>(
		() => _saved?.solveResults?.length ? new Map(_saved.solveResults) : new Map()
	);
	const [isSolving, setIsSolving] = useState(false);
	const [activeResultId, setActiveResultId] = useState<string | null>(
		() => _saved?.activeResultId ?? null
	);

	const handleSolveAll = async () => {
		setIsSolving(true);
		const newResults = new Map<string, SolveResult>();
		let firstResultId: string | null = null;

		const abilitySources = getAbilities(classValue);

		const items = parseItemInput(itemInput);

		const baseConfig = {
			raceId: raceValue,
			classId: classValue,
			areEnchantsGemsLocked,
			talentSources: talents,
			abilitySources,
		}

		// Store the solve configuration values in context
		updateCharacterConfig({
			classId: classValue,
			raceId: raceValue,
			talentSources: talents,
			abilitySources,
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
			saveAppState({
				itemInput,
				classValue,
				raceValue,
				talents,
				areEnchantsGemsLocked,
				configs,
				activeConfigId,
				solveResults: [...newResults.entries()],
				activeResultId: firstResultId,
			});
		} finally {
			setIsSolving(false);
		}
	};

	return (
		<Grid container spacing={2}>
			{/* Left Panel - Input Section */}
			<Grid size={6}>
				<Stack spacing={1.5} sx={{ p: 2 }}>
					<CharacterSection
						classValue={classValue}
						setClassValue={setClassValue}
						raceValue={raceValue}
						setRaceValue={setRaceValue}
						talents={talents}
						setTalents={setTalents}
					/>

					<ItemInputSection
						itemInput={itemInput}
						setItemInput={setItemInput}
						areEnchantsGemsLocked={areEnchantsGemsLocked}
						setAreEnchantsGemsLocked={setAreEnchantsGemsLocked}
					/>

					<ConfigurationPanel
						configs={configs}
						activeConfigId={activeConfigId}
						setActiveConfigId={setActiveConfigId}
						addConfig={addConfig}
						deleteConfig={deleteConfig}
						renameConfig={renameConfig}
						duplicateConfig={duplicateConfig}
						reorderConfig={reorderConfig}
						updateConstraints={updateConstraints}
						updateOptimizeStats={updateOptimizeStats}
						updateResistanceFloors={updateResistanceFloors}
						updateConfig={updateConfig}
					/>

					<Box>
						<SolveButton
							onSolve={handleSolveAll}
							isSolving={isSolving}
							setCount={configs.length}
						/>
					</Box>
				</Stack>
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
