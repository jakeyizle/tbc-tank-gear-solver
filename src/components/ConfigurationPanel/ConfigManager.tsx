import AddIcon from "@mui/icons-material/Add";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { getBuffs } from "#/data/buffs";
import { CONSUMABLES } from "#/data/consumables";
import {
	ALWAYS_INCLUDED_CALIBRATION_STATS,
	SIM_CALIBRATION_STAT_NAMES,
} from "#/sim/statTranslation";
import {
	type ResistanceFloor,
	STAT_LABELS,
	type Stat,
	type StatName,
} from "#/solver/types";
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
	independentConfigs: boolean;
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
	independentConfigs,
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

	const handleCalibrationStatChange = (
		config: SolverConfiguration,
		statName: StatName,
	) => {
		// Spell Power and Armor are always calibrated regardless of this setting - see
		// ALWAYS_INCLUDED_CALIBRATION_STATS's own comment - so toggling them is a no-op rather
		// than a real exclusion the UI shouldn't pretend is possible.
		if (ALWAYS_INCLUDED_CALIBRATION_STATS.has(statName)) return;
		const isEnabled = config.enabledCalibrationStats.includes(statName);
		// Unlike consumables, an empty calibration-stat list isn't a meaningful state (the sim
		// would have nothing to calibrate a weight vector from) - refuse to uncheck the last
		// remaining enabled stat rather than letting the user reach it.
		if (isEnabled && config.enabledCalibrationStats.length <= 1) return;
		const newEnabledStats = isEnabled
			? config.enabledCalibrationStats.filter((s) => s !== statName)
			: [...config.enabledCalibrationStats, statName];
		updateConfig(config.id, { enabledCalibrationStats: newEnabledStats });
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
							{independentConfigs
								? "Solved independently — each set picks its own enchants and gems."
								: "Solved top down — set 1 picks each item's enchants and gems, lower sets reuse them."}
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
					const displayCalibrationStats = SIM_CALIBRATION_STAT_NAMES.map(
						(name) => {
							const alwaysIncluded =
								ALWAYS_INCLUDED_CALIBRATION_STATS.has(name);
							return {
								name,
								label: STAT_LABELS[name],
								checked:
									alwaysIncluded ||
									config.enabledCalibrationStats.includes(name),
								alwaysIncluded,
							};
						},
					);

					return (
						<ConfigCard
							key={config.id}
							config={config}
							index={index}
							isExpanded={config.id === activeConfigId}
							canDelete={configs.length > 1}
							displayBuffs={displayBuffs}
							displayConsumables={displayConsumables}
							displayCalibrationStats={displayCalibrationStats}
							onSelect={() => onSelectConfig(config.id)}
							onCollapse={() => onSelectConfig("")}
							onDuplicate={() => onDuplicateConfig(config.id)}
							onDelete={() => onDeleteConfig(config.id)}
							onRename={(name) => onRenameConfig(config.id, name)}
							onUpdateConstraints={updateConstraints}
							onUpdateOptimizeStats={updateOptimizeStats}
							onUpdateObjectiveMode={(mode) =>
								updateConfig(config.id, {
									objectiveMode: mode,
									// Solving for hard avoidance while also holding it to the
									// (Block-inclusive) Avoidance floor is redundant and the
									// solver ignores that floor in this mode - see
									// solveConfigForHardAvoidance - so reset it here too, to
									// avoid a stale setting the UI shows as active but that no
									// longer does anything.
									...(mode === "hardAvoidance"
										? { uncrushabilitySetting: 0 }
										: {}),
								})
							}
							onUpdateBalance={(balance) =>
								updateConfig(config.id, { balance })
							}
							onUpdateSurvivabilityMetric={(survivabilityMetric) =>
								updateConfig(config.id, { survivabilityMetric })
							}
							onUpdateResistanceFloors={updateResistanceFloors}
							onBuffChange={(buffId) => handleBuffChange(config, buffId)}
							onConsumableChange={(consumableId) =>
								handleConsumableChange(config, consumableId)
							}
							onCalibrationStatChange={(statName) =>
								handleCalibrationStatChange(config, statName)
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
