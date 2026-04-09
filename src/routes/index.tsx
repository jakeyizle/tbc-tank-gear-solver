import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import FormGroup from "@mui/material/FormGroup";
import FormLabel from "@mui/material/FormLabel";
import Grid from "@mui/material/Grid";
import IconButton from "@mui/material/IconButton";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import ClassSelect from "#/components/ClassSelect";
import CritRadioGroup from "#/components/CritRadioGroup";
import ElixirFlaskFormGroup from "#/components/ElixirFlaskFormGroup";
import ItemGroupDisplay from "#/components/ItemGroupDisplay";
import RaceSelect from "#/components/RaceSelect";
import StatsDisplay from "#/components/StatsDisplay";
import StatsEntry from "#/components/StatsEntry";
import UncrushableRadioGroup from "#/components/UncrushableRadioGroup";
import {
	getAvoidanceFromItems,
} from "#/helpers.ts/getStatFromItem";
import { parseItemInput } from "#/helpers.ts/parseItemInput";
import { solve } from "#/solver";
import {
	type LPItem,
	type SolverConfig,
	type SolverResult,
	createDefaultConfig,
} from "#/solver/types";

export const Route = createFileRoute("/")({ component: App });

function App() {
	// Shared state (set once)
	const [itemInput, setItemInput] = useState("");
	const [classValue, setClassValue] = useState("2");
	const [raceValue, setRaceValue] = useState("1");
	const [areEnchantsGemsLocked, setAreEnchantsGemsLocked] = useState(false);

	// Multi-config state
	const [configs, setConfigs] = useState<SolverConfig[]>([createDefaultConfig(1)]);
	const [activeConfigId, setActiveConfigId] = useState(1);
	const [nextConfigId, setNextConfigId] = useState(2);

	// Results state (keyed by config ID)
	const [results, setResults] = useState<Map<number, SolverResult>>(new Map());
	const [activeResultId, setActiveResultId] = useState<number | null>(null);
	const [isSolving, setIsSolving] = useState(false);
	const [solveProgress, setSolveProgress] = useState({ current: 0, total: 0 });

	// Get active config
	const activeConfig = configs.find((c) => c.id === activeConfigId) || configs[0];

	// Update a specific config
	const updateConfig = (configId: number, updates: Partial<SolverConfig>) => {
		setConfigs((prev) =>
			prev.map((c) => (c.id === configId ? { ...c, ...updates } : c))
		);
	};

	// Add new config
	const addConfig = () => {
		const newConfig = createDefaultConfig(nextConfigId);
		setConfigs((prev) => [...prev, newConfig]);
		setActiveConfigId(nextConfigId);
		setNextConfigId((prev) => prev + 1);
	};

	// Remove config
	const removeConfig = (configId: number) => {
		if (configs.length <= 1) return;
		setConfigs((prev) => prev.filter((c) => c.id !== configId));
		if (activeConfigId === configId) {
			const remaining = configs.filter((c) => c.id !== configId);
			setActiveConfigId(remaining[0].id);
		}
		// Also remove result if exists
		setResults((prev) => {
			const newResults = new Map(prev);
			newResults.delete(configId);
			return newResults;
		});
	};

	// Solve all configurations sequentially
	const solveAll = async () => {
		setIsSolving(true);
		setSolveProgress({ current: 0, total: configs.length });
		const newResults = new Map<number, SolverResult>();

		for (let i = 0; i < configs.length; i++) {
			const config = configs[i];
			setSolveProgress({ current: i + 1, total: configs.length });

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

			newResults.set(config.id, {
				configId: config.id,
				items,
				baseAvoidance,
				baseUncritability,
			});
		}

		setResults(newResults);
		setActiveResultId(configs[0].id);
		setIsSolving(false);
	};

	// Get active result for display
	const activeResult = activeResultId !== null ? results.get(activeResultId) : null;

	return (
		<Grid container spacing={2}>
			{/* Left Side - Configuration */}
			<Grid size={6}>
				<Box sx={{ p: 2 }}>
					<Stack spacing={2}>
						{/* Items (Shared) */}
						<Paper elevation={1} sx={{ p: 2 }}>
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
										checked={areEnchantsGemsLocked}
										onChange={(e) => setAreEnchantsGemsLocked(e.target.checked)}
									/>
								}
								label="Lock Enchants and Gems"
							/>
						</Paper>

						{/* Character (Shared) */}
						<Paper elevation={1} sx={{ p: 2 }}>
							<Typography variant="h6" gutterBottom>
								Character
							</Typography>
							<Stack direction="row" spacing={1}>
								<ClassSelect value={classValue} onChange={setClassValue} />
								<RaceSelect value={raceValue} onChange={setRaceValue} />
							</Stack>
						</Paper>

						{/* Configurations (Multiple) */}
						<Paper elevation={1} sx={{ p: 2 }}>
							<Box sx={{ display: "flex", alignItems: "center", mb: 1 }}>
								<Typography variant="h6" sx={{ flexGrow: 1 }}>
									Configurations
								</Typography>
								<IconButton size="small" onClick={addConfig} title="Add Configuration">
									<AddIcon />
								</IconButton>
							</Box>

							{/* Config Tabs */}
							<Tabs
								value={activeConfigId}
								onChange={(_, newValue) => setActiveConfigId(newValue)}
								variant="scrollable"
								scrollButtons="auto"
								sx={{ borderBottom: 1, borderColor: "divider", mb: 2 }}
							>
								{configs.map((config, index) => (
									<Tab
										key={config.id}
										label={`Config ${index + 1}`}
										value={config.id}
									/>
								))}
							</Tabs>

							{/* Active Config Content */}
							<Stack spacing={2}>
								{/* Constraints */}
								<Box>
									<Typography variant="subtitle2" gutterBottom>
										Constraints
									</Typography>
									<Stack direction="row" spacing={3}>
										<CritRadioGroup
											onChange={(value) =>
												updateConfig(activeConfig.id, { uncritabilitySetting: value })
											}
											uncritabilitySetting={activeConfig.uncritabilitySetting}
										/>
										<UncrushableRadioGroup
											onChange={(value) =>
												updateConfig(activeConfig.id, { uncrushabilitySetting: value })
											}
											uncrushabilitySetting={activeConfig.uncrushabilitySetting}
										/>
									</Stack>
								</Box>

								{/* Buffs & Consumables */}
								<Box>
									<Typography variant="subtitle2" gutterBottom>
										Buffs & Consumables
									</Typography>
									<Stack direction="row" spacing={2}>
										<FormGroup>
											<FormLabel sx={{ fontSize: "0.75rem" }}>Buffs</FormLabel>
											<FormControlLabel
												control={<Checkbox defaultChecked size="small" />}
												label={
													<Typography variant="body2">Mark of the Wild</Typography>
												}
											/>
											<FormControlLabel
												control={<Checkbox defaultChecked size="small" />}
												label={
													<Typography variant="body2">Improved MotW</Typography>
												}
											/>
											<FormControlLabel
												control={<Checkbox defaultChecked size="small" />}
												label={
													<Typography variant="body2">Blessing of Kings</Typography>
												}
											/>
											<FormControlLabel
												control={<Checkbox size="small" />}
												label={
													<Typography variant="body2">Grace of Air</Typography>
												}
											/>
										</FormGroup>
										<Box>
											<FormGroup>
												<FormLabel sx={{ fontSize: "0.75rem" }}>Consumables</FormLabel>
												<FormControlLabel
													control={<Checkbox size="small" />}
													label={
														<Typography variant="body2">Scroll of Agility V</Typography>
													}
												/>
											</FormGroup>
											<ElixirFlaskFormGroup />
										</Box>
									</Stack>
								</Box>

								{/* Optimize Stats */}
								<Box>
									<StatsEntry
										stats={activeConfig.optimizeStats}
										onChange={(stats) =>
											updateConfig(activeConfig.id, { optimizeStats: stats })
										}
									/>
								</Box>

								{/* Remove Config Button */}
								{configs.length > 1 && (
									<Button
										variant="outlined"
										color="error"
										size="small"
										startIcon={<DeleteIcon />}
										onClick={() => removeConfig(activeConfig.id)}
									>
										Remove This Configuration
									</Button>
								)}
							</Stack>
						</Paper>

						{/* Solve Button */}
						<Button
							variant="contained"
							size="large"
							fullWidth
							onClick={solveAll}
							disabled={isSolving}
						>
							{isSolving
								? `Solving ${solveProgress.current}/${solveProgress.total}...`
								: `Solve All (${configs.length} config${configs.length > 1 ? "s" : ""})`}
						</Button>
					</Stack>
				</Box>
			</Grid>

			{/* Right Side - Results */}
			<Grid size={6}>
				<Stack spacing={2} sx={{ p: 2 }}>
					{/* Results Tabs */}
					{results.size > 0 && (
						<Paper elevation={1} sx={{ p: 2 }}>
							<Typography variant="h6" gutterBottom>
								Results
							</Typography>
							<Tabs
								value={activeResultId}
								onChange={(_, newValue) => setActiveResultId(newValue)}
								variant="scrollable"
								scrollButtons="auto"
								sx={{ borderBottom: 1, borderColor: "divider", mb: 2 }}
							>
								{Array.from(results.keys()).map((configId) => {
									const configIndex = configs.findIndex((c) => c.id === configId);
									return (
										<Tab
											key={configId}
											label={`Config ${configIndex + 1}`}
											value={configId}
										/>
									);
								})}
							</Tabs>
						</Paper>
					)}

					{/* Equipment Display */}
					<Paper elevation={1} sx={{ p: 2 }}>
						<Typography variant="h6" gutterBottom>
							Equipment
						</Typography>
						<ItemGroupDisplay items={activeResult?.items} />
					</Paper>

					{/* Stats Summary */}
					{activeResult && activeResult.items.length > 0 && (
						<Paper elevation={1} sx={{ p: 2 }}>
							<Typography variant="h6" gutterBottom>
								Stats Summary
							</Typography>
							<Stack spacing={1}>
								<Box sx={{ display: "flex", justifyContent: "space-between" }}>
									<Typography variant="body2" color="text.secondary">
										Total Avoidance
									</Typography>
									<Typography variant="body2" fontWeight="medium">
										{(
											getAvoidanceFromItems(activeResult.items) +
											activeResult.baseAvoidance
										).toFixed(2)}
									</Typography>
									<Typography variant="body2" color="text.secondary">
										Base Avoidance
									</Typography>
									<Typography variant="body2" fontWeight="medium">
										{activeResult.baseAvoidance.toFixed(2)}
									</Typography>
									<Typography variant="body2" color="text.secondary">
										Avoidance from items
									</Typography>
									<Typography variant="body2" fontWeight="medium">
										{getAvoidanceFromItems(activeResult.items).toFixed(2)}
									</Typography>
								</Box>
								<Box sx={{ display: "flex", justifyContent: "space-between" }}>
									<Typography variant="body2" color="text.secondary">
										Uncritability Score
									</Typography>
									<Typography variant="body2" fontWeight="medium">
										{(
											activeResult.items.reduce(
												(acc, item) => acc + item.uncritabilityScore,
												0
											) + activeResult.baseUncritability
										).toFixed(2)}
									</Typography>
								</Box>
								<Box sx={{ display: "flex", justifyContent: "space-between" }}>
									<Typography variant="body2" color="text.secondary">
										Objective Score
									</Typography>
									<Typography variant="body2" fontWeight="medium">
										{activeResult.items
											.reduce((acc, item) => acc + item.objectiveScore, 0)
											.toFixed(2)}
									</Typography>
								</Box>
								{activeResult.items.length > 0 && (
									<StatsDisplay
										items={activeResult.items}
										stats={["Defense", "Dodge", "Parry", "Block", "Resilience"]}
										header="Defenses"
									/>
								)}
							</Stack>
						</Paper>
					)}
				</Stack>
			</Grid>
		</Grid>
	);
}
