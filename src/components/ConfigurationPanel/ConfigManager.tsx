import AddIcon from "@mui/icons-material/Add";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { getBuffs } from "#/data/buffs";
import { CONSUMABLES } from "#/data/consumables";
import type { ResistanceFloor, Stat } from "#/solver/types";
import type { SolverConfiguration } from "#/types/SolverConfig";
import ConfigCard from "./ConfigCard";

const BUFFS = getBuffs();

interface ConfigManagerProps {
	configs: SolverConfiguration[];
	activeConfigId: string;
	onSelectConfig: (id: string) => void;
	onAddConfig: () => void;
	onDeleteConfig: (id: string) => void;
	onRenameConfig: (id: string, name: string) => void;
	onDuplicateConfig: (id: string) => void;
	onReorderConfig: (draggedId: string, targetId: string) => void;
	updateConstraints: (
		uncritabilitySetting: number,
		uncrushabilitySetting: number,
	) => void;
	updateOptimizeStats: (stats: Stat[]) => void;
	updateResistanceFloors: (floors: ResistanceFloor[]) => void;
	updateConfig: (id: string, updates: Partial<SolverConfiguration>) => void;
}

export default function ConfigManager({
	configs,
	activeConfigId,
	onSelectConfig,
	onAddConfig,
	onDeleteConfig,
	onRenameConfig,
	onDuplicateConfig,
	onReorderConfig,
	updateConstraints,
	updateOptimizeStats,
	updateResistanceFloors,
	updateConfig,
}: ConfigManagerProps) {
	const EXCLUSIVE_BUFF_GROUPS = [
		["mark-of-the-wild", "improved-mark-of-the-wild"],
	];

	const handleBuffChange = (config: SolverConfiguration, buffId: string) => {
		const toggledOn = !config.buffs.find((buff) => buff.id === buffId)?.checked;
		const exclusiveGroup = EXCLUSIVE_BUFF_GROUPS.find((group) =>
			group.includes(buffId),
		);

		const newBuffs = config.buffs.map((buff) => {
			if (buff.id === buffId) return { ...buff, checked: toggledOn };
			if (toggledOn && exclusiveGroup?.includes(buff.id))
				return { ...buff, checked: false };
			return buff;
		});
		updateConfig(config.id, { buffs: newBuffs });
	};

	const handleConsumableChange = (
		config: SolverConfiguration,
		consumableId: string,
	) => {
		const isEnabled = config.enabledConsumableIds.includes(consumableId);
		const newEnabledIds = isEnabled
			? config.enabledConsumableIds.filter((id) => id !== consumableId)
			: [...config.enabledConsumableIds, consumableId];
		updateConfig(config.id, { enabledConsumableIds: newEnabledIds });
	};

	return (
		<Box sx={{ display: "flex", flexDirection: "column", gap: 1.25 }}>
			<Stack direction="row" alignItems="center" gap={1.5}>
				<Box sx={{ flex: 1 }}>
					<Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
						Gear sets
					</Typography>
					{configs.length > 1 && (
						<Typography variant="caption" color="text.secondary">
							Solved top down — set 1 picks each item&apos;s enchants and gems,
							lower sets reuse them.
						</Typography>
					)}
				</Box>
				<Button
					startIcon={<AddIcon />}
					onClick={onAddConfig}
					variant="outlined"
					size="small"
				>
					Add set
				</Button>
			</Stack>

			<Stack spacing={1}>
				{configs.map((config, index) => {
					const displayBuffs = BUFFS.map((buff) => ({
						...buff,
						checked: !!config.buffs.find((b) => b.id === buff.id)?.checked,
					}));
					const displayConsumables = CONSUMABLES.map((consumable) => ({
						...consumable,
						checked: config.enabledConsumableIds.includes(consumable.id),
					}));

					return (
						<ConfigCard
							key={config.id}
							config={config}
							index={index}
							isExpanded={config.id === activeConfigId}
							canDelete={configs.length > 1}
							displayBuffs={displayBuffs}
							displayConsumables={displayConsumables}
							onSelect={() => onSelectConfig(config.id)}
							onCollapse={() => onSelectConfig("")}
							onDuplicate={() => onDuplicateConfig(config.id)}
							onDelete={() => onDeleteConfig(config.id)}
							onRename={(name) => onRenameConfig(config.id, name)}
							onUpdateConstraints={updateConstraints}
							onUpdateOptimizeStats={updateOptimizeStats}
							onUpdateObjectiveMode={(mode) =>
								updateConfig(config.id, { objectiveMode: mode })
							}
							onUpdateResistanceFloors={updateResistanceFloors}
							onBuffChange={(buffId) => handleBuffChange(config, buffId)}
							onConsumableChange={(consumableId) =>
								handleConsumableChange(config, consumableId)
							}
							onDropReorder={(draggedId) =>
								onReorderConfig(draggedId, config.id)
							}
						/>
					);
				})}
			</Stack>
		</Box>
	);
}
