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

export const Route = createFileRoute("/")({ component: App });

const itemIds = [
	29388, 28754, 28316, 25828, 28593, 30641, 28520, 28746, 25362, 28528, 27529,
	30300, 28516, 29126, 29323, 7005, 29068, 28245, 28743, 27804, 28262, 28502,
	29067, 29153, 28611, 29253, 29069, 29254, 29279, 29172, 29370, 29132,
];

function App() {
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

	const [items, setItems] = useState<LPItem[]>([]);
	return (
		<Grid container spacing={2}>
			<Grid size={8}>
				<Box sx={{ p: 2 }}>
					<Grid container spacing={2}>
						{/* Left Column - Primary Input & Main Config */}
						<Grid size={6}>
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

							{/* Constraints - Main Config */}
							<Paper elevation={1} sx={{ p: 2, mb: 2 }}>
								<Typography variant="h6" gutterBottom>
									Constraints
								</Typography>
								<Stack direction="row" spacing={3}>
									<CritRadioGroup
										onChange={setUncritabilitySetting}
										uncritabilitySetting={uncritabilitySetting}
									/>
									<UncrushableRadioGroup
										onChange={setUncrushabilitySetting}
										uncrushabilitySetting={uncrushabilitySetting}
									/>
								</Stack>
							</Paper>

							{/* Stats to Optimize - Main Config */}
							<Paper elevation={1} sx={{ p: 2 }}>
								<StatsEntry stats={optimizeStats} onChange={setOptimizeStats} />
							</Paper>
						</Grid>

						{/* Right Column - Secondary Config */}
						<Grid size={6}>
							{/* Character - 2nd Priority */}
							<Paper elevation={1} sx={{ p: 2, mb: 2 }}>
								<Typography variant="h6" gutterBottom>
									Character
								</Typography>
								<Stack direction="row" spacing={1}>
									<ClassSelect value={classValue} onChange={setClassValue} />
									<RaceSelect value={raceValue} onChange={setRaceValue} />
								</Stack>
							</Paper>

							{/* Buffs & Consumables - Least Important */}
							<Paper elevation={1} sx={{ p: 2 }}>
								<Typography variant="h6" gutterBottom>
									Buffs & Consumables
								</Typography>
								<Stack direction="row" spacing={2}>
									<FormGroup>
										<FormLabel sx={{ fontSize: "0.75rem" }}>Buffs</FormLabel>
										<FormControlLabel
											control={<Checkbox defaultChecked size="small" />}
											label={<Typography variant="body2">Mark of the Wild</Typography>}
										/>
										<FormControlLabel
											control={<Checkbox defaultChecked size="small" />}
											label={<Typography variant="body2">Improved MotW</Typography>}
										/>
										<FormControlLabel
											control={<Checkbox defaultChecked size="small" />}
											label={<Typography variant="body2">Blessing of Kings</Typography>}
										/>
										<FormControlLabel
											control={<Checkbox size="small" />}
											label={<Typography variant="body2">Grace of Air</Typography>}
										/>
									</FormGroup>
									<Box>
										<FormGroup>
											<FormLabel sx={{ fontSize: "0.75rem" }}>Consumables</FormLabel>
											<FormControlLabel
												control={<Checkbox size="small" />}
												label={<Typography variant="body2">Scroll of Agility V</Typography>}
											/>
										</FormGroup>
										<ElixirFlaskFormGroup />
									</Box>
								</Stack>
							</Paper>
						</Grid>

						{/* Submit Button - Full Width */}
						<Grid size={12}>
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
									console.log(
										`Finished - avoidanceScore: ${items.reduce((acc, item) => acc + item.avoidanceScore, 0)} objectiveScore: ${items.reduce((acc, item) => acc + item.objectiveScore, 0)}`,
									);
									setItems(items);
								}}
							>
								Solve
							</Button>
						</Grid>
					</Grid>
				</Box>
			</Grid>

			<Grid size={4}>
				<Stack spacing={2} sx={{ p: 2 }}>
					{/* Equipment Slots */}
					<Paper elevation={1} sx={{ p: 2 }}>
						<Typography variant="h6" gutterBottom>
							Equipment
						</Typography>
						<ItemGroupDisplay items={items} />
					</Paper>

					{/* Stats Summary */}
					{items.length > 0 && (
						<Paper elevation={1} sx={{ p: 2 }}>
							<Typography variant="h6" gutterBottom>
								Stats Summary
							</Typography>
							<Stack spacing={1}>
								<Box sx={{ display: "flex", justifyContent: "space-between" }}>
									<Typography variant="body2" color="text.secondary">
										Avoidance Score
									</Typography>
									<Typography variant="body2" fontWeight="medium">
										{items.reduce((acc, item) => acc + item.avoidanceScore, 0).toFixed(2)}
									</Typography>
								</Box>
								<Box sx={{ display: "flex", justifyContent: "space-between" }}>
									<Typography variant="body2" color="text.secondary">
										Uncritability Score
									</Typography>
									<Typography variant="body2" fontWeight="medium">
										{items.reduce((acc, item) => acc + item.uncritabilityScore, 0).toFixed(2)}
									</Typography>
								</Box>
								<Box sx={{ display: "flex", justifyContent: "space-between" }}>
									<Typography variant="body2" color="text.secondary">
										Objective Score
									</Typography>
									<Typography variant="body2" fontWeight="medium">
										{items.reduce((acc, item) => acc + item.objectiveScore, 0).toFixed(2)}
									</Typography>
								</Box>
							</Stack>
						</Paper>
					)}
				</Stack>
			</Grid>
		</Grid>
	);
}
