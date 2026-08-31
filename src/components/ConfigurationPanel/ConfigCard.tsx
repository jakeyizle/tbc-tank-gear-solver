import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DeleteIcon from "@mui/icons-material/Delete";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import type { DragEvent, ReactNode } from "react";
import { useState } from "react";
import {
	type Buff,
	type ConsumableItem,
	type ResistanceFloor,
	STAT_LABELS,
	type Stat,
} from "#/solver/types";
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
	onUpdateObjectiveMode: (mode: "stats" | "ehp") => void;
	onUpdateResistanceFloors: (floors: ResistanceFloor[]) => void;
	onBuffChange: (buffId: string) => void;
	onConsumableChange: (consumableId: string) => void;
	onDropReorder: (draggedId: string) => void;
}

interface ConfigBandProps {
	accent: string;
	titleColor?: string;
	tint: string;
	title: string;
	description: string;
	children: ReactNode;
}

function ConfigBand({
	accent,
	titleColor,
	tint,
	title,
	description,
	children,
}: ConfigBandProps) {
	return (
		<Box sx={{ display: "flex", borderTop: 1, borderColor: "divider" }}>
			<Box sx={{ width: 3, flexShrink: 0, bgcolor: accent }} />
			<Box
				sx={{
					flex: 1,
					display: "flex",
					flexDirection: "column",
					gap: 1.5,
					p: 2,
					bgcolor: tint,
				}}
			>
				<Box
					sx={{
						display: "flex",
						alignItems: "baseline",
						gap: 1.25,
						flexWrap: "wrap",
					}}
				>
					<Typography
						sx={{ fontSize: 14, fontWeight: 700, color: titleColor ?? accent }}
					>
						{title}
					</Typography>
					<Typography variant="caption" color="text.secondary">
						{description}
					</Typography>
				</Box>
				{children}
			</Box>
		</Box>
	);
}

function statsSummary(config: SolverConfiguration): string {
	if (config.objectiveMode === "ehp") return "Maximize Effective HP";
	const stats = config.optimizeStats;
	if (stats.length === 0) return "no stats weighted";
	const sorted = [...stats].sort((a, b) => b.value - a.value);
	const shown = sorted
		.slice(0, 3)
		.map((s) => `${s.name} ${s.value.toFixed(2)}`);
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
	onUpdateObjectiveMode,
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
				<Stack
					direction="row"
					spacing={0.75}
					alignItems="center"
					flexWrap="wrap"
					sx={{ flex: 1, minWidth: 0 }}
				>
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
						sx={{
							fontFamily: monoFontFamily,
							overflow: "hidden",
							textOverflow: "ellipsis",
							whiteSpace: "nowrap",
						}}
					>
						{statsSummary(config)}
					</Typography>
				</Stack>
				<ExpandMoreIcon
					fontSize="small"
					sx={{ color: "text.secondary", flexShrink: 0 }}
				/>
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
					{config.objectiveMode === "ehp"
						? "Maximize Effective HP"
						: `${config.optimizeStats.length} stats weighted`}
					{config.resistanceFloors.length > 0
						? ` · ${config.resistanceFloors.length} resistance floor${config.resistanceFloors.length > 1 ? "s" : ""}`
						: ""}
					{config.uncritabilitySetting === 0 &&
					config.uncrushabilitySetting === 0 &&
					config.resistanceFloors.length === 0
						? " · no constraints"
						: ""}
				</Typography>
				<Stack
					direction="row"
					spacing={1.5}
					alignItems="center"
					sx={{ ml: "auto" }}
				>
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

			<Box display="flex" flexDirection="column">
				<ConfigBand
					accent="#7ea3bd"
					tint="rgba(126,163,189,0.06)"
					title="Optimizations"
					description="solver will optimize for these stats and select consumables"
				>
					<ToggleButtonGroup
						size="small"
						exclusive
						value={config.objectiveMode}
						onChange={(_, mode) => mode && onUpdateObjectiveMode(mode)}
						sx={{ alignSelf: "flex-start" }}
					>
						<ToggleButton
							value="stats"
							sx={{ px: 1.5, py: 0.375, fontSize: 12 }}
						>
							Stat weights
						</ToggleButton>
						<ToggleButton value="ehp" sx={{ px: 1.5, py: 0.375, fontSize: 12 }}>
							Maximize Effective HP
						</ToggleButton>
					</ToggleButtonGroup>
					{config.objectiveMode === "ehp" ? (
						<Typography
							variant="body2"
							color="text.secondary"
							fontStyle="italic"
						>
							Solver maximizes armor-mitigated Effective HP directly. Stat
							weights below are unused in this mode but kept in case you switch
							back.
						</Typography>
					) : (
						<StatsEntry
							stats={config.optimizeStats}
							onChange={onUpdateOptimizeStats}
						/>
					)}
					<ConsumablesSection
						consumables={displayConsumables}
						onConsumableChange={onConsumableChange}
					/>
				</ConfigBand>
				<ConfigBand
					accent="#d08a86"
					tint="rgba(208,138,134,0.05)"
					title="Constraints"
					description="hard limits — a set that misses any of these is thrown out"
				>
					<ConstraintsSection
						uncritabilitySetting={config.uncritabilitySetting}
						uncrushabilitySetting={config.uncrushabilitySetting}
						resistanceFloors={config.resistanceFloors}
						onUpdateConstraints={onUpdateConstraints}
						onUpdateResistanceFloors={onUpdateResistanceFloors}
					/>
				</ConfigBand>
				<ConfigBand
					accent="rgba(255,255,255,0.3)"
					titleColor="rgba(255,255,255,0.85)"
					tint="rgba(255,255,255,0.025)"
					title="Assumptions"
					description="added stats, not solved for"
				>
					<BuffSection buffs={displayBuffs} onBuffChange={onBuffChange} />
				</ConfigBand>
			</Box>
		</Box>
	);
}
