import Box from "@mui/material/Box";
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

export default function StatsSummary({
	items,
	baseConfig,
	solverConfig,
}: StatsSummaryProps) {
	if (!items || items.length === 0) {
		return null;
	}
	const baseStats = getBaseStats(baseConfig.raceId, baseConfig.classId);
	const modifierSources = [
		...baseConfig.abilitySources,
		...baseConfig.talentSources,
		...solverConfig.buffs,
	];

	const stat = (
		statName: Parameters<typeof calculateStatValue>[0]["statName"],
	) => calculateStatValue({ items, modifierSources, baseStats, statName });

	const headlineStats = [
		{ name: "Avoidance", value: stat("Avoidance") },
		{ name: "Shear", value: stat("ShearAvoidance") },
		{ name: "Uncrit", value: stat("Uncritability") },
	];

	const defenseRating = stat("Defense");
	const dodgeRating = stat("Dodge");
	const parryRating = stat("Parry");
	const blockRating = stat("Block");
	const resilienceRating = calculateStatValue({
		items,
		modifierSources,
		baseStats,
		statName: "Resilience",
		roundDefenseAndResilience: true,
	});
	const spellHitRating = stat("SpellHit");
	const spellCritRating = stat("SpellCrit");

	const mitigationStats = [
		{ name: "Health", value: stat("TotalHealth") },
		{ name: "Armor", value: stat("Armor") },
		{ name: "Effective HP", value: Math.trunc(stat("Effective HP")) },
		{
			name: "Defense",
			value:
				350 +
				convertStatToPercentageOrSkill(
					{ name: "Defense", value: defenseRating, type: "flat" },
					true,
				),
			rating: defenseRating,
		},
		{
			name: "Dodge",
			value: convertStatToPercentageOrSkill(
				{ name: "Dodge", value: dodgeRating, type: "flat" },
				true,
			),
			unit: "%" as const,
			rating: dodgeRating,
		},
		{
			name: "Parry",
			value: convertStatToPercentageOrSkill(
				{ name: "Parry", value: parryRating, type: "flat" },
				true,
			),
			unit: "%" as const,
			rating: parryRating,
		},
		{
			name: "Block",
			value: convertStatToPercentageOrSkill(
				{ name: "Block", value: blockRating, type: "flat" },
				true,
			),
			unit: "%" as const,
			rating: blockRating,
		},
		{ name: "Miss", value: stat("Miss"), unit: "%" as const },
		{
			name: "Resilience",
			value: convertStatToPercentageOrSkill(
				{ name: "Resilience", value: resilienceRating, type: "flat" },
				true,
			),
			unit: "%" as const,
			rating: resilienceRating,
		},
	];

	const threatStats = [
		{ name: "Spell Power", value: stat("SpellPower") },
		{
			name: "Spell Hit",
			value: convertStatToPercentageOrSkill({
				name: "SpellHit",
				value: spellHitRating,
				type: "flat",
			}),
			unit: "%" as const,
			rating: spellHitRating,
		},
		{
			name: "Spell Crit",
			value: convertStatToPercentageOrSkill({
				name: "SpellCrit",
				value: spellCritRating,
				type: "flat",
			}),
			unit: "%" as const,
			rating: spellCritRating,
		},
		{ name: "Mana", value: stat("Mana") },
	];

	const staminaValue = stat("Stamina");
	const intellectValue = stat("Intellect");
	const baseStatRows = [
		{ name: "Strength", value: stat("Strength") },
		{ name: "Agility", value: stat("Agility") },
		{ name: "Stamina", value: staminaValue },
		{ name: "Intellect", value: intellectValue },
		{ name: "Spirit", value: stat("Spirit") },
	];

	return (
		<Box
			sx={{
				display: "flex",
				flexDirection: "column",
				gap: 2,
				p: 1.75,
				borderRadius: 1,
				bgcolor: "action.hover",
			}}
		>
			<Box
				sx={{
					display: "grid",
					gridTemplateColumns: `repeat(${headlineStats.length}, 1fr)`,
					gap: 1,
					borderRadius: 1,
					bgcolor: "background.paper",
					border: 1,
					borderColor: "divider",
					p: 1.25,
				}}
			>
				{headlineStats.map((s) => (
					<Box key={s.name} sx={{ minWidth: 0 }}>
						<Typography
							variant="overline"
							color="text.secondary"
							sx={{ lineHeight: 1.5, whiteSpace: "nowrap" }}
						>
							{s.name}
						</Typography>
						<Typography
							variant="h5"
							color="primary.light"
							fontWeight={700}
							sx={{ whiteSpace: "nowrap" }}
						>
							{s.value.toLocaleString(undefined, {
								minimumFractionDigits: s.value % 1 === 0 ? 0 : 2,
								maximumFractionDigits: s.value % 1 === 0 ? 0 : 2,
							})}
						</Typography>
					</Box>
				))}
			</Box>

			<StatsGroup header="Mitigation" stats={mitigationStats} showRating />
			<StatsGroup header="Threat" stats={threatStats} showRating />
			<StatsGroup
				header="Base Stats"
				stats={baseStatRows}
				defaultExpanded={false}
				collapsedSummary={`${Math.round(staminaValue).toLocaleString()} sta · ${Math.round(intellectValue).toLocaleString()} int`}
			/>
		</Box>
	);
}
