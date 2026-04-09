import { useState, useCallback } from "react";
import { createEmptyConfig, type SolverConfiguration } from "#/types/SolverConfig";
import type { Stat } from "#/solver/types";

export function useSolverConfigs() {
	const [configs, setConfigs] = useState<SolverConfiguration[]>(() => [
		createEmptyConfig("default", "Default Config"),
	]);
	const [activeConfigId, setActiveConfigId] = useState("default");

	const activeConfig = configs.find((c) => c.id === activeConfigId);

	const addConfig = useCallback(() => {
		const newId = `config_${Date.now()}`;
		const newConfig = createEmptyConfig(newId, `Config ${configs.length + 1}`);
		setConfigs((prev) => [...prev, newConfig]);
		setActiveConfigId(newId);
	}, [configs.length]);

	const deleteConfig = useCallback((id: string) => {
		setConfigs((prev) => prev.filter((c) => c.id !== id));
		if (activeConfigId === id) {
			setActiveConfigId(configs[0]?.id || "");
		}
	}, [activeConfigId, configs]);

	const renameConfig = useCallback((id: string, newName: string) => {
		setConfigs((prev) =>
			prev.map((c) => (c.id === id ? { ...c, name: newName } : c))
		);
	}, []);

	const updateConfig = useCallback(
		(id: string, updates: Partial<SolverConfiguration>) => {
			setConfigs((prev) =>
				prev.map((c) => (c.id === id ? { ...c, ...updates } : c))
			);
		},
		[]
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
		[activeConfig, updateConfig]
	);

	const updateOptimizeStats = useCallback(
		(stats: Stat[]) => {
			if (activeConfig) {
				updateConfig(activeConfig.id, { optimizeStats: stats });
			}
		},
		[activeConfig, updateConfig]
	);

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
