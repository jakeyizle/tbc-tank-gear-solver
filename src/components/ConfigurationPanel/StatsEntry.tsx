import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import MenuItem from "@mui/material/MenuItem";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { STAT_LABELS, STAT_NAMES, type Stat, type StatName } from "#/solver/types";

interface StatsEntryProps {
	stats: Stat[];
	onChange: (stats: Stat[]) => void;
}

export default function StatsEntry({ stats, onChange }: StatsEntryProps) {
	const availableStats = (currentIndex: number) => {
		const selectedStats = stats
			.map((s, i) => (i !== currentIndex ? s.name : null))
			.filter(Boolean);

		return STAT_NAMES.filter((stat) => !selectedStats.includes(stat));
	};

	const updateStat = (index: number, newStat: StatName) => {
		const newStats = stats.map((entry, i) => {
			if (i === index) {
				const stat = STAT_NAMES.find((name) => name === newStat);
				if (stat) {
					return { name: stat, value: entry.value, type: "flat" } as Stat;
				}
			}
			return entry;
		});
		onChange(newStats);
	};

	const updateValue = (index: number, newValue: string) => {
		// only allow positive numbers
		if (newValue.length > 0 && Number(newValue) < 0) return;
		const newStats = stats.map((entry, i) => {
			if (i === index) {
				return { ...entry, value: Number(newValue) };
			}
			return entry;
		});
		onChange(newStats);
	};

	const removeStat = (index: number) => {
		const newStats = stats.filter((_, i) => i !== index);
		onChange(newStats);
	};

	const handleAddStat = () => {
		const usedStats = new Set(stats.map((s) => s.name));
		const nextAvailable = STAT_NAMES.find((stat) => !usedStats.has(stat));
		if (!nextAvailable) return;

		const newStats = [
			...stats,
			{ name: nextAvailable, value: 0, type: "flat" },
		] as Stat[];
		onChange(newStats);
	};

	const allStatsUsed = stats.length >= STAT_NAMES.length;

	return (
		<Box display="flex" flexDirection="column" gap={1.5}>
			<Box>
				<Typography variant="h6">Optimize stats</Typography>
				<Typography variant="body2" color="text.secondary">
					Add the stats you care about and give each a weight. Higher weights are
					prioritized when ranking gear.
				</Typography>
			</Box>

			{stats.length === 0 && (
				<Typography variant="body2" color="text.secondary" fontStyle="italic">
					No stats added yet. Add at least one stat to tell the solver what to
					optimize for.
				</Typography>
			)}

			{stats.map((entry, index) => (
				<Box key={entry.name} display="flex" gap={1} alignItems="center">
					<TextField
						select
						label="Stat"
						value={entry.name}
						onChange={(e) => updateStat(index, e.target.value as StatName)}
						size="small"
						sx={{ flex: 1, minWidth: 180 }}
					>
						{availableStats(index).map((stat) => (
							<MenuItem key={stat} value={stat}>
								{STAT_LABELS[stat]}
							</MenuItem>
						))}
					</TextField>

					<TextField
						type="number"
						label="Weight"
						value={entry.value}
						onChange={(e) => updateValue(index, e.target.value)}
						size="small"
						sx={{ width: 110 }}
						slotProps={{ htmlInput: { min: 0, step: 0.5 } }}
					/>

					<Tooltip title="Remove stat">
						<IconButton onClick={() => removeStat(index)} size="small">
							<DeleteIcon fontSize="small" />
						</IconButton>
					</Tooltip>
				</Box>
			))}

			<Button
				variant="outlined"
				startIcon={<AddIcon />}
				onClick={handleAddStat}
				disabled={allStatsUsed}
				sx={{ alignSelf: "flex-start" }}
			>
				Add stat
			</Button>
		</Box>
	);
}
