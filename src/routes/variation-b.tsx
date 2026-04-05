import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
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
import CritRadioGroup from "#/components/CritRadioGroup";
import ElixirFlaskFormGroup from "#/components/ElixirFlaskFormGroup";
import ItemGroupDisplay from "#/components/ItemGroupDisplay";
import RaceSelect from "#/components/RaceSelect";
import StatsEntry from "#/components/StatsEntry";
import UncrushableRadioGroup from "#/components/UncrushableRadioGroup";
import { solve } from "#/solver";
import type { LPItem, Stat } from "#/solver/types";

export const Route = createFileRoute("/variation-b")({ component: VariationB });

const itemIds = [
	29388, 28754, 28316, 25828, 28593, 30641, 28520, 28746, 25362, 28528, 27529,
	30300, 28516, 29126, 29323, 7005, 29068, 28245, 28743, 27804, 28262, 28502,
	29067, 29153, 28611, 29253, 29069, 29254, 29279, 29172, 29370, 29132,
];

interface TabPanelProps {
	children?: React.ReactNode;
	index: number;
	value: number;
}

function TabPanel(props: TabPanelProps) {
	const { children, value, index, ...other } = props;
	return (
		<div role="tabpanel" hidden={value !== index} {...other}>
			{value === index && <Box sx={{ py: 2 }}>{children}</Box>}
		</div>
	);
}

/**
 * Variation B: Tabbed Configuration Panel
 * - Setup tab: Items + Constraints + Stats (optimization together)
 * - Config tab: Class/Race + Buffs & Consumables
 * - Stats summary displays 10+ stats in a simple grid layout
 */
