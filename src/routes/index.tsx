import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import FormGroup from "@mui/material/FormGroup";
import FormLabel from "@mui/material/FormLabel";
import Grid from "@mui/material/Grid";
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
				<Box display="flex" flexDirection="column" height="100vh">
					<Box>
						<Grid container spacing={2}>
							<Grid size={3}>
								<Typography variant="h6">Items</Typography>

								<TextField label="Item IDs" variant="outlined" />
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
								/>
							</Grid>
							<Grid size={4}>
								<StatsEntry stats={optimizeStats} onChange={setOptimizeStats} />
							</Grid>
							<Grid size={4}>
								<Typography variant="h6">Constraints</Typography>
								<CritRadioGroup
									onChange={setUncritabilitySetting}
									uncritabilitySetting={uncritabilitySetting}
								/>
								<UncrushableRadioGroup
									onChange={setUncrushabilitySetting}
									uncrushabilitySetting={uncrushabilitySetting}
								/>
							</Grid>
						</Grid>
					</Box>

					<Box mt={2}>
						<div>Settings</div>
						<Grid container spacing={2}>
							{/* Class + Race */}
							<Grid size={2}>
								<ClassSelect value={classValue} onChange={setClassValue} />
							</Grid>
							<Grid size={10}>
								<RaceSelect value={raceValue} onChange={setRaceValue} />
							</Grid>

							{/* TODO Buffs */}
							<Grid size={12}>
								<FormGroup>
									<FormLabel>Buffs</FormLabel>
									<FormControlLabel
										control={<Checkbox defaultChecked />}
										label="Mark of the Wild"
									/>
									<FormControlLabel
										control={<Checkbox defaultChecked />}
										label="Improved Mark of the Wild"
									/>
									<FormControlLabel
										control={<Checkbox defaultChecked />}
										label="Blessing of Kings"
									/>
									<FormControlLabel
										control={<Checkbox />}
										label="Grace of Air Totem"
									/>
								</FormGroup>
							</Grid>
							<Grid size={12}>
								<FormGroup>
									<FormLabel>Consumables</FormLabel>
									<FormControlLabel
										control={<Checkbox />}
										label="Scroll of Agility V"
									/>
								</FormGroup>
								<ElixirFlaskFormGroup />
							</Grid>
						</Grid>
					</Box>

					<Box mt={2}>
						<Button
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
							Submit
						</Button>
					</Box>
				</Box>
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
