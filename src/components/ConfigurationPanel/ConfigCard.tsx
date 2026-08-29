import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DeleteIcon from "@mui/icons-material/Delete";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import type { DragEvent } from "react";
import { useState } from "react";
import { STAT_LABELS, type Buff, type ConsumableItem, type ResistanceFloor, type Stat } from "#/solver/types";
import { monoFontFamily } from "#/theme";
import type { SolverConfiguration } from "#/types/SolverConfig";
import BuffSection from "./BuffSection";
import ConstraintsSection from "./ConstraintsSection";
import ConsumablesSection from "./ConsumablesSection";
import StatsEntry from "./StatsEntry";

const CRIT_TAGS: Record<number, string> = {
	1: "Lvl 72 crit cap",
	2: "Lvl 73 crit cap",
};

const UNCRUSHABLE_TAGS: Record<number, string> = {
	1: "Uncrushable",
	2: "Illidan Shear",
};

interface ConfigCardProps {
	config: SolverConfiguration;
	index: number;
	isExpanded: boolean;
	canDelete: boolean;
	displayBuffs: Buff[];
	displayConsumables: (ConsumableItem & { checked: boolean })[];
	onSelect: () => void;
	onCollapse: () => void;
	onDuplicate: () => void;
	onDelete: () => void;
	onRename: (name: string) => void;
	onUpdateConstraints: (uncritability: number, uncrushability: number) => void;
	onUpdateOptimizeStats: (stats: Stat[]) => void;
	onUpdateResistanceFloors: (floors: ResistanceFloor[]) => void;
	onBuffChange: (buffId: string) => void;
	onConsumableChange: (consumableId: string) => void;
	onDropReorder: (draggedId: string) => void;
}

function statsSummary(stats: Stat[]): string {
	if (stats.length === 0) return "no stats weighted";
	const sorted = [...stats].sort((a, b) => b.value - a.value);
	const shown = sorted.slice(0, 3).map((s) => `${s.name} ${s.value.toFixed(2)}`);
	const remaining = sorted.length - shown.length;
	return shown.join(" · ") + (remaining > 0 ? ` +${remaining}` : "");
}

