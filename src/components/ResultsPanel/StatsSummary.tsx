import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Typography from "@mui/material/Typography";
import { getBaseStats } from "#/data/baseStats";
import { convertStatToPercentageOrSkill } from "#/helpers/convertStat";
import { buildStatInputs } from "#/helpers/resultStats";
import { calculateStatValue } from "#/helpers/stats";
import type {
	BalanceEndpoint,
	SurvivabilityMetric,
} from "#/sim/solveBalancedSimMetric";
import { absoluteValueForMetric } from "#/sim/solveSimMetric";
import { type LPItem, STAT_LABELS, type Stat } from "#/solver/types";
import type { SimMetricsSnapshot } from "#/types/SimCalibrationProfile";
import type { BaseConfig, SolverConfiguration } from "#/types/SolverConfig";
import StatsGroup from "./StatsGroup";

// Which gear ResultsPanel is currently displaying - "balanced" is the real solve output; the
// other two preview one of the balance slider's endpoints instead, using that endpoint's own
// already-computed gear (see BalanceEndpoint.items) rather than triggering a new solve. Owned
// here since this component is what actually offers the click-through (the endpoint anchors
// below); ResultsPanel just holds the selected value and swaps the displayed items/metrics.
export type GearView = "balanced" | "threat" | "survival";

interface StatsSummaryProps {
	items: LPItem[];
	baseConfig: BaseConfig;
	solverConfig: SolverConfiguration;
	includeBuffsConsumables: boolean;
	simMetrics?: SimMetricsSnapshot;
	statWeights?: Stat[];
	statWeightStdevs?: Stat[];
	// The balance slider's two real anchors - see solveBalancedSimMetric.ts and
	// SimBalanceSlider.tsx. Only set for a "simWeighted" solve.
	simBalanceEndpoints?: { threat: BalanceEndpoint; survival: BalanceEndpoint };
	// Which gear is currently on screen, and how to change it - clicking an endpoint's own label
	// below previews its exact gear (see GearView); clicking the already-selected one switches
	// back to the balanced result. Both optional so the anchors still render as plain
	// (non-interactive) text if a future caller doesn't wire up previewing.
	selectedGearView?: GearView;
	onSelectGearView?: (view: GearView) => void;
}

const SURVIVABILITY_METRIC_LABELS: Record<SurvivabilityMetric, string> = {
	tmi: "TMI-5",
	dtps: "DTPS",
};

function formatEndpointAnchor(
	endpoint: BalanceEndpoint,
	survivabilityMetric: SurvivabilityMetric,
): string {
	const { tps } = endpoint.simMetrics;
	const survivalValue = absoluteValueForMetric(
		endpoint.simMetrics,
		survivabilityMetric,
	);
	return `${tps.toLocaleString(undefined, { maximumFractionDigits: 0 })} TPS · ${survivalValue.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${SURVIVABILITY_METRIC_LABELS[survivabilityMetric]}`;
}

interface EndpointAnchorProps {
	label: string;
	endpoint: BalanceEndpoint;
	view: Exclude<GearView, "balanced">;
	selected: boolean;
	survivabilityMetric: SurvivabilityMetric;
	// Absent when the caller doesn't wire up previewing - the anchor still shows the real
	// numbers, just as plain (non-interactive, non-clickable) text.
	onSelect?: (view: GearView) => void;
	align?: "left" | "right";
}

