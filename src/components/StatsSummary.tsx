import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import StatsDisplay from "#/components/StatsDisplay";
import { getAvoidanceFromItems } from "#/helpers.ts/getStatFromItem";
import StatCalculator from "#/helpers.ts/StatCalculator";
import { useSolveConfig } from "#/hooks/useSolveConfig";
import type { LPItem } from "#/solver/types";

interface StatsSummaryProps {
	items: LPItem[];
	baseAvoidance: number;
	baseUncritability: number;
}

export default function StatsSummary({ items, baseAvoidance, baseUncritability }: StatsSummaryProps) {
	const { solveConfig } = useSolveConfig();
	if (!items || items.length === 0 || !solveConfig) {
		return null;
	}

	const statCalculator = new StatCalculator(
		items,
		solveConfig.raceId,
		solveConfig.classId,
	);

	const avoidance = statCalculator.calculateStat("Avoidance")
	const properAvoidance = getAvoidanceFromItems(items);
	console.log(`avoidance: ${avoidance}, properAvoidance: ${properAvoidance}`);
	console.log(baseAvoidance)

	const summaryStats = [
		{
			name: "Avoidance",
			value: statCalculator.calculateStat("Avoidance") + baseAvoidance,
		},
		{
			name: "Uncritability",
			value: statCalculator.calculateStat("Uncritability") + baseUncritability,
		},
	];

	const survivabilityStats = [
		{
			name: "Health",
			value: statCalculator.calculateStat("Health"),
		},
		{
			name: "Armor",
			value: statCalculator.calculateStat("Armor"),
		},
		{
			name: "Effective HP",
			value: statCalculator.calculateStat("Effective HP"),
		},
	];

	const threatStats = [
		{
			name: "Spell Power",
			value: statCalculator.calculateStat("SpellPower"),
		},
		{
			name: "Spell Hit",
			value: statCalculator.calculateStat("SpellHit"),
		},
		{
			name: "Spell Crit",
			value: statCalculator.calculateStat("SpellCrit"),
		},
		{
			name: "Mana",
			value: statCalculator.calculateStat("Mana"),
		},
	];

	const avoidanceStats = [
		{
			name: "Defense",
			value: statCalculator.calculateStat("Defense"),
		},
		{
			name: "Dodge",
			value: statCalculator.calculateStat("Dodge"),
		},
		{
			name: "Parry",
			value: statCalculator.calculateStat("Parry"),
		},
		{
			name: "Block",
			value: statCalculator.calculateStat("Block"),
		},
		{
			name: "Resilience",
			value: statCalculator.calculateStat("Resilience"),
		},
	];

	const baseStats = [
		{
			name: "Strength",
			value: statCalculator.calculateStat("Strength"),
		},
		{
			name: "Agility",
			value: statCalculator.calculateStat("Agility"),
		},
		{
			name: "Stamina",
			value: statCalculator.calculateStat("Stamina"),
		},
		{
			name: "Intellect",
			value: statCalculator.calculateStat("Intellect"),
		},
		{
			name: "Spirit",
			value: statCalculator.calculateStat("Spirit"),
		},
	];

	return (
		<Paper elevation={1} sx={{ p: 2 }}>
			<Typography variant="h6" gutterBottom>
				Stats Summary
			</Typography>
			<Stack spacing={1}>
				<StatsDisplay stats={summaryStats} header="Defense Summary" />
				<StatsDisplay stats={survivabilityStats} header="Survivability" />
				<StatsDisplay stats={threatStats} header="Threat" />
				<StatsDisplay stats={avoidanceStats} header="Avoidance" />
				<StatsDisplay stats={baseStats} header="Base Stats" />
			</Stack>
		</Paper>
	);
}
