import { useState } from "react";
import type { Stat } from "#/solver/types";
import {
	createEmptyConfig,
	type SolverConfiguration,
} from "#/types/SolverConfig";

export function useSolverConfigs() {
	const [configs, setConfigs] = useState<SolverConfiguration[]>(() => [
		createEmptyConfig("default", "Default Config"),
	]);
	const [activeConfigId, setActiveConfigId] = useState("default");

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

	return {
		configs,
		activeConfig,
		activeConfigId,
		setActiveConfigId,
		addConfig,
		deleteConfig,
		renameConfig,
		updateConfig,
		updateConstraints,
		updateOptimizeStats,
	};
}
