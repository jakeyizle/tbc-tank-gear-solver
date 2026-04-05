import Accordion from "@mui/material/Accordion";
import AccordionDetails from "@mui/material/AccordionDetails";
import AccordionSummary from "@mui/material/AccordionSummary";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import Chip from "@mui/material/Chip";
import FormControlLabel from "@mui/material/FormControlLabel";
import FormGroup from "@mui/material/FormGroup";
import FormLabel from "@mui/material/FormLabel";
import Grid from "@mui/material/Grid";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
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

export const Route = createFileRoute("/variation-a")({ component: VariationA });

const itemIds = [
	29388, 28754, 28316, 25828, 28593, 30641, 28520, 28746, 25362, 28528, 27529,
	30300, 28516, 29126, 29323, 7005, 29068, 28245, 28743, 27804, 28262, 28502,
	29067, 29153, 28611, 29253, 29069, 29254, 29279, 29172, 29370, 29132,
];

/**
 * Variation A: Accordion-Based Expandable Sections
 * - Collapsible sections that can expand/collapse
 * - Primary sections (Items, Constraints, Stats) expanded by default
 * - Secondary sections (Character, Buffs) collapsed by default
 * - Great for adding more settings without overwhelming the UI
 */
function VariationA() {
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
			{/* Left Side - Configuration */}
			<Grid size={8}>
				<Box sx={{ p: 2, maxHeight: "100vh", overflowY: "auto" }}>
					<Stack spacing={1}>
						{/* Items - Primary, Expanded */}
						<Accordion defaultExpanded elevation={2}>
							<AccordionSummary expandIcon={<ExpandMoreIcon />}>
								<Typography variant="h6">Items</Typography>
							</AccordionSummary>
							<AccordionDetails>
								<Stack spacing={2}>
									<TextField
										label="Item IDs"
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
									/>
								</Stack>
							</AccordionDetails>
						</Accordion>

						{/* Constraints - Primary, Expanded */}
						<Accordion defaultExpanded elevation={2}>
							<AccordionSummary expandIcon={<ExpandMoreIcon />}>
								<Typography variant="h6">Constraints</Typography>
							</AccordionSummary>
							<AccordionDetails>
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
							</AccordionDetails>
						</Accordion>

						{/* Optimize Stats - Primary, Expanded */}
						<Accordion defaultExpanded elevation={2}>
							<AccordionSummary expandIcon={<ExpandMoreIcon />}>
								<Typography variant="h6">Optimize Stats</Typography>
							</AccordionSummary>
							<AccordionDetails>
								<StatsEntry stats={optimizeStats} onChange={setOptimizeStats} />
							</AccordionDetails>
						</Accordion>

						{/* Character - Secondary, Collapsed */}
						<Accordion elevation={2}>
							<AccordionSummary expandIcon={<ExpandMoreIcon />}>
								<Stack direction="row" spacing={1} alignItems="center">
									<Typography variant="h6">Character</Typography>
									<Chip label="Paladin" size="small" variant="outlined" />
									<Chip label="Human" size="small" variant="outlined" />
								</Stack>
							</AccordionSummary>
							<AccordionDetails>
								<Stack direction="row" spacing={2}>
									<ClassSelect value={classValue} onChange={setClassValue} />
									<RaceSelect value={raceValue} onChange={setRaceValue} />
								</Stack>
							</AccordionDetails>
						</Accordion>

						{/* Buffs & Consumables - Secondary, Collapsed */}
						<Accordion elevation={2}>
							<AccordionSummary expandIcon={<ExpandMoreIcon />}>
								<Stack direction="row" spacing={1} alignItems="center">
									<Typography variant="h6">Buffs & Consumables</Typography>
									<Chip label="3 active" size="small" color="primary" />
								</Stack>
							</AccordionSummary>
							<AccordionDetails>
								<Grid container spacing={3}>
									<Grid size={6}>
										<FormGroup>
											<FormLabel>Buffs</FormLabel>
											<FormControlLabel
												control={<Checkbox defaultChecked size="small" />}
												label="Mark of the Wild"
											/>
											<FormControlLabel
												control={<Checkbox defaultChecked size="small" />}
												label="Improved MotW"
											/>
											<FormControlLabel
												control={<Checkbox defaultChecked size="small" />}
												label="Blessing of Kings"
											/>
											<FormControlLabel
												control={<Checkbox size="small" />}
												label="Grace of Air"
											/>
										</FormGroup>
									</Grid>
									<Grid size={6}>
										<FormGroup>
											<FormLabel>Consumables</FormLabel>
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
							</AccordionDetails>
						</Accordion>

						{/* Submit Button */}
						<Button
							variant="contained"
							size="large"
							fullWidth
							sx={{ mt: 2 }}
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
							<Stack spacing={1.5}>
								<Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
									<Typography variant="body2" color="text.secondary">
										Avoidance
									</Typography>
									<Chip
										label={items.reduce((acc, item) => acc + item.avoidanceScore, 0).toFixed(2)}
										size="small"
										color="success"
									/>
								</Box>
								<Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
									<Typography variant="body2" color="text.secondary">
										Uncritability
									</Typography>
									<Chip
										label={items.reduce((acc, item) => acc + item.uncritabilityScore, 0).toFixed(2)}
										size="small"
										color="info"
									/>
								</Box>
								<Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
									<Typography variant="body2" color="text.secondary">
										Objective
									</Typography>
									<Chip
										label={items.reduce((acc, item) => acc + item.objectiveScore, 0).toFixed(2)}
										size="small"
										color="primary"
									/>
								</Box>
							</Stack>
						</Paper>
					)}
				</Stack>
			</Grid>
		</Grid>
	);
}
