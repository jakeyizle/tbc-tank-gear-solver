import { useCallback, useState } from "react";
import { CONSUMABLES } from "#/data/consumables";
import { loadAppState } from "#/helpers/persistence";
import { SIM_CALIBRATION_STAT_NAMES } from "#/sim/statTranslation";
import type { ResistanceFloor, Stat } from "#/solver/types";
import {
	createEmptyConfig,
	type SolverConfiguration,
} from "#/types/SolverConfig";

const ALL_CONSUMABLE_IDS = CONSUMABLES.map((consumable) => consumable.id);

// Migrates configs saved under an earlier multi-metric sim objective mechanism - three exclusive
// TPS/DTPS/TMI-5 modes, then a {tps, dtps, tmi5} ratio blend, then a single Threat<->
// Survivability balance slider (see docs/plans/sim-backed-objectives.md) - onto today's modes,
// which include a real "balanced" mode again (a plain weighted blend - see
// calibrateWeights.ts's metricRatiosForBalance). A config already saved under the old balance
// slider (`mode === "simWeighted"`) maps directly onto "balanced", carrying its `balance`/
// `survivabilityMetric` across unchanged, since that's the most recently-real feature being
// migrated. The older `{tps,dtps,tmi5}` ratio-blend format predates even the balance slider and
// falls back to picking whichever single metric it weighted most heavily - not worth mapping
// onto "balanced" precisely for a format this obsolete.
function legacyConfigPatch(
	c: SolverConfiguration & {
		simMetricWeights?: { tps: number; dtps: number; tmi5: number };
		simBalance?: { balance: number };
		survivabilityMetric?: "tmi" | "dtps";
	},
): Partial<SolverConfiguration> {
	const mode = c.objectiveMode as string | undefined;
	if (
		mode === "tps" ||
		mode === "dtps" ||
		mode === "tmi" ||
		mode === "balanced" ||
		mode === "ehp" ||
		mode === "stats"
	) {
		return { objectiveMode: mode };
	}
	if (mode === "tmi5") return { objectiveMode: "tmi" };
	if (c.simMetricWeights) {
		const { tps, dtps, tmi5 } = c.simMetricWeights;
		if (tps >= dtps && tps >= tmi5) return { objectiveMode: "tps" };
		return { objectiveMode: dtps >= tmi5 ? "dtps" : "tmi" };
	}
	if (mode === "simWeighted" && c.simBalance) {
		return {
			objectiveMode: "balanced",
			balance: c.simBalance.balance,
			survivabilityMetric: c.survivabilityMetric === "dtps" ? "dtps" : "tmi",
		};
	}
	return { objectiveMode: "stats" };
}

export function useSolverConfigs() {
	const _saved = loadAppState();

	const [configs, setConfigs] = useState<SolverConfiguration[]>(() =>
		(_saved?.configs ?? [createEmptyConfig("default", "Default Config")]).map(
			(c) => ({
				...c,
				resistanceFloors: c.resistanceFloors ?? [],
				enabledConsumableIds: c.enabledConsumableIds ?? ALL_CONSUMABLE_IDS,
				balance: c.balance ?? 0.5,
				survivabilityMetric: c.survivabilityMetric ?? "tmi",
				enabledCalibrationStats:
					c.enabledCalibrationStats ?? SIM_CALIBRATION_STAT_NAMES,
				...legacyConfigPatch(c),
			}),
		),
	);
	const [activeConfigId, setActiveConfigId] = useState<string>(
		() => _saved?.activeConfigId ?? "default",
	);

	const activeConfig = configs.find((c) => c.id === activeConfigId);

	// Every handler below is wrapped in useCallback so its identity stays stable across renders
	// that don't actually change configs/activeConfigId - e.g. a "Weighted Sim Metrics" solve's
	// progress ticks, which re-render the whole App tree (see routes/index.tsx's solveProgress
	// state) but don't touch configs at all. Without this, ConfigurationPanel (and its MUI-heavy
	// ConfigCard children) would reconcile on every throttled progress tick even if wrapped in
	// React.memo, since a fresh function reference on every prop defeats memo's shallow compare -
	// one of the causes behind the "hiccup while sims are being solved" report.
	const addConfig = useCallback(() => {
		const newId = `config_${Date.now()}`;
		setConfigs((prev) => [
			...prev,
			createEmptyConfig(newId, `Config ${prev.length + 1}`),
		]);
		setActiveConfigId(newId);
	}, []);

	const deleteConfig = useCallback(
		(id: string) => {
			const newConfigs = configs.filter((c) => c.id !== id);
			setConfigs(newConfigs);
			if (activeConfigId === id) {
				setActiveConfigId(newConfigs[0]?.id || "");
			}
		},
		[configs, activeConfigId],
	);

	const renameConfig = useCallback((id: string, newName: string) => {
		setConfigs((prev) =>
			prev.map((c) => (c.id === id ? { ...c, name: newName } : c)),
		);
	}, []);

	const reorderConfig = useCallback((draggedId: string, targetId: string) => {
		setConfigs((prev) => {
			const fromIndex = prev.findIndex((c) => c.id === draggedId);
			const toIndex = prev.findIndex((c) => c.id === targetId);
			if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex)
				return prev;
			const next = [...prev];
			const [moved] = next.splice(fromIndex, 1);
			next.splice(toIndex, 0, moved);
			return next;
		});
	}, []);

	const duplicateConfig = useCallback((id: string) => {
		const newId = `config_${Date.now()}`;
		setConfigs((prev) => {
			const index = prev.findIndex((c) => c.id === id);
			if (index === -1) return prev;
			const copy: SolverConfiguration = {
				...prev[index],
				id: newId,
				name: `${prev[index].name} copy`,
			};
			const next = [...prev];
			next.splice(index + 1, 0, copy);
			return next;
		});
		setActiveConfigId(newId);
	}, []);

	const updateConfig = useCallback(
		(id: string, updates: Partial<SolverConfiguration>) => {
			setConfigs((prev) =>
				prev.map((c) => (c.id === id ? { ...c, ...updates } : c)),
			);
		},
		[],
	);

	const updateConstraints = useCallback(
		(uncritability: number, uncrushability: number) => {
			if (activeConfig) {
				updateConfig(activeConfig.id, {
					uncritabilitySetting: uncritability,
					uncrushabilitySetting: uncrushability,
				});
			}
		},
		[activeConfig, updateConfig],
	);

	const updateOptimizeStats = useCallback(
		(stats: Stat[]) => {
			if (activeConfig) {
				updateConfig(activeConfig.id, { optimizeStats: stats });
			}
		},
		[activeConfig, updateConfig],
	);

	const updateResistanceFloors = useCallback(
		(resistanceFloors: ResistanceFloor[]) => {
			if (activeConfig) {
				updateConfig(activeConfig.id, { resistanceFloors });
			}
		},
		[activeConfig, updateConfig],
	);

	return {
		configs,
		activeConfig,
		activeConfigId,
		setActiveConfigId,
		addConfig,
		deleteConfig,
		renameConfig,
		reorderConfig,
		duplicateConfig,
		updateConfig,
		updateConstraints,
		updateOptimizeStats,
		updateResistanceFloors,
	};
}
