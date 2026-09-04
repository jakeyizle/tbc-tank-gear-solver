import Paper from "@mui/material/Paper";
import { memo } from "react";
import type { ResistanceFloor, Stat } from "#/solver/types";
import type { SolverConfiguration } from "#/types/SolverConfig";
import ConfigManager from "./ConfigManager";

interface ConfigurationPanelProps {
	configs: SolverConfiguration[];
	activeConfigId: string;
	setActiveConfigId: (id: string) => void;
	addConfig: () => void;
	deleteConfig: (id: string) => void;
	renameConfig: (id: string, name: string) => void;
	duplicateConfig: (id: string) => void;
	reorderConfig: (draggedId: string, targetId: string) => void;
	updateConstraints: (
		uncritabilitySetting: number,
		uncrushabilitySetting: number,
	) => void;
	updateOptimizeStats: (stats: Stat[]) => void;
	updateResistanceFloors: (floors: ResistanceFloor[]) => void;
	updateConfig: (id: string, updates: Partial<SolverConfiguration>) => void;
}

// Memoized so a parent re-render that doesn't change these props (e.g. routes/index.tsx's
// solveProgress ticks during a solve) skips reconciling the whole ConfigManager/ConfigCard tree -
// see useSolverConfigs.ts's note on why fresh handler identities would otherwise defeat this.
function ConfigurationPanel({
	configs,
	activeConfigId,
	setActiveConfigId,
	addConfig,
	deleteConfig,
	renameConfig,
	duplicateConfig,
	reorderConfig,
	updateConstraints,
	updateOptimizeStats,
	updateResistanceFloors,
	updateConfig,
}: ConfigurationPanelProps) {
	return (
		<Paper elevation={1} sx={{ p: 2 }}>
			<ConfigManager
				configs={configs}
				activeConfigId={activeConfigId}
				onSelectConfig={setActiveConfigId}
				onAddConfig={addConfig}
				onDeleteConfig={deleteConfig}
				onRenameConfig={renameConfig}
				onDuplicateConfig={duplicateConfig}
				onReorderConfig={reorderConfig}
				updateConstraints={updateConstraints}
				updateOptimizeStats={updateOptimizeStats}
				updateResistanceFloors={updateResistanceFloors}
				updateConfig={updateConfig}
			/>
		</Paper>
	);
}

export default memo(ConfigurationPanel);
