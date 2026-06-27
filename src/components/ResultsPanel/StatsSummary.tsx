import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { getBaseStats } from "#/data/baseStats";
import { convertStatToPercentageOrSkill } from "#/helpers.ts/convertStat";
import { calculateStatValue } from "#/helpers.ts/stats";
import type { LPItem } from "#/solver/types";
import type { BaseConfig, SolverConfiguration } from "#/types/SolverConfig";
import StatsDisplay from "./StatsDisplay";

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

	const summaryStats = [
		{
			name: "Avoidance",
			value: calculateStatValue({items, modifierSources, baseStats, statName: "Avoidance"}),
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

	const avoidanceStats = [
		{
			name: "Defense",
			value: 350 + convertStatToPercentageOrSkill({name: "Defense", value: calculateStatValue({items, modifierSources, baseStats, statName: "Defense"}), type: "flat"}, true),
		},
		{
			name: "Dodge",
			value: convertStatToPercentageOrSkill({name: "Dodge", value: calculateStatValue({items, modifierSources, baseStats, statName: "Dodge"}), type: "flat"}, true),
		},
		{
			name: "Parry",
			value: convertStatToPercentageOrSkill({name: "Parry", value: calculateStatValue({items, modifierSources, baseStats, statName: "Parry"}), type: "flat"}, true),
		},
		{
			name: "Block",
			value: convertStatToPercentageOrSkill({name: "Block", value: calculateStatValue({items, modifierSources, baseStats, statName: "Block"}), type: "flat"}, true),
		},
		{
			name: "Miss",
			value: convertStatToPercentageOrSkill({name: "Miss", value: calculateStatValue({items, modifierSources, baseStats, statName: "Miss"}), type: "flat"}, true),
		},
		{
			name: "Resilience",
			value: calculateStatValue({items, modifierSources, baseStats, statName: "Resilience", roundDefenseAndResilience: true}),
		},
	];

	const stats = [
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
				<StatsDisplay stats={stats} header="Base Stats" />
			</Stack>
		</Paper>
	);
}
