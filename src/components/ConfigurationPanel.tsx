import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import BuffsConsumablesSection from "#/components/BuffsConsumablesSection";
import ConfigManager from "#/components/ConfigManager";
import ConstraintsSection from "#/components/ConstraintsSection";
import StatsEntry from "#/components/StatsEntry";
import type { Stat } from "#/solver/types";
import type { SolverConfiguration } from "#/types/SolverConfig";

interface ConfigurationPanelProps {
	configs: SolverConfiguration[];
	activeConfig: SolverConfiguration | undefined;
	activeConfigId: string;
	setActiveConfigId: (id: string) => void;
	addConfig: () => void;
	deleteConfig: (id: string) => void;
	renameConfig: (id: string, name: string) => void;
	updateConstraints: (
		uncritabilitySetting: number,
		uncrushabilitySetting: number
	) => void;
	updateOptimizeStats: (stats: Stat[]) => void;
}

export default function ConfigurationPanel({
	configs,
	activeConfig,
	activeConfigId,
	setActiveConfigId,
	addConfig,
	deleteConfig,
	renameConfig,
	updateConstraints,
	updateOptimizeStats,
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
			/>

			{activeConfig && (
				<Stack spacing={2} sx={{ mt: 2 }}>
					{/* Constraints */}
					<ConstraintsSection
						uncritabilitySetting={activeConfig.uncritabilitySetting}
						uncrushabilitySetting={activeConfig.uncrushabilitySetting}
						onUpdateConstraints={updateConstraints}
					/>

					{/* Stats to Optimize */}
					<Box>
						<StatsEntry
							stats={activeConfig.optimizeStats}
							onChange={updateOptimizeStats}
						/>
					</Box>

					{/* Buffs & Consumables */}
					<BuffsConsumablesSection
						buffs={activeConfig.buffs}
						consumables={activeConfig.consumables}
					/>
				</Stack>
			)}
		</Paper>
	);
}
