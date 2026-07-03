import InventoryIcon from "@mui/icons-material/Inventory2Outlined";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

export default function EmptyResultsPlaceholder() {
	return (
		<Box
			sx={{
				display: "flex",
				justifyContent: "center",
				alignItems: "center",
				flexDirection: "column",
				gap: 1,
				height: "100vh",
				textAlign: "center",
				px: 4,
			}}
		>
			<InventoryIcon sx={{ fontSize: 56, color: "text.disabled" }} />
			<Typography variant="h6" color="text.secondary">
				No results yet
			</Typography>
			<Typography variant="body2" color="text.secondary" sx={{ maxWidth: 360 }}>
				Configure your gear sets on the left, then click "Solve All" to see
				optimized gear here.
			</Typography>
		</Box>
	);
}
