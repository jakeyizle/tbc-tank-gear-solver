import { useState } from "react";
import { CONSUMABLES } from "#/data/consumables";
import { loadAppState } from "#/helpers/persistence";
import type { ResistanceFloor, Stat } from "#/solver/types";
import {
	createEmptyConfig,
	type SolverConfiguration,
} from "#/types/SolverConfig";

const ALL_CONSUMABLE_IDS = CONSUMABLES.map((consumable) => consumable.id);

// Migrates configs saved before the three exclusive TPS/DTPS/TMI-5 sim modes were replaced by
// one "Weighted Sim Metrics" mode with per-metric ratios - e.g. an old "Minimize TMI-5" config
// becomes the equivalent {tps: 0, dtps: 0, tmi5: 1} blend, with no behavior change.
const LEGACY_SIM_MODE_RATIOS: Partial<
	Record<string, { tps: number; dtps: number; tmi5: number }>
> = {
	tps: { tps: 1, dtps: 0, tmi5: 0 },
	dtps: { tps: 0, dtps: 1, tmi5: 0 },
	tmi5: { tps: 0, dtps: 0, tmi5: 1 },
};

export function useSolverConfigs() {
	const _saved = loadAppState();

	const [configs, setConfigs] = useState<SolverConfiguration[]>(() =>
		(_saved?.configs ?? [createEmptyConfig("default", "Default Config")]).map(
			(c) => {
				const legacyRatios = LEGACY_SIM_MODE_RATIOS[c.objectiveMode as string];
				return {
					...c,
					resistanceFloors: c.resistanceFloors ?? [],
					enabledConsumableIds: c.enabledConsumableIds ?? ALL_CONSUMABLE_IDS,
					objectiveMode: legacyRatios
						? "simWeighted"
						: (c.objectiveMode ?? "stats"),
					simMetricWeights: c.simMetricWeights ??
						legacyRatios ?? { tps: 0, dtps: 0, tmi5: 1 },
				};
			},
		),
	);
	const [activeConfigId, setActiveConfigId] = useState<string>(
		() => _saved?.activeConfigId ?? "default",
	);

	const activeConfig = configs.find((c) => c.id === activeConfigId);

	const addConfig = () => {
		const newId = `config_${Date.now()}`;
		const newConfig = createEmptyConfig(newId, `Config ${configs.length + 1}`);
		setConfigs((prev) => [...prev, newConfig]);
		setActiveConfigId(newId);
	};

	const deleteConfig = (id: string) => {
		const newConfigs = configs.filter((c) => c.id !== id);
		setConfigs(newConfigs);
		if (activeConfigId === id) {
			setActiveConfigId(newConfigs[0]?.id || "");
		}
	};

	const renameConfig = (id: string, newName: string) => {
		setConfigs((prev) =>
			prev.map((c) => (c.id === id ? { ...c, name: newName } : c)),
		);
	};

	const reorderConfig = (draggedId: string, targetId: string) => {
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
	};

	const duplicateConfig = (id: string) => {
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
	};

	const updateConfig = (id: string, updates: Partial<SolverConfiguration>) => {
		setConfigs((prev) =>
			prev.map((c) => (c.id === id ? { ...c, ...updates } : c)),
		);
	};

	const updateConstraints = (uncritability: number, uncrushability: number) => {
		if (activeConfig) {
			updateConfig(activeConfig.id, {
				uncritabilitySetting: uncritability,
				uncrushabilitySetting: uncrushability,
			});
		}
	};

	const updateOptimizeStats = (stats: Stat[]) => {
		if (activeConfig) {
			updateConfig(activeConfig.id, { optimizeStats: stats });
		}
	};

	const updateResistanceFloors = (resistanceFloors: ResistanceFloor[]) => {
		if (activeConfig) {
			updateConfig(activeConfig.id, { resistanceFloors });
		}
	};

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
