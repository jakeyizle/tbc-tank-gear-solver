import DeleteIcon from "@mui/icons-material/Delete";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useState } from "react";
import { STAT_NAMES, type Stat, type StatName } from "#/solver/types";

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
					return { name: stat, value: entry.value };
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
		})
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

		const newStats = [...stats, { name: nextAvailable, value: 0 }];
		onChange(newStats);
	};

	return (
		<Box display="flex" flexDirection="column" gap={2}>
			<Typography variant="h6">Optimize Stats</Typography>
			{stats.map((entry, index) => (
				<Box key={entry.name} display="flex" gap={1} alignItems="center">
					<Select
						value={entry.name}
						onChange={(e) => updateStat(index, e.target.value)}
						size="small"
						sx={{ minWidth: 180 }}
					>
						{availableStats(index).map((stat) => (
							<MenuItem key={stat} value={stat}>
								{stat}
							</MenuItem>
						))}
					</Select>

					{/* Value Input */}
					<TextField
						type="number"
						value={entry.value}
						onChange={(e) => updateValue(index, e.target.value)}
						size="small"
						sx={{ width: 100 }}
					/>

					{/* Remove */}
					<IconButton onClick={() => removeStat(index)}>
						<DeleteIcon />
					</IconButton>
				</Box>
			))}

			{/* Add Button */}
			<Button variant="contained" onClick={handleAddStat}>
				Add Stat
			</Button>
		</Box>
	);
}
