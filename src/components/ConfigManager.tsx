import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import IconButton from "@mui/material/IconButton";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import TextField from "@mui/material/TextField";
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
}

export default function ConfigManager({
	configs,
	activeConfigId,
	onSelectConfig,
	onAddConfig,
	onDeleteConfig,
	onRenameConfig,
}: ConfigManagerProps) {
	const [renameDialogOpen, setRenameDialogOpen] = useState(false);
	const [renamingId, setRenamingId] = useState<string | null>(null);
	const [newName, setNewName] = useState("");

	const activeIndex = configs.findIndex((c) => c.id === activeConfigId);

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
			<Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
				<Typography variant="h6">Configurations</Typography>
				<Button
					startIcon={<AddIcon />}
					onClick={onAddConfig}
					variant="outlined"
					size="small"
				>
					New Config
				</Button>
			</Box>

			<Tabs
				value={activeIndex === -1 ? 0 : activeIndex}
				onChange={(_, newValue) => onSelectConfig(configs[newValue]?.id)}
				variant="scrollable"
				scrollButtons="auto"
				sx={{
					borderBottom: 1,
					borderColor: "divider",
					"& .MuiTab-root": {
						minWidth: 120,
						textTransform: "none",
						fontSize: "0.875rem",
					},
				}}
			>
				{configs.map((config) => (
					<Tab
						key={config.id}
						label={
							<Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
								{config.name}
							</Box>
						}
						value={configs.indexOf(config)}
					/>
				))}
			</Tabs>

			{configs.length > 0 && (
				<Box sx={{ display: "flex", gap: 1, mt: 1 }}>
					<IconButton
						size="small"
						onClick={() => {
							const config = configs.find((c) => c.id === activeConfigId);
							if (config) {
								handleRenameClick(config.id, config.name);
							}
						}}
						title="Rename config"
					>
						<EditIcon fontSize="small" />
					</IconButton>
					{configs.length > 1 && (
						<IconButton
							size="small"
							onClick={() => onDeleteConfig(activeConfigId)}
							title="Delete config"
							color="error"
						>
							<DeleteIcon fontSize="small" />
						</IconButton>
					)}
				</Box>
			)}

			<Dialog open={renameDialogOpen} onClose={() => setRenameDialogOpen(false)}>
				<DialogTitle>Rename Configuration</DialogTitle>
				<DialogContent>
					<TextField
						autoFocus
						value={newName}
						onChange={(e) => setNewName(e.target.value)}
						fullWidth
						size="small"
						sx={{ mt: 1 }}
						onKeyPress={(e) => {
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