export default function ConfigCard({
	config,
	index,
	isExpanded,
	canDelete,
	displayBuffs,
	displayConsumables,
	onSelect,
	onCollapse,
	onDuplicate,
	onDelete,
	onRename,
	onUpdateConstraints,
	onUpdateOptimizeStats,
	onUpdateResistanceFloors,
	onBuffChange,
	onConsumableChange,
	onDropReorder,
}: ConfigCardProps) {
	const [renaming, setRenaming] = useState(false);
	const [draftName, setDraftName] = useState(config.name);

	const handleDragStart = (e: DragEvent<HTMLDivElement>) => {
		e.dataTransfer.setData("text/plain", config.id);
		e.dataTransfer.effectAllowed = "move";
	};

	const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
		e.preventDefault();
	};

	const handleDrop = (e: DragEvent<HTMLDivElement>) => {
		e.preventDefault();
		const draggedId = e.dataTransfer.getData("text/plain");
		if (draggedId && draggedId !== config.id) onDropReorder(draggedId);
	};

	const saveRename = () => {
		if (draftName.trim()) onRename(draftName.trim());
		else setDraftName(config.name);
		setRenaming(false);
	};

	const indexBadge = (
		<Box
			sx={{
				flexShrink: 0,
				width: 22,
				height: 22,
				borderRadius: "50%",
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				fontFamily: monoFontFamily,
				fontSize: 12,
				fontWeight: 700,
				bgcolor: isExpanded ? "primary.main" : "action.selected",
				color: isExpanded ? "primary.contrastText" : "text.secondary",
			}}
		>
			{index + 1}
		</Box>
	);

	const dragHandle = (
		<Box
			draggable
			onDragStart={handleDragStart}
			sx={{ display: "flex", cursor: "grab", flexShrink: 0 }}
		>
			<DragIndicatorIcon fontSize="small" sx={{ color: "text.disabled" }} />
		</Box>
	);

	if (!isExpanded) {
		return (
			<Box
				onClick={onSelect}
				onDragOver={handleDragOver}
				onDrop={handleDrop}
				sx={{
					display: "flex",
					alignItems: "center",
					gap: 1.25,
					px: 1.75,
					py: 1.25,
					border: 1,
					borderColor: "divider",
					borderRadius: 1,
					bgcolor: "background.paper",
					cursor: "pointer",
					"&:hover": { borderColor: "primary.light" },
				}}
			>
				{dragHandle}
				{indexBadge}
				<Typography sx={{ fontWeight: 500, width: 130, flexShrink: 0 }}>
					{config.name}
				</Typography>
				<Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" sx={{ flex: 1, minWidth: 0 }}>
					{config.uncritabilitySetting > 0 && (
						<Box
							sx={{
								fontSize: 12,
								px: 1,
								py: 0.25,
								borderRadius: 0.5,
								bgcolor: "rgba(126,163,189,0.18)",
								color: "#cfe0ea",
							}}
						>
							{CRIT_TAGS[config.uncritabilitySetting]}
						</Box>
					)}
					{config.uncrushabilitySetting > 0 && (
						<Box
							sx={{
								fontSize: 12,
								px: 1,
								py: 0.25,
								borderRadius: 0.5,
								bgcolor: "rgba(126,163,189,0.18)",
								color: "#cfe0ea",
							}}
						>
							{UNCRUSHABLE_TAGS[config.uncrushabilitySetting]}
						</Box>
					)}
					{config.resistanceFloors.map((floor) => (
						<Box
							key={floor.stat}
							sx={{
								fontSize: 12,
								px: 1,
								py: 0.25,
								borderRadius: 0.5,
								bgcolor: "rgba(126,163,189,0.18)",
								color: "#cfe0ea",
							}}
						>
							{STAT_LABELS[floor.stat]} ≥ {floor.value}
						</Box>
					))}
					<Typography
						variant="caption"
						color="text.secondary"
						sx={{ fontFamily: monoFontFamily, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
					>
						{statsSummary(config.optimizeStats)}
					</Typography>
				</Stack>
				<ExpandMoreIcon fontSize="small" sx={{ color: "text.secondary", flexShrink: 0 }} />
			</Box>
		);
	}

	return (
		<Box
			onDragOver={handleDragOver}
			onDrop={handleDrop}
			sx={{
				border: 1,
				borderColor: "primary.main",
				borderRadius: 1,
				bgcolor: "background.paper",
				overflow: "hidden",
			}}
		>
			<Box
				sx={{
					display: "flex",
					alignItems: "center",
					gap: 1.25,
					px: 1.75,
					py: 1.25,
					bgcolor: "rgba(126,163,189,0.10)",
				}}
			>
				{dragHandle}
				{indexBadge}
				{renaming ? (
					<TextField
						autoFocus
						size="small"
						value={draftName}
						onChange={(e) => setDraftName(e.target.value)}
						onBlur={saveRename}
						onKeyDown={(e) => {
							if (e.key === "Enter") saveRename();
							if (e.key === "Escape") {
								setDraftName(config.name);
								setRenaming(false);
							}
						}}
						sx={{ maxWidth: 220 }}
					/>
				) : (
					<Typography
						sx={{ fontWeight: 700, cursor: "text" }}
						onClick={() => {
							setDraftName(config.name);
							setRenaming(true);
						}}
					>
						{config.name}
					</Typography>
				)}
				<Typography variant="caption" color="text.secondary">
					{config.optimizeStats.length} stats weighted
					{config.resistanceFloors.length > 0
						? ` · ${config.resistanceFloors.length} resistance floor${config.resistanceFloors.length > 1 ? "s" : ""}`
						: ""}
					{config.uncritabilitySetting === 0 &&
					config.uncrushabilitySetting === 0 &&
					config.resistanceFloors.length === 0
						? " · no constraints"
						: ""}
				</Typography>
				<Stack direction="row" spacing={1.5} alignItems="center" sx={{ ml: "auto" }}>
					<Tooltip title="Duplicate set">
						<IconButton size="small" onClick={onDuplicate}>
							<ContentCopyIcon fontSize="small" />
						</IconButton>
					</Tooltip>
					{canDelete && (
						<Tooltip title="Delete set">
							<IconButton size="small" color="error" onClick={onDelete}>
								<DeleteIcon fontSize="small" />
							</IconButton>
						</Tooltip>
					)}
					<IconButton size="small" onClick={onCollapse}>
						<ExpandLessIcon fontSize="small" />
					</IconButton>
				</Stack>
			</Box>

			<Stack spacing={2} sx={{ p: 2 }}>
				<ConstraintsSection
					uncritabilitySetting={config.uncritabilitySetting}
					uncrushabilitySetting={config.uncrushabilitySetting}
					resistanceFloors={config.resistanceFloors}
					onUpdateConstraints={onUpdateConstraints}
					onUpdateResistanceFloors={onUpdateResistanceFloors}
				/>
				<StatsEntry stats={config.optimizeStats} onChange={onUpdateOptimizeStats} />
				<BuffSection buffs={displayBuffs} onBuffChange={onBuffChange} />
				<ConsumablesSection
					consumables={displayConsumables}
					onConsumableChange={onConsumableChange}
				/>
			</Stack>
		</Box>
	);
}
