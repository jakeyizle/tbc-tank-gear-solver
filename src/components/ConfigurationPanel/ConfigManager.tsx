import AddIcon from "@mui/icons-material/Add";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import LockIcon from "@mui/icons-material/Lock";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { useState } from "react";
import type { SolverConfiguration } from "#/types/SolverConfig";

interface ConfigManagerProps {
	configs: SolverConfiguration[];
	activeConfigId: string;
	onSelectConfig: (id: string) => void;
	onAddConfig: () => void;
	onDeleteConfig: (id: string) => void;
	onRenameConfig: (id: string, name: string) => void;
	onMoveConfig: (id: string, direction: "up" | "down") => void;
}

export default function ConfigManager({
	configs,
	activeConfigId,
	onSelectConfig,
	onAddConfig,
	onDeleteConfig,
	onRenameConfig,
	onMoveConfig,
}: ConfigManagerProps) {
	const [renameDialogOpen, setRenameDialogOpen] = useState(false);
	const [renamingId, setRenamingId] = useState<string | null>(null);
	const [newName, setNewName] = useState("");

	const handleRenameClick = (id: string, currentName: string) => {
		setRenamingId(id);
		setNewName(currentName);
		setRenameDialogOpen(true);
	};

	const handleRenameSave = () => {
		if (renamingId && newName.trim()) {
			onRenameConfig(renamingId, newName);
		}
		setRenameDialogOpen(false);
		setRenamingId(null);
	};

	return (
		<Box sx={{ mb: 2 }}>
			<Box
				sx={{
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					gap: 1,
					mb: 1,
				}}
			>
				<Box>
					<Typography variant="h6">Gear sets</Typography>
					<Typography variant="body2" color="text.secondary">
						Ranked by priority — solved from the top down.
					</Typography>
				</Box>
				<Button startIcon={<AddIcon />} onClick={onAddConfig} variant="outlined" size="small">
					Add set
				</Button>
			</Box>

			<Alert
				severity="info"
				icon={<LockIcon fontSize="small" />}
				sx={{ mb: 2, py: 0.5, alignItems: "center" }}
			>
				The top set picks each item&apos;s enchants and gems first. Lower sets must
				reuse those exact choices for any shared item, so rank your most important
				set first.
			</Alert>

			<Stack spacing={1}>
				{configs.map((config, index) => {
					const isActive = config.id === activeConfigId;
					return (
						<Box
							key={config.id}
							onClick={() => onSelectConfig(config.id)}
							sx={{
								display: "flex",
								alignItems: "center",
								gap: 1,
								p: 1,
								borderRadius: 1,
								cursor: "pointer",
								border: 1,
								borderColor: isActive ? "primary.main" : "divider",
								bgcolor: isActive ? "action.selected" : "background.paper",
								"&:hover": { borderColor: "primary.light" },
							}}
						>
							<Box
								sx={{
									flexShrink: 0,
									width: 28,
									height: 28,
									borderRadius: "50%",
									display: "flex",
									alignItems: "center",
									justifyContent: "center",
									fontSize: "0.875rem",
									fontWeight: 600,
									bgcolor: isActive ? "primary.main" : "action.disabledBackground",
									color: isActive ? "primary.contrastText" : "text.secondary",
								}}
							>
								{index + 1}
							</Box>

							<Typography
								sx={{
									flexGrow: 1,
									fontWeight: isActive ? 600 : 400,
									overflow: "hidden",
									textOverflow: "ellipsis",
									whiteSpace: "nowrap",
								}}
							>
								{config.name}
							</Typography>

							<Stack direction="row" spacing={0.5} onClick={(e) => e.stopPropagation()}>
								<Tooltip title="Higher priority">
									<span>
										<IconButton
											size="small"
											disabled={index === 0}
											onClick={() => onMoveConfig(config.id, "up")}
										>
											<ArrowUpwardIcon fontSize="small" />
										</IconButton>
									</span>
								</Tooltip>
								<Tooltip title="Lower priority">
									<span>
										<IconButton
											size="small"
											disabled={index === configs.length - 1}
											onClick={() => onMoveConfig(config.id, "down")}
										>
											<ArrowDownwardIcon fontSize="small" />
										</IconButton>
									</span>
								</Tooltip>
								<Tooltip title="Rename set">
									<IconButton
										size="small"
										onClick={() => handleRenameClick(config.id, config.name)}
									>
										<EditIcon fontSize="small" />
									</IconButton>
								</Tooltip>
								{configs.length > 1 && (
									<Tooltip title="Delete set">
										<IconButton
											size="small"
											color="error"
											onClick={() => onDeleteConfig(config.id)}
										>
											<DeleteIcon fontSize="small" />
										</IconButton>
									</Tooltip>
								)}
							</Stack>
						</Box>
					);
				})}
			</Stack>

			<Dialog open={renameDialogOpen} onClose={() => setRenameDialogOpen(false)}>
				<DialogTitle>Rename gear set</DialogTitle>
				<DialogContent>
					<TextField
						autoFocus
						value={newName}
						onChange={(e) => setNewName(e.target.value)}
						fullWidth
						size="small"
						sx={{ mt: 1 }}
						onKeyDown={(e) => {
							if (e.key === "Enter") handleRenameSave();
						}}
					/>
				</DialogContent>
				<DialogActions>
					<Button onClick={() => setRenameDialogOpen(false)}>Cancel</Button>
					<Button onClick={handleRenameSave} variant="contained">
						Save
					</Button>
				</DialogActions>
			</Dialog>
		</Box>
	);
}
