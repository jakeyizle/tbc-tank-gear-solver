import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { getBaseStats } from "#/data/baseStats";
import { convertStatToPercentageOrSkill } from "#/helpers/convertStat";
import { buildStatInputs } from "#/helpers/resultStats";
import { calculateStatValue } from "#/helpers/stats";
import {
	type LPItem,
	type ModifierSource,
	STAT_LABELS,
	type Stat,
} from "#/solver/types";
import type { SimMetricsSnapshot } from "#/types/SimCalibrationProfile";
import type { BaseConfig, SolverConfiguration } from "#/types/SolverConfig";
import StatsGroup from "./StatsGroup";
import StatWeightTabs from "./StatWeightTabs";

function buffTooltip(buff: ModifierSource): string {
	return buff.stats
		.map((s) =>
			s.type === "multiplier"
				? `${STAT_LABELS[s.name]} +${(s.value * 100).toLocaleString()}%`
				: `${STAT_LABELS[s.name]} +${s.value.toLocaleString()}`,
		)
		.join(", ");
}

interface StatsSummaryProps {
	items: LPItem[];
	baseConfig: BaseConfig;
	solverConfig: SolverConfiguration;
	includeBuffsConsumables: boolean;
	simMetrics?: SimMetricsSnapshot;
	perMetricStatWeights?: Record<"tps" | "dtps" | "tmi", Stat[]>;
	perMetricStatWeightStdevs?: Record<"tps" | "dtps" | "tmi", Stat[]>;
}

