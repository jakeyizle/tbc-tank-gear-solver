import Backdrop from "@mui/material/Backdrop";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import CircularProgress from "@mui/material/CircularProgress";
import Divider from "@mui/material/Divider";
import FormControlLabel from "@mui/material/FormControlLabel";
import FormGroup from "@mui/material/FormGroup";
import FormLabel from "@mui/material/FormLabel";
import Grid from "@mui/material/Grid";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import ClassSelect from "#/components/ClassSelect";
import ConfigManager from "#/components/ConfigManager";
import CritRadioGroup from "#/components/CritRadioGroup";
import ElixirFlaskFormGroup from "#/components/ElixirFlaskFormGroup";
import ItemGroupDisplay from "#/components/ItemGroupDisplay";
import RaceSelect from "#/components/RaceSelect";
import StatsDisplay from "#/components/StatsDisplay";
import StatsEntry from "#/components/StatsEntry";
import UncrushableRadioGroup from "#/components/UncrushableRadioGroup";
import {
	getAvoidanceFromItems,
	getStatFromItem,
} from "#/helpers.ts/getStatFromItem";
import { parseItemInput } from "#/helpers.ts/parseItemInput";
import { useSolverConfigs } from "#/hooks/useSolverConfigs";
import { solve } from "#/solver";
import { type LPItem, STAT_NAMES, type Stat } from "#/solver/types";
import type { SolveResult } from "#/types/SolverConfig";

export const Route = createFileRoute("/")({ component: App });

