import ErrorOutlineIcon from "@mui/icons-material/ErrorOutlineOutlined";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

interface ErrorResultsPlaceholderProps {
	message: string;
}

export default function ErrorResultsPlaceholder({ message }: ErrorResultsPlaceholderProps) {
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
			<ErrorOutlineIcon sx={{ fontSize: 56, color: "error.main" }} />
			<Typography variant="h6" color="error">
				Solve failed
			</Typography>
			<Typography variant="body2" color="text.secondary" sx={{ maxWidth: 480 }}>
				{message}
			</Typography>
		</Box>
	);
}
