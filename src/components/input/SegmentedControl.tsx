import Box from "@mui/material/Box";

interface SegmentedControlOption {
	value: number;
	label: string;
}

interface SegmentedControlProps {
	label: string;
	options: SegmentedControlOption[];
	value: number;
	onChange: (value: number) => void;
}

export default function SegmentedControl({
	label,
	options,
	value,
	onChange,
}: SegmentedControlProps) {
	return (
		<Box sx={{ display: "flex", flexDirection: "column", gap: 0.75 }}>
			<Box
				component="span"
				sx={{
					font: "500 11px/1 Roboto, sans-serif",
					letterSpacing: "0.08em",
					textTransform: "uppercase",
					color: "text.secondary",
				}}
			>
				{label}
			</Box>
			<Box
				sx={{
					display: "flex",
					bgcolor: "background.default",
					border: 1,
					borderColor: "divider",
					borderRadius: 1,
					overflow: "hidden",
					width: "fit-content",
				}}
			>
				{options.map((option, i) => {
					const selected = option.value === value;
					return (
						<Box
							key={option.value}
							component="span"
							onClick={() => onChange(option.value)}
							sx={{
								px: 1.5,
								py: 0.75,
								fontSize: 13,
								cursor: "pointer",
								whiteSpace: "nowrap",
								borderLeft: i === 0 ? 0 : 1,
								borderColor: "divider",
								bgcolor: selected ? "rgba(126,163,189,0.22)" : "transparent",
								color: selected ? "#cfe0ea" : "text.secondary",
								fontWeight: selected ? 500 : 400,
							}}
						>
							{option.label}
						</Box>
					);
				})}
			</Box>
		</Box>
	);
}
