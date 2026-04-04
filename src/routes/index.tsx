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
				<Stack spacing={3} sx={{ p: 2 }}>
					{/* Character Section */}
					<Paper elevation={2} sx={{ p: 3 }}>
						<Typography variant="h6" gutterBottom>
							Character
						</Typography>
						<Stack direction="row" spacing={2}>
							<ClassSelect value={classValue} onChange={setClassValue} />
							<RaceSelect value={raceValue} onChange={setRaceValue} />
						</Stack>
					</Paper>

					{/* Items & Optimization Section */}
					<Paper elevation={2} sx={{ p: 3 }}>
						<Typography variant="h6" gutterBottom>
							Items
						</Typography>
						<Stack spacing={3}>
							<Box>
								<TextField
									label="Item IDs"
									variant="outlined"
									fullWidth
									size="small"
								/>
								<FormControlLabel
									control={
										<Checkbox
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

							<StatsEntry stats={optimizeStats} onChange={setOptimizeStats} />
						</Stack>
					</Paper>

					{/* Constraints Section */}
					<Paper elevation={2} sx={{ p: 3 }}>
						<Typography variant="h6" gutterBottom>
							Constraints
						</Typography>
						<Stack direction={{ xs: "column", sm: "row" }} spacing={4}>
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

					{/* Buffs & Consumables Section */}
					<Paper elevation={2} sx={{ p: 3 }}>
						<Typography variant="h6" gutterBottom>
							Buffs & Consumables
						</Typography>
						<Grid container spacing={3}>
							<Grid size={{ xs: 12, md: 6 }}>
								<FormGroup>
									<FormLabel sx={{ mb: 1 }}>Buffs</FormLabel>
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
							<Grid size={{ xs: 12, md: 6 }}>
								<FormGroup>
									<FormLabel sx={{ mb: 1 }}>Consumables</FormLabel>
									<FormControlLabel
										control={<Checkbox size="small" />}
										label="Scroll of Agility V"
									/>
								</FormGroup>
								<ElixirFlaskFormGroup />
							</Grid>
						</Grid>
					</Paper>

					{/* Submit Button */}
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
				</Stack>
			</Grid>

			<Grid size={4}>
				<Box display="flex" flexDirection="column">
					<ItemGroupDisplay items={items} />
					{items && (
						<Box mt={2}>
							<div>
								Avoidance Score:{" "}
								{items.reduce((acc, item) => acc + item.avoidanceScore, 0)}
							</div>
							<div>
								Uncritability Score:{" "}
								{items.reduce((acc, item) => acc + item.uncritabilityScore, 0)}
							</div>
							<div>
								Objective Score:{" "}
								{items.reduce((acc, item) => acc + item.objectiveScore, 0)}
							</div>
						</Box>
					)}
				</Box>
			</Grid>
		</Grid>
	);
}
