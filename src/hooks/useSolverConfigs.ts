import { useCallback, useState } from "react";
import { CONSUMABLES } from "#/data/consumables";
import { loadAppState } from "#/helpers/persistence";
import type { ResistanceFloor, Stat } from "#/solver/types";
import {
	createEmptyConfig,
	type SolverConfiguration,
} from "#/types/SolverConfig";

const ALL_CONSUMABLE_IDS = CONSUMABLES.map((consumable) => consumable.id);

// Migrates configs saved before the three exclusive TPS/DTPS/TMI-5 sim modes were replaced by
// one "Weighted Sim Metrics" mode - first with a {tps, dtps, tmi5} ratio blend, then with a
// single 0 (Survivability) .. 1 (Threat) balance (see SimBalanceSlider.tsx). An old "Minimize
// TMI-5" config becomes balance: 0, with no behavior change; DTPS doesn't have its own axis on
// the new slider (it's largely redundant with TMI-5 for a tank - see docs/plans/sim-backed-
// objectives.md), so an old "Minimize DTPS" config also lands on the Survivability end.
const LEGACY_SIM_MODE_BALANCE: Partial<Record<string, number>> = {
	tps: 1,
	dtps: 0,
	tmi5: 0,
};

// A config saved under the even-older {tps, dtps, tmi5} ratio blend doesn't have a single
// principled conversion to a balance value - those ratios never had a comparable scale to begin
// with (see docs/plans/sim-backed-objectives.md's rejection of that exact mechanism, and this
// session's investigation into why). This recovers the pure-single-metric cases exactly and
// falls back to a neutral midpoint for any genuinely-mixed old ratio.
function legacyRatioToBalance(ratios: {
	tps: number;
	dtps: number;
	tmi5: number;
}): number {
	if (ratios.tps > 0 && ratios.dtps === 0 && ratios.tmi5 === 0) return 1;
	if (ratios.tps === 0 && (ratios.dtps > 0 || ratios.tmi5 > 0)) return 0;
	return 0.5;
}

export function useSolverConfigs() {
	const _saved = loadAppState();

	const [configs, setConfigs] = useState<SolverConfiguration[]>(() =>
		(_saved?.configs ?? [createEmptyConfig("default", "Default Config")]).map(
			(c) => {
				const legacyModeBalance =
					LEGACY_SIM_MODE_BALANCE[c.objectiveMode as string];
				const legacyRatios = (
					c as unknown as {
						simMetricWeights?: { tps: number; dtps: number; tmi5: number };
					}
				).simMetricWeights;
				return {
					...c,
					resistanceFloors: c.resistanceFloors ?? [],
					enabledConsumableIds: c.enabledConsumableIds ?? ALL_CONSUMABLE_IDS,
					objectiveMode:
						legacyModeBalance !== undefined || legacyRatios
							? "simWeighted"
							: (c.objectiveMode ?? "stats"),
					simBalance:
						c.simBalance ??
						(legacyRatios
							? { balance: legacyRatioToBalance(legacyRatios) }
							: { balance: legacyModeBalance ?? 0.5 }),
					// Old saves before this feature existed only ever meant TMI-5 by "Survivability."
					survivabilityMetric: c.survivabilityMetric ?? "tmi",
				};
			},
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
