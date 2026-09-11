import Box from "@mui/material/Box";
import Grid from "@mui/material/Grid";
import Stack from "@mui/material/Stack";
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import CharacterSection from "#/components/CharacterSection";
import ConfigurationPanel from "#/components/ConfigurationPanel";
import ItemInputSection from "#/components/ItemInputSection";
import ResultsPanel from "#/components/ResultsPanel";
import SimCalibrationPanel from "#/components/SimCalibrationPanel";
import SolveButton from "#/components/SolveButton";
import type { DetectedCharacter } from "#/helpers/parseItemInput";
import { analyzeItemInput, parseItemInput } from "#/helpers/parseItemInput";
import { loadAppState, saveAppState } from "#/helpers/persistence";
import { track, type UnknownId } from "#/helpers/track";
import { useCharacterConfig } from "#/hooks/useCharacterConfig";
import { useSimCalibrationProfile } from "#/hooks/useSimCalibrationProfile";
import { useSolverConfigs } from "#/hooks/useSolverConfigs";
import type { SolveAllProgress } from "#/solver";
import { solveAll } from "#/solver";
import type { SolveResult } from "#/types/SolverConfig";
export const Route = createFileRoute("/")({ component: App });

function App() {
	const _saved = loadAppState();

	const [itemInput, setItemInput] = useState(() => _saved?.itemInput ?? "");
	const [classValue, setClassValue] = useState(() => _saved?.classValue ?? "2");
	const [raceValue, setRaceValue] = useState(() => _saved?.raceValue ?? "1");
	const [areEnchantsGemsLocked, setAreEnchantsGemsLocked] = useState(
		() => _saved?.areEnchantsGemsLocked ?? false,
	);
	const [excludeUniqueGems, setExcludeUniqueGems] = useState(
		() => _saved?.excludeUniqueGems ?? false,
	);
	const [excludeJewelcraftingItems, setExcludeJewelcraftingItems] = useState(
		() => _saved?.excludeJewelcraftingItems ?? false,
	);
	const [excludeEnchantingItems, setExcludeEnchantingItems] = useState(
		() => _saved?.excludeEnchantingItems ?? false,
	);
	const [independentConfigs, setIndependentConfigs] = useState(
		() => _saved?.independentConfigs ?? false,
	);
	const [phase, setPhase] = useState(() => _saved?.phase ?? 3);

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
	const { simCalibrationProfile, updateSimCalibrationProfile } =
		useSimCalibrationProfile();

	const [solveResults, setSolveResults] = useState<Map<string, SolveResult>>(
		() =>
			_saved?.solveResults?.length ? new Map(_saved.solveResults) : new Map(),
	);
	const [solveProgress, setSolveProgress] = useState<SolveAllProgress | null>(
		null,
	);
	const isSolving = solveProgress !== null;
	const [activeResultId, setActiveResultId] = useState<string | null>(
		() => _saved?.activeResultId ?? null,
	);
	const [solveError, setSolveError] = useState<string | null>(null);

	// a failed/invalid solve leaves no valid result set, so clear it from both state and
	// localStorage - otherwise reloading the page (or the next render) would silently resurrect
	// a stale prior solution with no indication it doesn't correspond to the current inputs
	const handleSolveFailure = (message: string) => {
		setSolveResults(new Map());
		setActiveResultId(null);
		setSolveError(message);
		saveAppState({
			itemInput,
			classValue,
			raceValue,
			areEnchantsGemsLocked,
			excludeUniqueGems,
			excludeJewelcraftingItems,
			excludeEnchantingItems,
			independentConfigs,
			phase,
			simCalibrationProfile,
			configs,
			activeConfigId,
			solveResults: [],
			activeResultId: null,
		});
	};

	// useCallback so this stays a stable reference across unrelated re-renders (in particular
	// solveProgress ticks during a solve) - see ItemInputSection's React.memo wrapping below.
	const handleCharacterDetected = useCallback(
		(character: DetectedCharacter) => {
			if (character.classId) setClassValue(character.classId);
			if (character.raceId) setRaceValue(character.raceId);
			// The export's talent string goes straight to the raid profile, which is what the
			// simulator actually reads. Before this, the imported character's talents were
			// decoded into ranks for the deleted stat engine and never reached the sim at all.
			if (character.talentsString) {
				updateSimCalibrationProfile({
					...simCalibrationProfile,
					raidProfile: {
						...simCalibrationProfile.raidProfile,
						talentsString: character.talentsString,
					},
				});
			}
		},
		[],
	);

	const handleSolveAll = async () => {
		setSolveError(null);

		const analysis = analyzeItemInput(itemInput);
		if (analysis.status === "empty" || analysis.status === "error") {
			track({ event: "solve_failed", errorKind: "validation" });
			handleSolveFailure(
				analysis.status === "empty"
					? "Paste a gear pool before solving."
					: analysis.message,
			);
			return;
		}

		if (analysis.status === "warning") {
			const unknownIds: UnknownId[] = [
				...analysis.unknownItemIds.map(
					(id): UnknownId => ({ type: "item", id }),
				),
				...analysis.unknownGemIds.map((id): UnknownId => ({ type: "gem", id })),
				...analysis.unknownEnchantIds.map(
					(id): UnknownId => ({ type: "enchant", id }),
				),
			];
			track({ event: "unknown_id_detected", unknownIds });
		}

		const startedAt = performance.now();
		track({ event: "solve_started", configCount: configs.length, phase });

		try {
			setSolveProgress({
				configIndex: 0,
				totalConfigs: configs.length,
				configName: configs[0]?.name ?? "",
				innerFraction: 0,
			});
			const newResults = new Map<string, SolveResult>();
			let firstResultId: string | null = null;

			const items = parseItemInput(itemInput);

			const baseConfig = {
				raceId: raceValue,
				classId: classValue,
				areEnchantsGemsLocked,
				excludeUniqueGems,
				excludeJewelcraftingItems,
				excludeEnchantingItems,
				independentConfigs,
				phase,
				simCalibrationProfile,
			};

			// Store the solve configuration values in context
			updateCharacterConfig({
				classId: classValue,
				raceId: raceValue,
			});

			const solverResults = await solveAll(
				items,
				baseConfig,
				configs,
				setSolveProgress,
			);
			for (const result of solverResults) {
				newResults.set(result.id, result);
				if (!firstResultId) {
					firstResultId = result.id;
				}
			}
			setSolveResults(newResults);
			track({
				event: "solve_succeeded",
				durationMs: performance.now() - startedAt,
				configCount: configs.length,
				phase,
			});
			if (firstResultId) {
				setActiveResultId(firstResultId);
			}
			saveAppState({
				itemInput,
				classValue,
				raceValue,
					areEnchantsGemsLocked,
				excludeUniqueGems,
				excludeJewelcraftingItems,
				excludeEnchantingItems,
				independentConfigs,
				phase,
				configs,
				activeConfigId,
				solveResults: [...newResults.entries()],
				activeResultId: firstResultId,
			});
		} catch (error) {
			track({
				event: "solve_failed",
				durationMs: performance.now() - startedAt,
				configCount: configs.length,
				phase,
				errorKind: "solve_error",
			});
			handleSolveFailure(
				error instanceof Error
					? error.message
					: "Something went wrong while solving. Please check your input and try again.",
			);
		} finally {
			setSolveProgress(null);
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
					/>

					<ItemInputSection
						itemInput={itemInput}
						setItemInput={setItemInput}
						areEnchantsGemsLocked={areEnchantsGemsLocked}
						setAreEnchantsGemsLocked={setAreEnchantsGemsLocked}
						excludeUniqueGems={excludeUniqueGems}
						setExcludeUniqueGems={setExcludeUniqueGems}
						excludeJewelcraftingItems={excludeJewelcraftingItems}
						setExcludeJewelcraftingItems={setExcludeJewelcraftingItems}
						excludeEnchantingItems={excludeEnchantingItems}
						setExcludeEnchantingItems={setExcludeEnchantingItems}
						independentConfigs={independentConfigs}
						setIndependentConfigs={setIndependentConfigs}
						phase={phase}
						setPhase={setPhase}
						onCharacterDetected={handleCharacterDetected}
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
						independentConfigs={independentConfigs}
					/>

					{configs.some(
						(config) =>
							config.objectiveMode === "tps" ||
							config.objectiveMode === "dtps" ||
							config.objectiveMode === "tmi" ||
							config.objectiveMode === "balanced",
					) && (
						<SimCalibrationPanel
							profile={simCalibrationProfile}
							onChange={updateSimCalibrationProfile}
						/>
					)}

					<Box>
						<SolveButton
							onSolve={handleSolveAll}
							isSolving={isSolving}
							setCount={configs.length}
							solveProgress={solveProgress}
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
						solveProgress={solveProgress}
						solveError={solveError}
					/>
				</Stack>
			</Grid>
		</Grid>
	);
}
