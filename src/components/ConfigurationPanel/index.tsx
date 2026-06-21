import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import { getBuffs } from "#/data/buffs";
import type { Stat } from "#/solver/types";
import type { SolverConfiguration } from "#/types/SolverConfig";
import BuffSection from "./BuffSection";
import ConfigManager from "./ConfigManager";
import ConstraintsSection from "./ConstraintsSection";
import StatsEntry from "./StatsEntry";

const BUFFS = getBuffs();

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
		uncrushabilitySetting: number,
	) => void;
	updateOptimizeStats: (stats: Stat[]) => void;
	updateConfig: (id: string, updates: Partial<SolverConfiguration>) => void;
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
	updateConfig,
}: ConfigurationPanelProps) {
	const handleBuffChange = (buffId: string) => {
		if (!activeConfig) return;
		const newBuffs = activeConfig.buffs.map((buff) => ({
			...buff,
			checked: buff.id === buffId ? !buff.checked : buff.checked,
		}));

		updateConfig(activeConfig.id, { buffs: newBuffs });
	};

	const displayBuffs = BUFFS.map((buff) => ({
		...buff,
		checked: !!activeConfig?.buffs.find((b) => b.id === buff.id)?.checked,
	}));

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

					{/* Buffs*/}
					<BuffSection
						buffs={displayBuffs}
						consumables={activeConfig.consumables}
						onBuffChange={handleBuffChange}
					/>
				</Stack>
			)}
		</Paper>
	);
}
