import Box from "@mui/material/Box";
import Grid from "@mui/material/Grid";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { getBaseStats } from "#/data/baseStats";
import { convertStatToPercentageOrSkill } from "#/helpers/convertStat";
import { calculateStatValue } from "#/helpers/stats";
import type { LPItem } from "#/solver/types";
import type { BaseConfig, SolverConfiguration } from "#/types/SolverConfig";
import StatsGroup from "./StatsGroup";

interface StatsSummaryProps {
	items: LPItem[];
	baseConfig: BaseConfig;
	solverConfig: SolverConfiguration;
}

export default function StatsSummary({ items, baseConfig, solverConfig }: StatsSummaryProps) {

	if (!items || items.length === 0) {
		return null;
	}
	const baseStats = getBaseStats(baseConfig.raceId, baseConfig.classId);
	const modifierSources = [...baseConfig.abilitySources, ...baseConfig.talentSources, ...solverConfig.buffs];

	const headlineStats = [
		{
			name: "Avoidance",
			value: calculateStatValue({items, modifierSources, baseStats, statName: "Avoidance"}),
		},
		{
			name: "Shear Avoidance",
			value: calculateStatValue({items, modifierSources, baseStats, statName: "ShearAvoidance"}),
		},
		{
			name: "Uncritability",
			value: calculateStatValue({items, modifierSources, baseStats, statName: "Uncritability"}),
		},
	];

	const survivabilityStats = [
		{
			name: "Health",
			value: calculateStatValue({items, modifierSources, baseStats, statName: "TotalHealth"}),
		},
		{
			name: "Armor",
			value: calculateStatValue({items, modifierSources, baseStats, statName: "Armor"}),
		},
		{
			name: "Effective HP",
			value: calculateStatValue({items, modifierSources, baseStats, statName: "Effective HP"}),
		},
	];

	const threatStats = [
		{
			name: "Spell Power",
			value: calculateStatValue({items, modifierSources, baseStats, statName: "SpellPower"}),
		},
		{
			name: "Spell Hit",
			value: calculateStatValue({items, modifierSources, baseStats, statName: "SpellHit"}),
		},
		{
			name: "Spell Crit",
			value: calculateStatValue({items, modifierSources, baseStats, statName: "SpellCrit"}),
		},
		{
			name: "Mana",
			value: calculateStatValue({items, modifierSources, baseStats, statName: "Mana"}),
		},
	];

	const mitigationStats = [
		{
			name: "Defense",
			value: 350 + convertStatToPercentageOrSkill({name: "Defense", value: calculateStatValue({items, modifierSources, baseStats, statName: "Defense"}), type: "flat"}, true),
		},
		{
			name: "Dodge",
			value: convertStatToPercentageOrSkill({name: "Dodge", value: calculateStatValue({items, modifierSources, baseStats, statName: "Dodge"}), type: "flat"}, true),
			unit: "%" as const,
		},
		{
			name: "Parry",
			value: convertStatToPercentageOrSkill({name: "Parry", value: calculateStatValue({items, modifierSources, baseStats, statName: "Parry"}), type: "flat"}, true),
			unit: "%" as const,
		},
		{
			name: "Block",
			value: convertStatToPercentageOrSkill({name: "Block", value: calculateStatValue({items, modifierSources, baseStats, statName: "Block"}), type: "flat"}, true),
			unit: "%" as const,
		},
		{
			name: "Miss",
			value: convertStatToPercentageOrSkill({name: "Miss", value: calculateStatValue({items, modifierSources, baseStats, statName: "Miss"}), type: "flat"}, true),
			unit: "%" as const,
		},
		{
			name: "Resilience",
			value: calculateStatValue({items, modifierSources, baseStats, statName: "Resilience", roundDefenseAndResilience: true}),
		},
	];

	const baseStatRows = [
		{
			name: "Strength",
			value: calculateStatValue({items, modifierSources, baseStats, statName: "Strength"}),
		},
		{
			name: "Agility",
			value: calculateStatValue({items, modifierSources, baseStats, statName: "Agility"}),
		},
		{
			name: "Stamina",
			value: calculateStatValue({items, modifierSources, baseStats, statName: "Stamina"}),
		},
		{
			name: "Intellect",
			value: calculateStatValue({items, modifierSources, baseStats, statName: "Intellect"}),
		},
		{
			name: "Spirit",
			value: calculateStatValue({items, modifierSources, baseStats, statName: "Spirit"}),
		},
	];

	const columns = [
		{ header: "Survivability", stats: survivabilityStats },
		{ header: "Threat", stats: threatStats },
		{ header: "Mitigation", stats: mitigationStats },
		{ header: "Base Stats", stats: baseStatRows },
	];

	return (
		<Paper elevation={1} sx={{ p: 2 }}>
			<Typography variant="h6" gutterBottom>
				Stats Summary
			</Typography>

			<Stack
				direction="row"
				spacing={4}
				sx={{
					mb: 3,
					p: 2,
					borderRadius: 1,
					bgcolor: "action.hover",
				}}
			>
				{headlineStats.map((stat) => (
					<Box key={stat.name}>
						<Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1.5 }}>
							{stat.name}
						</Typography>
						<Typography variant="h5" color="primary.light" fontWeight={700}>
							{stat.value.toFixed(stat.value % 1 === 0 ? 0 : 2)}
						</Typography>
					</Box>
				))}
			</Stack>

			<Grid container spacing={2}>
				{columns.map((column, index) => (
					<Grid
						key={column.header}
						size={{ xs: 12, sm: 6, md: 3 }}
						sx={{
							borderRight: index < columns.length - 1 ? { md: 1 } : 0,
							borderColor: "divider",
							pr: { md: 2 },
						}}
					>
						<StatsGroup header={column.header} stats={column.stats} />
					</Grid>
				))}
			</Grid>
		</Paper>
	);
}
