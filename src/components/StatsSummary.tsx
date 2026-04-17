import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import StatsDisplay from "#/components/StatsDisplay";
import { getAvoidanceFromItems } from "#/helpers.ts/getStatFromItem";
import type { LPItem } from "#/solver/types";

interface StatsSummaryProps {
	items: LPItem[];
	baseAvoidance: number;
	baseUncritability: number;
}

export default function StatsSummary({
	items,
	baseAvoidance,
	baseUncritability,
}: StatsSummaryProps) {
	if (!items || items.length === 0) {
		return null;
	}

	const totalAvoidance = getAvoidanceFromItems(items) + baseAvoidance;
	const avoidanceFromItems = getAvoidanceFromItems(items);
	const uncritabilityScore =
		items.reduce((acc, item) => acc + item.uncritabilityScore, 0) +
		baseUncritability;
	const objectiveScore = items.reduce(
		(acc, item) => acc + item.objectiveScore,
		0,
	);

	return (
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
					<Typography variant="body2" color="text.secondary">
						Total Avoidance
					</Typography>
					<Typography variant="body2" fontWeight="medium">
						{totalAvoidance.toFixed(2)}
					</Typography>
					<Typography variant="body2" color="text.secondary">
						Base Avoidance
					</Typography>
					<Typography variant="body2" fontWeight="medium">
						{baseAvoidance.toFixed(2)}
					</Typography>
					<Typography variant="body2" color="text.secondary">
						Avoidance from items
					</Typography>
					<Typography variant="body2" fontWeight="medium">
						{avoidanceFromItems.toFixed(2)}
					</Typography>
				</Box>
				<Box
					sx={{
						display: "flex",
						justifyContent: "space-between",
					}}
				>
					<Typography variant="body2" color="text.secondary">
						Uncritability Score
					</Typography>
					<Typography variant="body2" fontWeight="medium">
						{uncritabilityScore.toFixed(2)}
					</Typography>
				</Box>
				<Box
					sx={{
						display: "flex",
						justifyContent: "space-between",
					}}
				>
					<Typography variant="body2" color="text.secondary">
						Objective Score
					</Typography>
					<Typography variant="body2" fontWeight="medium">
						{objectiveScore.toFixed(2)}
					</Typography>
				</Box>
				<StatsDisplay
					items={items}
					stats={[
						"Health",
						"Mana",
					]
					}
					header="Health & Mana"
				 />
				<StatsDisplay
					items={items}
					stats={["Armor", "Defense", "Dodge", "Parry", "Block", "Resilience"]}
					header="Defenses"
				/>
				<StatsDisplay
					items={items}
					stats={["SpellPower", "SpellHit", "SpellCrit",]}
					header="Spell"
				/>
			</Stack>
		</Paper>
	);
}