// A single "100% Threat"/"100% Survivability" anchor - without a way to see the gear behind
// these numbers they're just floating reference values, so clicking one (when onSelect is wired
// up) previews that endpoint's own exact gear elsewhere in ResultsPanel; clicking the
// already-selected one switches back to the real (balanced) solve result.
function EndpointAnchor({
	label,
	endpoint,
	view,
	selected,
	survivabilityMetric,
	onSelect,
	align = "left",
}: EndpointAnchorProps) {
	const content = (
		<Box sx={{ minWidth: 0, width: "100%", textAlign: align }}>
			<Typography
				variant="overline"
				color={selected ? "secondary.main" : "text.disabled"}
				sx={{
					lineHeight: 1.5,
					whiteSpace: "nowrap",
					display: "block",
					fontWeight: selected ? 700 : 400,
				}}
			>
				{label}
			</Typography>
			<Typography
				variant="caption"
				color="text.secondary"
				sx={{ whiteSpace: "nowrap" }}
			>
				{formatEndpointAnchor(endpoint, survivabilityMetric)}
			</Typography>
		</Box>
	);

	if (!onSelect) return content;

	return (
		<ButtonBase
			onClick={() => onSelect(selected ? "balanced" : view)}
			sx={{
				minWidth: 0,
				display: "block",
				borderRadius: 1,
				px: 0.5,
				py: 0.25,
				textAlign: align,
				bgcolor: selected ? "action.selected" : "transparent",
				"&:hover": { bgcolor: "action.hover" },
			}}
			aria-pressed={selected}
			title={
				selected
					? "Showing this gear - click to go back to the balanced result"
					: `Preview the exact gear behind these numbers`
			}
		>
			{content}
		</ButtonBase>
	);
}

export default function StatsSummary({
	items: rawItems,
	baseConfig,
	solverConfig,
	includeBuffsConsumables,
	simMetrics,
	statWeights,
	statWeightStdevs,
	simBalanceEndpoints,
	selectedGearView,
	onSelectGearView,
}: StatsSummaryProps) {
	if (!rawItems || rawItems.length === 0) {
		return null;
	}
	const baseStats = getBaseStats(baseConfig.raceId, baseConfig.classId);
	const { items, modifierSources } = buildStatInputs(
		rawItems,
		baseConfig,
		solverConfig,
		includeBuffsConsumables,
	);

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

	const showSimMetrics =
		solverConfig.objectiveMode === "simWeighted" && simMetrics != null;
	const simMetricStats = showSimMetrics
		? [
				{ name: "TPS", value: simMetrics.tps },
				{ name: "DTPS", value: simMetrics.dtps },
				{ name: "TMI-5", value: simMetrics.tmi5 },
			]
		: [];
	const stdevByStat = new Map(
		(statWeightStdevs ?? []).map((s) => [s.name, s.value]),
	);
	const statWeightRows = showSimMetrics
		? [...(statWeights ?? [])]
				.sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
				.map((s) => {
					const stdev = stdevByStat.get(s.name);
					return {
						name: STAT_LABELS[s.name],
						value: s.value,
						detail:
							stdev !== undefined
								? `± ${stdev.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
								: undefined,
					};
				})
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

			{showSimMetrics && simBalanceEndpoints && (
				<Box
					sx={{
						display: "grid",
						gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
						gap: 1,
					}}
				>
					<EndpointAnchor
						label="100% Survivability"
						endpoint={simBalanceEndpoints.survival}
						view="survival"
						selected={selectedGearView === "survival"}
						// Persisted solveResults are restored raw with no migration (unlike
						// configs - see routes/index.tsx), so an older saved result's
						// solverConfig can predate this field entirely.
						survivabilityMetric={solverConfig.survivabilityMetric ?? "tmi"}
						onSelect={onSelectGearView}
					/>
					<EndpointAnchor
						label="100% Threat"
						endpoint={simBalanceEndpoints.threat}
						view="threat"
						selected={selectedGearView === "threat"}
						// Persisted solveResults are restored raw with no migration (unlike
						// configs - see routes/index.tsx), so an older saved result's
						// solverConfig can predate this field entirely.
						survivabilityMetric={solverConfig.survivabilityMetric ?? "tmi"}
						onSelect={onSelectGearView}
						align="right"
					/>
				</Box>
			)}

			{statWeightRows.length > 0 && (
				<StatsGroup
					header="Calculated Stat Weights (TPS rel. to Spell Power, DTPS/TMI rel. to Armor, ± 1 stdev)"
					stats={statWeightRows}
					defaultExpanded={false}
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