export default function StatsSummary({
	items: rawItems,
	baseConfig,
	solverConfig,
	includeBuffsConsumables,
	simMetrics,
	perMetricStatWeights,
	perMetricStatWeightStdevs,
}: StatsSummaryProps) {
	if (!rawItems || rawItems.length === 0) {
		return null;
	}
	const baseStats = getBaseStats(baseConfig.raceId, baseConfig.classId);
	const { items, modifierSources, buffSources } = buildStatInputs(
		rawItems,
		baseConfig,
		solverConfig,
		includeBuffsConsumables,
	);

	const stat = (
		statName: Parameters<typeof calculateStatValue>[0]["statName"],
	) => calculateStatValue({ items, modifierSources, baseStats, statName });

	const defenseRating = stat("Defense");
	const dodgeRating = stat("Dodge");
	const parryRating = stat("Parry");
	const blockRating = stat("Block");

	// Dodge% + Parry% + Miss% - the subset of avoidance that counts toward uncrushable, excluding
	// Block (see solveEHP.ts's solveConfigForHardAvoidance, which optimizes exactly this). Reuses
	// dodgeRating/parryRating (also used below for the Mitigation group's Dodge/Parry rows) and the
	// same roundRating=true conversion, so this headline number always matches what those rows show.
	const hardAvoidance =
		convertStatToPercentageOrSkill(
			{ name: "Dodge", value: dodgeRating, type: "flat" },
			true,
		) +
		convertStatToPercentageOrSkill(
			{ name: "Parry", value: parryRating, type: "flat" },
			true,
		) +
		stat("Miss");

	const headlineStats = [
		{ name: "Avoidance", value: stat("Avoidance") },
		{ name: "Shear", value: stat("ShearAvoidance") },
		{ name: "Hard Avoidance", value: hardAvoidance },
		{ name: "Uncrit", value: stat("Uncritability") },
	];
	const resilienceRating = calculateStatValue({
		items,
		modifierSources,
		baseStats,
		statName: "Resilience",
		roundDefenseAndResilience: true,
	});
	const spellHitRating = stat("SpellHit");
	const spellCritRating = stat("SpellCrit");

	const armorValue = stat("Armor");
	// The 75% cap is a display-only clamp (matches the reference WeakAura, which caps the shown
	// dr% but computes Effective HP - see calculateEffectiveHP in stats.ts - from the uncapped
	// value): true in-game physical damage reduction can never exceed 75%, even though the
	// armor/(armor+K) curve alone would only approach 100% asymptotically.
	const armorDR =
		Math.min(
			convertStatToPercentageOrSkill({
				name: "Armor",
				value: armorValue,
				type: "flat",
			}),
			0.75,
		) * 100;

	const mitigationStats = [
		{ name: "Health", value: stat("TotalHealth") },
		{ name: "Armor", value: armorValue },
		{ name: "Armor DR", value: armorDR, unit: "%" as const },
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
		{ name: "Block Value", value: stat("BlockValue") },
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
		{ name: "Mana", value: stat("TotalMana") },
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

	// simMetrics is now measured for every objective mode (see solver.worker.ts), so this just
	// waits for it to be present - e.g. still-in-flight solves, or old cached results from
	// before this was added.
	const showSimMetrics = simMetrics != null;
	const simMetricStats = showSimMetrics
		? [
				{ name: "TPS", value: simMetrics.tps },
				{ name: "DTPS", value: simMetrics.dtps },
				{ name: "TMI-5", value: simMetrics.tmi5 },
			]
		: [];
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
					// Labels/values are placed on their own explicit grid rows (rather than each
					// stat being its own independent label-over-value column) so a longer label
					// like "Hard Avoidance" can wrap to two lines without pushing just its own
					// value down - every value still starts on the same row 2 grid line, so the
					// numbers stay aligned across all headline stats regardless of label length.
					gridTemplateRows: "auto auto",
					columnGap: 2,
					rowGap: 0.25,
					borderRadius: 1,
					bgcolor: "background.paper",
					border: 1,
					borderColor: "divider",
					p: 1.25,
				}}
			>
				{headlineStats.slice(1).map((s, i) => (
					<Box
						key={`${s.name}-divider`}
						sx={{
							gridColumn: i + 2,
							gridRow: "1 / 3",
							justifySelf: "start",
							ml: -1,
							borderLeft: 1,
							borderColor: "divider",
						}}
					/>
				))}
				{headlineStats.map((s, i) => (
					<Typography
						key={`${s.name}-label`}
						variant="overline"
						color="text.secondary"
						sx={{
							lineHeight: 1.3,
							gridColumn: i + 1,
							gridRow: 1,
							alignSelf: "end",
							minWidth: 0,
						}}
					>
						{s.name}
					</Typography>
				))}
				{headlineStats.map((s, i) => (
					<Typography
						key={`${s.name}-value`}
						variant="h5"
						color="primary.light"
						fontWeight={700}
						sx={{
							whiteSpace: "nowrap",
							gridColumn: i + 1,
							gridRow: 2,
							minWidth: 0,
						}}
					>
						{s.value.toLocaleString(undefined, {
							minimumFractionDigits: s.value % 1 === 0 ? 0 : 2,
							maximumFractionDigits: s.value % 1 === 0 ? 0 : 2,
						})}
					</Typography>
				))}
			</Box>

			{includeBuffsConsumables && (
				<Box
					sx={{
						display: "flex",
						alignItems: "center",
						gap: 1,
						flexWrap: "wrap",
					}}
				>
					<Typography
						variant="overline"
						color="text.secondary"
						sx={{ lineHeight: 1.5 }}
					>
						Buffs included
					</Typography>
					{buffSources.length === 0 ? (
						<Typography
							variant="body2"
							color="text.secondary"
							fontStyle="italic"
						>
							None
						</Typography>
					) : (
						buffSources.map((buff) => (
							<Tooltip key={buff.id} title={buffTooltip(buff)} arrow>
								<Chip label={buff.name} size="small" variant="outlined" />
							</Tooltip>
						))
					)}
				</Box>
			)}

			{showSimMetrics && (
				<Box
					sx={{
						display: "grid",
						gridTemplateColumns: `repeat(${simMetricStats.length}, 1fr)`,
						gap: 1,
						borderRadius: 1,
						bgcolor: "background.paper",
						border: 1,
						borderColor: "divider",
						p: 1.25,
					}}
				>
					{simMetricStats.map((s) => (
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
								color="secondary.light"
								fontWeight={700}
								sx={{ whiteSpace: "nowrap" }}
							>
								{s.value.toLocaleString(undefined, {
									maximumFractionDigits: 0,
								})}
							</Typography>
						</Box>
					))}
				</Box>
			)}

			{showSimMetrics && perMetricStatWeights && perMetricStatWeightStdevs && (
				<StatWeightTabs
					perMetricStatWeights={perMetricStatWeights}
					perMetricStatWeightStdevs={perMetricStatWeightStdevs}
				/>
			)}

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
