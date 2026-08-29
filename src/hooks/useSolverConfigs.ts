import { useState } from "react";
import { CONSUMABLES } from "#/data/consumables";
import { loadAppState } from "#/helpers/persistence";
import type { ResistanceFloor, Stat } from "#/solver/types";
import {
	createEmptyConfig,
	type SolverConfiguration,
} from "#/types/SolverConfig";

const ALL_CONSUMABLE_IDS = CONSUMABLES.map((consumable) => consumable.id);

export function useSolverConfigs() {
	const _saved = loadAppState();

	const [configs, setConfigs] = useState<SolverConfiguration[]>(() =>
		(_saved?.configs ?? [createEmptyConfig("default", "Default Config")]).map(
			(c) => ({
				...c,
				resistanceFloors: c.resistanceFloors ?? [],
				enabledConsumableIds: c.enabledConsumableIds ?? ALL_CONSUMABLE_IDS,
			}),
		)
	);
	const [activeConfigId, setActiveConfigId] = useState<string>(() =>
		_saved?.activeConfigId ?? "default"
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
			prev.map((c) => (c.id === id ? { ...c, name: newName } : c))
		);
	};

	const reorderConfig = (draggedId: string, targetId: string) => {
		setConfigs((prev) => {
			const fromIndex = prev.findIndex((c) => c.id === draggedId);
			const toIndex = prev.findIndex((c) => c.id === targetId);
			if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return prev;
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

	const updateConfig = (
		id: string,
		updates: Partial<SolverConfiguration>
	) => {
		setConfigs((prev) =>
			prev.map((c) => (c.id === id ? { ...c, ...updates } : c))
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
