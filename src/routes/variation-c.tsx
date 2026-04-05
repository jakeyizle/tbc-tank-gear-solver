import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import FormControlLabel from "@mui/material/FormControlLabel";
import FormGroup from "@mui/material/FormGroup";
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

export const Route = createFileRoute("/variation-c")({ component: VariationC });

const itemIds = [
	29388, 28754, 28316, 25828, 28593, 30641, 28520, 28746, 25362, 28528, 27529,
	30300, 28516, 29126, 29323, 7005, 29068, 28245, 28743, 27804, 28262, 28502,
	29067, 29153, 28611, 29253, 29069, 29254, 29279, 29172, 29370, 29132,
];

/**
 * Variation C: Compact Single-Column with Horizontal Stats Grid
 * - All config in one scrollable column for maximum density
 * - Horizontal chip/grid layout for stats summary
 * - Inline sections with minimal padding
 * - Designed to scale with many more stats
 */
function VariationC() {
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

	const avoidanceTotal = items.reduce((acc, item) => acc + item.avoidanceScore, 0);
	const uncritTotal = items.reduce((acc, item) => acc + item.uncritabilityScore, 0);
	const objectiveTotal = items.reduce((acc, item) => acc + item.objectiveScore, 0);

	return (
		<Grid container spacing={0}>
			{/* Left Side - Single Column Configuration */}
			<Grid size={7}>
				<Box
					sx={{
						p: 2,
						maxHeight: "100vh",
						overflowY: "auto",
						borderRight: 1,
						borderColor: "divider",
					}}
				>
					<Stack spacing={2}>
						{/* Header Row: Character + Items Input */}
						<Paper variant="outlined" sx={{ p: 2 }}>
							<Stack direction="row" spacing={2} alignItems="flex-start">
								<Box sx={{ minWidth: 200 }}>
									<Typography variant="overline" color="text.secondary">
										Character
									</Typography>
									<Stack direction="row" spacing={1} sx={{ mt: 0.5 }}>
										<ClassSelect value={classValue} onChange={setClassValue} />
										<RaceSelect value={raceValue} onChange={setRaceValue} />
									</Stack>
								</Box>
								<Divider orientation="vertical" flexItem />
								<Box sx={{ flex: 1 }}>
									<Typography variant="overline" color="text.secondary">
										Items
									</Typography>
									<TextField
										placeholder="Enter Item IDs..."
										variant="outlined"
										fullWidth
										size="small"
										sx={{ mt: 0.5 }}
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
										label={
											<Typography variant="body2">Lock Enchants/Gems</Typography>
										}
									/>
								</Box>
							</Stack>
						</Paper>

						{/* Constraints Row */}
						<Paper variant="outlined" sx={{ p: 2 }}>
							<Typography variant="overline" color="text.secondary">
								Constraints
							</Typography>
							<Stack direction="row" spacing={4} sx={{ mt: 1 }}>
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

						{/* Stats to Optimize */}
						<Paper variant="outlined" sx={{ p: 2 }}>
							<Typography variant="overline" color="text.secondary">
								Optimize Stats
							</Typography>
							<Box sx={{ mt: 1 }}>
								<StatsEntry stats={optimizeStats} onChange={setOptimizeStats} />
							</Box>
						</Paper>

						{/* Buffs & Consumables - Compact Inline */}
						<Paper variant="outlined" sx={{ p: 2 }}>
							<Typography variant="overline" color="text.secondary">
								Buffs & Consumables
							</Typography>
							<Stack direction="row" spacing={3} sx={{ mt: 1 }}>
								<FormGroup row>
									<FormControlLabel
										control={<Checkbox defaultChecked size="small" />}
										label={<Typography variant="body2">MotW</Typography>}
									/>
									<FormControlLabel
										control={<Checkbox defaultChecked size="small" />}
										label={<Typography variant="body2">Imp MotW</Typography>}
									/>
									<FormControlLabel
										control={<Checkbox defaultChecked size="small" />}
										label={<Typography variant="body2">BoK</Typography>}
									/>
									<FormControlLabel
										control={<Checkbox size="small" />}
										label={<Typography variant="body2">GoA</Typography>}
									/>
									<FormControlLabel
										control={<Checkbox size="small" />}
										label={<Typography variant="body2">Agi Scroll</Typography>}
									/>
								</FormGroup>
								<Divider orientation="vertical" flexItem />
								<ElixirFlaskFormGroup />
							</Stack>
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
								setItems(items);
							}}
						>
							Solve
						</Button>
					</Stack>
				</Box>
			</Grid>

			{/* Right Side - Equipment + Stats Grid */}
			<Grid size={5}>
				<Box sx={{ p: 2 }}>
					<Stack spacing={2}>
						{/* Equipment */}
						<Paper variant="outlined" sx={{ p: 2 }}>
							<Typography variant="overline" color="text.secondary">
								Equipment
							</Typography>
							<Box sx={{ mt: 1 }}>
								<ItemGroupDisplay items={items} />
							</Box>
						</Paper>

						{/* Stats Summary - Horizontal Grid */}
						{items.length > 0 && (
							<Paper variant="outlined" sx={{ p: 2 }}>
								<Typography variant="overline" color="text.secondary">
									Stats Summary
								</Typography>
								<Grid container spacing={1} sx={{ mt: 1 }}>
									<Grid size={4}>
										<Paper
											elevation={0}
											sx={{
												p: 1.5,
												textAlign: "center",
												bgcolor: "success.light",
												color: "success.contrastText",
												borderRadius: 2,
											}}
										>
											<Typography variant="caption" display="block">
												Avoidance
											</Typography>
											<Typography variant="h6" fontWeight="bold">
												{avoidanceTotal.toFixed(1)}
											</Typography>
										</Paper>
									</Grid>
									<Grid size={4}>
										<Paper
											elevation={0}
											sx={{
												p: 1.5,
												textAlign: "center",
												bgcolor: "info.light",
												color: "info.contrastText",
												borderRadius: 2,
											}}
										>
											<Typography variant="caption" display="block">
												Uncrit
											</Typography>
											<Typography variant="h6" fontWeight="bold">
												{uncritTotal.toFixed(1)}
											</Typography>
										</Paper>
									</Grid>
									<Grid size={4}>
										<Paper
											elevation={0}
											sx={{
												p: 1.5,
												textAlign: "center",
												bgcolor: "primary.light",
												color: "primary.contrastText",
												borderRadius: 2,
											}}
										>
											<Typography variant="caption" display="block">
												Objective
											</Typography>
											<Typography variant="h6" fontWeight="bold">
												{objectiveTotal.toFixed(1)}
											</Typography>
										</Paper>
									</Grid>
									{/* Placeholder for future stats - easy to add more */}
									<Grid size={4}>
										<Paper
											elevation={0}
											sx={{
												p: 1.5,
												textAlign: "center",
												bgcolor: "grey.100",
												borderRadius: 2,
												border: "1px dashed",
												borderColor: "grey.300",
											}}
										>
											<Typography variant="caption" color="text.secondary">
												+ Stamina
											</Typography>
										</Paper>
									</Grid>
									<Grid size={4}>
										<Paper
											elevation={0}
											sx={{
												p: 1.5,
												textAlign: "center",
												bgcolor: "grey.100",
												borderRadius: 2,
												border: "1px dashed",
												borderColor: "grey.300",
											}}
										>
											<Typography variant="caption" color="text.secondary">
												+ Armor
											</Typography>
										</Paper>
									</Grid>
									<Grid size={4}>
										<Paper
											elevation={0}
											sx={{
												p: 1.5,
												textAlign: "center",
												bgcolor: "grey.100",
												borderRadius: 2,
												border: "1px dashed",
												borderColor: "grey.300",
											}}
										>
											<Typography variant="caption" color="text.secondary">
												+ Defense
											</Typography>
										</Paper>
									</Grid>
								</Grid>
							</Paper>
						)}
					</Stack>
				</Box>
			</Grid>
		</Grid>
	);
}
