import CloseIcon from "@mui/icons-material/Close";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import {
	RESISTANCE_STAT_NAMES,
	STAT_LABELS,
	type ResistanceFloor,
	type StatName,
} from "#/solver/types";
import { monoFontFamily } from "#/theme";

interface ResistanceFloorsProps {
	floors: ResistanceFloor[];
	onChange: (floors: ResistanceFloor[]) => void;
}

export default function ResistanceFloors({ floors, onChange }: ResistanceFloorsProps) {
	const usedStats = new Set(floors.map((f) => f.stat));
	const availableStats = RESISTANCE_STAT_NAMES.filter((stat) => !usedStats.has(stat));

	const addFloor = () => {
		const nextStat = availableStats[0];
		if (!nextStat) return;
		onChange([...floors, { stat: nextStat, value: 0 }]);
	};

	const updateFloorStat = (index: number, stat: StatName) => {
		onChange(floors.map((f, i) => (i === index ? { ...f, stat } : f)));
	};

	const updateFloorValue = (index: number, newValue: string) => {
		if (newValue.length > 0 && Number(newValue) < 0) return;
		onChange(
			floors.map((f, i) => (i === index ? { ...f, value: Number(newValue) || 0 } : f)),
		);
	};

	const removeFloor = (index: number) => {
		onChange(floors.filter((_, i) => i !== index));
	};

	return (
		<Box display="flex" flexDirection="column" gap={0.75}>
			<Box display="flex" alignItems="center" gap={1.25}>
				<Box
					component="span"
					sx={{
						font: "500 11px/1 Roboto, sans-serif",
						letterSpacing: "0.08em",
						textTransform: "uppercase",
						color: "text.secondary",
					}}
				>
					Resistance floors
				</Box>
				<Typography variant="caption" color="text.disabled">
					optional — solver must reach each value
				</Typography>
				{availableStats.length > 0 && (
					<Typography
						variant="caption"
						color="primary"
						sx={{ ml: "auto", cursor: "pointer" }}
						onClick={addFloor}
					>
						+ Add resistance
					</Typography>
				)}
			</Box>

			{floors.length > 0 && (
				<Box display="flex" gap={1.25} flexWrap="wrap">
					{floors.map((floor, index) => (
						<Box key={floor.stat} display="flex" alignItems="center" gap={0.75}>
							<Select
								value={floor.stat}
								onChange={(e) => updateFloorStat(index, e.target.value as StatName)}
								size="small"
								sx={{ width: 165, fontSize: 13 }}
							>
								{[floor.stat, ...availableStats].map((stat) => (
									<MenuItem key={stat} value={stat} sx={{ fontSize: 13 }}>
										{STAT_LABELS[stat]}
									</MenuItem>
								))}
							</Select>
							<TextField
								value={floor.value}
								onChange={(e) => updateFloorValue(index, e.target.value)}
								size="small"
								type="number"
								slotProps={{
									htmlInput: { min: 0 },
									input: {
										startAdornment: (
											<Box component="span" sx={{ color: "text.disabled", mr: 0.5, fontSize: 13 }}>
												≥
											</Box>
										),
									},
								}}
								sx={{
									width: 88,
									"& input": {
										fontFamily: monoFontFamily,
										fontSize: 13,
										py: 0.75,
									},
								}}
							/>
							<IconButton size="small" onClick={() => removeFloor(index)}>
								<CloseIcon fontSize="inherit" />
							</IconButton>
						</Box>
					))}
				</Box>
			)}
		</Box>
	);
}