function VariationB() {
	const [classValue, setClassValue] = useState("2");
	const [raceValue, setRaceValue] = useState("1");
	const [areEnchantsGemsLocked, setAreEnchantsGemsLocked] = useState(false);
	const [uncritabilitySetting, setUncritabilitySetting] = useState(2);
	const [uncrushabilitySetting, setUncrushabilitySetting] = useState(1);
	const [optimizeStats, setOptimizeStats] = useState<Stat[]>([
		{ name: "Stamina", value: 1 },
		{ name: "SpellPower", value: 1 },
		{ name: "SpellHit", value: 1 },
	]);
	const [tabValue, setTabValue] = useState(0);
	const [items, setItems] = useState<LPItem[]>([]);

	const handleTabChange = (_: React.SyntheticEvent, newValue: number) => {
		setTabValue(newValue);
	};

	// Calculate totals for stats display
	const avoidanceTotal = items.reduce((acc, item) => acc + item.avoidanceScore, 0);
	const uncritTotal = items.reduce((acc, item) => acc + item.uncritabilityScore, 0);
	const objectiveTotal = items.reduce((acc, item) => acc + item.objectiveScore, 0);

	// Stats data for the summary grid (placeholder values for future expansion)
	const statsData = [
		{ label: "Avoidance", value: avoidanceTotal },
		{ label: "Uncritability", value: uncritTotal },
		{ label: "Objective", value: objectiveTotal },
		{ label: "Stamina", value: 0 },
		{ label: "Armor", value: 0 },
		{ label: "Defense", value: 0 },
		{ label: "Dodge", value: 0 },
		{ label: "Parry", value: 0 },
		{ label: "Block", value: 0 },
		{ label: "Block Value", value: 0 },
		{ label: "Health", value: 0 },
		{ label: "Resilience", value: 0 },
	];

	return (
		<Grid container spacing={2}>
			{/* Left Side - Tabbed Configuration */}
			<Grid size={8}>
				<Paper elevation={2} sx={{ m: 2 }}>
					<Tabs
						value={tabValue}
						onChange={handleTabChange}
						variant="fullWidth"
						sx={{ borderBottom: 1, borderColor: "divider" }}
					>
						<Tab label="Setup" />
						<Tab label="Config" />
					</Tabs>

					<Box sx={{ p: 2 }}>
						{/* Tab 0: Setup - Items + Constraints + Stats */}
						<TabPanel value={tabValue} index={0}>
							<Stack spacing={3}>
								<Box>
									<Typography variant="subtitle1" fontWeight="medium" gutterBottom>
										Items
									</Typography>
									<TextField
										label="Enter Item IDs (comma separated)"
										variant="outlined"
										fullWidth
										size="small"
										multiline
										rows={2}
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
										sx={{ mt: 1 }}
									/>
								</Box>

								<Divider />

								<Box>
									<Typography variant="subtitle1" fontWeight="medium" gutterBottom>
										Constraints
									</Typography>
									<Stack direction="row" spacing={4}>
										<CritRadioGroup
											onChange={setUncritabilitySetting}
											uncritabilitySetting={uncritabilitySetting}
										/>
										<UncrushableRadioGroup
											onChange={setUncrushabilitySetting}
											uncrushabilitySetting={uncrushabilitySetting}
										/>
									</Stack>
								</Box>

								<Divider />

								<StatsEntry stats={optimizeStats} onChange={setOptimizeStats} />
							</Stack>
						</TabPanel>

						{/* Tab 1: Config - Character + Buffs & Consumables */}
						<TabPanel value={tabValue} index={1}>
							<Stack spacing={3}>
								<Box>
									<Typography variant="subtitle1" fontWeight="medium" gutterBottom>
										Character
									</Typography>
									<Stack direction="row" spacing={2}>
										<ClassSelect value={classValue} onChange={setClassValue} />
										<RaceSelect value={raceValue} onChange={setRaceValue} />
									</Stack>
								</Box>

								<Divider />

								<Grid container spacing={3}>
									<Grid size={6}>
										<Typography variant="subtitle1" fontWeight="medium" gutterBottom>
											Buffs
										</Typography>
										<FormGroup>
											<FormControlLabel
												control={<Checkbox defaultChecked size="small" />}
												label="Mark of the Wild"
											/>
											<FormControlLabel
												control={<Checkbox defaultChecked size="small" />}
												label="Improved Mark of the Wild"
											/>
											<FormControlLabel
												control={<Checkbox defaultChecked size="small" />}
												label="Blessing of Kings"
											/>
											<FormControlLabel
												control={<Checkbox size="small" />}
												label="Grace of Air Totem"
											/>
										</FormGroup>
									</Grid>
									<Grid size={6}>
										<Typography variant="subtitle1" fontWeight="medium" gutterBottom>
											Consumables
										</Typography>
										<FormGroup>
											<FormControlLabel
												control={<Checkbox size="small" />}
												label="Scroll of Agility V"
											/>
										</FormGroup>
										<Box sx={{ mt: 2 }}>
											<ElixirFlaskFormGroup />
										</Box>
									</Grid>
								</Grid>
							</Stack>
						</TabPanel>
					</Box>

					{/* Submit Button - Always visible */}
					<Box sx={{ p: 2, pt: 0 }}>
						<Button
							variant="contained"
							size="large"
							fullWidth
							onClick={async () => {
								const items = await solve(
									itemIds.map((id) => id.toString()),
									{
										raceId: raceValue.toString(),
										classId: classValue.toString(),
										uncrushabilitySetting,
										uncritabilitySetting,
										optimizeStats: optimizeStats,
										areEnchantsGemsLocked,
									},
								);
								setItems(items);
							}}
						>
							Solve
						</Button>
					</Box>
				</Paper>
			</Grid>

			{/* Right Side - Results */}
			<Grid size={4}>
				<Stack spacing={2} sx={{ p: 2 }}>
					<Paper elevation={2} sx={{ p: 2 }}>
						<Typography variant="h6" gutterBottom>
							Equipment
						</Typography>
						<ItemGroupDisplay items={items} />
					</Paper>

					{items.length > 0 && (
						<Paper elevation={2} sx={{ p: 2 }}>
							<Typography variant="h6" gutterBottom>
								Stats Summary
							</Typography>
							<Grid container spacing={1}>
								{statsData.map((stat) => (
									<Grid size={6} key={stat.label}>
										<Box
											sx={{
												display: "flex",
												justifyContent: "space-between",
												py: 0.5,
												px: 1,
												bgcolor: "action.hover",
												borderRadius: 1,
											}}
										>
											<Typography variant="body2" color="text.secondary">
												{stat.label}
											</Typography>
											<Typography variant="body2" fontWeight="medium">
												{stat.value.toFixed(2)}
											</Typography>
										</Box>
									</Grid>
								))}
							</Grid>
						</Paper>
					)}
				</Stack>
			</Grid>
		</Grid>
	);
}