const itemIds = [
	29388, 28754, 28316, 25828, 28593, 30641, 28520, 28746, 25362, 28528, 27529,
	30300, 28516, 29126, 29323, 7005, 29068, 28245, 28743, 27804, 28262, 28502,
	29067, 29153, 28611, 29253, 29069, 29254, 29279, 29172, 29370, 29132,
];

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

	const [solveResults, setSolveResults] = useState<Map<string, SolveResult>>(
		new Map()
	);
	const [isSolving, setIsSolving] = useState(false);
	const [activeResultId, setActiveResultId] = useState<string | null>(null);

	const activeResult = activeResultId
		? solveResults.get(activeResultId)
		: null;
	const handleSolveAll = async () => {
		setIsSolving(true);
		const newResults = new Map<string, SolveResult>();
		let firstResultId: string | null = null;

		try {
			for (const config of configs) {
				const { items, baseAvoidance, baseUncritability } = await solve(
					parseItemInput(itemInput),
					{
						raceId: raceValue.toString(),
						classId: classValue.toString(),
						uncrushabilitySetting: config.uncrushabilitySetting,
						uncritabilitySetting: config.uncritabilitySetting,
						optimizeStats: config.optimizeStats,
						areEnchantsGemsLocked,
					}
				);
				const result: SolveResult = {
					configId: config.id,
					configName: config.name,
					items,
					baseAvoidance,
					baseUncritability,
					timestamp: Date.now(),
				};
				newResults.set(config.id, result);
				if (!firstResultId) {
					firstResultId = config.id;
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
			<Grid size={6}>
				<Box sx={{ p: 2 }}>
					<Grid container spacing={2}>
						{/* Fixed Inputs - Top */}
						<Grid size={12}>
							{/* Items - Main User Input */}
							<Paper elevation={1} sx={{ p: 2, mb: 2 }}>
								<Typography variant="h6" gutterBottom>
									Items
								</Typography>
								<TextField
									label="Item IDs"
									variant="outlined"
									fullWidth
									size="small"
									value={itemInput}
									onChange={(e) => setItemInput(e.target.value)}
								/>
								<FormControlLabel
									control={
										<Checkbox
											size="small"
											value={areEnchantsGemsLocked}
											onChange={(e) =>
												setAreEnchantsGemsLocked(e.target.checked)
											}
										/>
									}
									label="Lock Enchants and Gems"
								/>
							</Paper>

							{/* Character */}
							<Paper elevation={1} sx={{ p: 2, mb: 2 }}>
								<Typography variant="h6" gutterBottom>
									Character
								</Typography>
								<Stack direction="row" spacing={1}>
									<ClassSelect value={classValue} onChange={setClassValue} />
									<RaceSelect value={raceValue} onChange={setRaceValue} />
								</Stack>
							</Paper>
						</Grid>

						{/* Configurations - Configurable Sections */}
						<Grid size={12}>
							<Paper elevation={1} sx={{ p: 2 }}>
								<ConfigManager
									configs={configs}
									activeConfigId={activeConfigId}
									onSelectConfig={setActiveConfigId}
									onAddConfig={addConfig}
									onDeleteConfig={deleteConfig}
									onRenameConfig={renameConfig}
								/>

								{activeConfig && (
									<Stack spacing={2} sx={{ mt: 2 }}>
										{/* Constraints */}
										<Box>
											<Typography variant="subtitle2" sx={{ mb: 1.5 }}>
												Constraints
											</Typography>
											<Stack direction="row" spacing={3}>
												<CritRadioGroup
													onChange={(val) =>
														updateConstraints(
															val,
															activeConfig.uncrushabilitySetting
														)
													}
													uncritabilitySetting={
														activeConfig.uncritabilitySetting
													}
												/>
												<UncrushableRadioGroup
													onChange={(val) =>
														updateConstraints(
															activeConfig.uncritabilitySetting,
															val
														)
													}
													uncrushabilitySetting={
														activeConfig.uncrushabilitySetting
													}
												/>
											</Stack>
										</Box>

										{/* Stats to Optimize */}
										<Box>
											<StatsEntry
												stats={activeConfig.optimizeStats}
												onChange={updateOptimizeStats}
											/>
										</Box>

										{/* Buffs & Consumables */}
										<Box>
											<Typography variant="subtitle2" sx={{ mb: 1.5 }}>
												Buffs & Consumables
											</Typography>
											<Stack direction="row" spacing={2}>
												<FormGroup>
													<FormLabel sx={{ fontSize: "0.75rem" }}>
														Buffs
													</FormLabel>
													<FormControlLabel
														control={
															<Checkbox
																size="small"
																checked={
																	activeConfig.buffs
																		.markOfTheWild
																}
															/>
														}
														label={
															<Typography variant="body2">
																Mark of the Wild
															</Typography>
														}
													/>
													<FormControlLabel
														control={
															<Checkbox
																size="small"
																checked={
																	activeConfig.buffs
																		.improvedMotw
																}
															/>
														}
														label={
															<Typography variant="body2">
																Improved MotW
															</Typography>
														}
													/>
													<FormControlLabel
														control={
															<Checkbox
																size="small"
																checked={
																	activeConfig.buffs
																		.blessingOfKings
																}
															/>
														}
														label={
															<Typography variant="body2">
																Blessing of Kings
															</Typography>
														}
													/>
													<FormControlLabel
														control={
															<Checkbox
																size="small"
																checked={
																	activeConfig.buffs
																		.graceOfAir
																}
															/>
														}
														label={
															<Typography variant="body2">
																Grace of Air
															</Typography>
														}
													/>
												</FormGroup>
												<Box>
													<FormGroup>
														<FormLabel sx={{ fontSize: "0.75rem" }}>
															Consumables
														</FormLabel>
														<FormControlLabel
															control={
																<Checkbox
																	size="small"
																	checked={
																		activeConfig.consumables
																			.scrollOfAgilityV
																	}
																/>
															}
															label={
																<Typography variant="body2">
																	Scroll of Agility V
																</Typography>
															}
														/>
													</FormGroup>
													<ElixirFlaskFormGroup />
												</Box>
											</Stack>
										</Box>
									</Stack>
								)}
							</Paper>
						</Grid>

						{/* Solve All Button - Full Width */}
						<Grid size={12}>
							<Button
								variant="contained"
								size="large"
								fullWidth
								onClick={handleSolveAll}
								disabled={isSolving}
							>
								{isSolving ? "Solving..." : "Solve All"}
							</Button>
						</Grid>
					</Grid>
				</Box>
			</Grid>

			<Grid size={6}>
				<Stack spacing={2} sx={{ p: 2 }}>
					{/* Results Tabs */}
					{solveResults.size > 0 && (
						<>
							<Tabs
								value={activeResultId || ""}
								onChange={(_, newValue) => setActiveResultId(newValue)}
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
										key={result.configId}
										label={result.configName}
										value={result.configId}
									/>
								))}
							</Tabs>

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
									{activeResult.items && activeResult.items.length > 0 && (
										<Paper elevation={1} sx={{ p: 2 }}>
											<Typography variant="h6" gutterBottom>
												Stats Summary
											</Typography>
											<Stack spacing={1}>
												<Box
													sx={{
														display: "flex",
														justifyContent: "space-between",
													}}
												>
													<Typography
														variant="body2"
														color="text.secondary"
													>
														Total Avoidance
													</Typography>
													<Typography
														variant="body2"
														fontWeight="medium"
													>
														{(
															getAvoidanceFromItems(
																activeResult.items
															) + activeResult.baseAvoidance
														).toFixed(2)}
													</Typography>
													<Typography
														variant="body2"
														color="text.secondary"
													>
														Base Avoidance
													</Typography>
													<Typography
														variant="body2"
														fontWeight="medium"
													>
														{activeResult.baseAvoidance.toFixed(
															2
														)}
													</Typography>
													<Typography
														variant="body2"
														color="text.secondary"
													>
														Avoidance from items
													</Typography>
													<Typography
														variant="body2"
														fontWeight="medium"
													>
														{getAvoidanceFromItems(
															activeResult.items
														).toFixed(2)}
													</Typography>
												</Box>
												<Box
													sx={{
														display: "flex",
														justifyContent: "space-between",
													}}
												>
													<Typography
														variant="body2"
														color="text.secondary"
													>
														Uncritability Score
													</Typography>
													<Typography
														variant="body2"
														fontWeight="medium"
													>
														{(
															activeResult.items.reduce(
																(acc, item) =>
																	acc +
																	item.uncritabilityScore,
																0
															) + activeResult.baseUncritability
														).toFixed(2)}
													</Typography>
												</Box>
												<Box
													sx={{
														display: "flex",
														justifyContent: "space-between",
													}}
												>
													<Typography
														variant="body2"
														color="text.secondary"
													>
														Objective Score
													</Typography>
													<Typography
														variant="body2"
														fontWeight="medium"
													>
														{activeResult.items
															.reduce(
																(acc, item) =>
																	acc +
																	item.objectiveScore,
																0
															)
															.toFixed(2)}
													</Typography>
												</Box>
												{activeResult.items.length > 0 && (
													<StatsDisplay
														items={activeResult.items}
														stats={[
															"Defense",
															"Dodge",
															"Parry",
															"Block",
															"Resilience",
														]}
														header="Defenses"
													/>
												)}
											</Stack>
										</Paper>
									)}
								</>
							)}
						</>
					)}

					{solveResults.size === 0 && (
						<Paper elevation={1} sx={{ p: 2 }}>
							<Typography
								variant="body2"
								color="text.secondary"
								align="center"
							>
								Run "Solve All" to see results
							</Typography>
						</Paper>
					)}
				</Stack>
			</Grid>
		</Grid>
	);
}
