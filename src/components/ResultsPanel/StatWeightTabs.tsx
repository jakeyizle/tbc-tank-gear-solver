import Box from "@mui/material/Box";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import { useState } from "react";
import { SIM_METRIC_REFERENCE_STAT } from "#/sim/statTranslation";
import { STAT_LABELS, type Stat } from "#/solver/types";
import StatsGroup from "./StatsGroup";

type SimMetricKey = "tps" | "dtps" | "tmi";

const METRIC_LABELS: Record<SimMetricKey, string> = {
	tps: "TPS",
	dtps: "DTPS",
	tmi: "TMI-5",
};

interface StatWeightTabsProps {
	perMetricStatWeights: Record<SimMetricKey, Stat[]>;
	perMetricStatWeightStdevs: Record<SimMetricKey, Stat[]>;
}

// Every sim-backed solve's final calibration round already computes TPS/DTPS/TMI-5 weight
// vectors together, regardless of which one (or blend) actually drove the objective - see
// calibrateWeights.ts's computePerMetricStatWeights. One tab per metric, so a user can compare
// all three from a single solve without re-running anything by switching tabs.
export default function StatWeightTabs({
	perMetricStatWeights,
	perMetricStatWeightStdevs,
}: StatWeightTabsProps) {
	const [activeMetric, setActiveMetric] = useState<SimMetricKey>("tps");

	const weights = perMetricStatWeights[activeMetric] ?? [];
	const stdevs = perMetricStatWeightStdevs[activeMetric] ?? [];
	const stdevByStat = new Map(stdevs.map((s) => [s.name, s.value]));
	const rows = [...weights]
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
				// stdevs are now a standard error of the mean (see calibrateWeights.ts's
				// blendMetricEpValueStdevs), so |value| < stdev means we can't confidently rule
				// out zero/negative at ~1 SE - flag it rather than implying equal confidence
				// with a stat whose weight comfortably clears its own noise.
				dimmed: stdev !== undefined && Math.abs(s.value) < stdev,
			};
		});

	const anchorLabel = STAT_LABELS[SIM_METRIC_REFERENCE_STAT[activeMetric]];

	return (
		<Box>
			<Tabs
				value={activeMetric}
				onChange={(_, value: SimMetricKey) => setActiveMetric(value)}
				sx={{
					minHeight: 28,
					mb: 0.75,
					"& .MuiTab-root": {
						minHeight: 28,
						minWidth: 0,
						px: 1.25,
						py: 0,
						fontSize: 12,
						textTransform: "none",
					},
				}}
			>
				{(Object.keys(METRIC_LABELS) as SimMetricKey[]).map((metric) => (
					<Tab key={metric} value={metric} label={METRIC_LABELS[metric]} />
				))}
			</Tabs>
			<StatsGroup
				header={`Calculated Stat Weights, relative to ${anchorLabel}`}
				stats={rows}
				defaultExpanded={false}
			/>
		</Box>
	);
}
