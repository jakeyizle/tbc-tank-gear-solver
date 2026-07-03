import { createTheme } from "@mui/material/styles";

export const theme = createTheme({
	palette: {
		mode: "dark",
		primary: {
			main: "#7ea3bd",
			light: "#9dbccf",
			dark: "#3c5a6e",
		},
		secondary: {
			main: "#c99a54",
			light: "#dab578",
			dark: "#a97d3c",
		},
		background: {
			default: "#14181c",
			paper: "#1e242a",
		},
		divider: "rgba(255, 255, 255, 0.12)",
		text: {
			primary: "rgba(255, 255, 255, 0.92)",
			secondary: "rgba(255, 255, 255, 0.65)",
		},
	},
	shape: {
		borderRadius: 8,
	},
	typography: {
		h6: {
			fontWeight: 700,
		},
		subtitle1: {
			fontWeight: 600,
		},
		subtitle2: {
			fontWeight: 600,
			color: "rgba(255, 255, 255, 0.7)",
		},
	},
	components: {
		MuiButton: {
			styleOverrides: {
				root: {
					textTransform: "none",
					fontWeight: 600,
				},
			},
		},
		MuiPaper: {
			styleOverrides: {
				root: {
					backgroundImage: "none",
				},
				elevation1: {
					boxShadow:
						"0 1px 0 rgba(255, 255, 255, 0.04) inset, 0 1px 3px rgba(0, 0, 0, 0.4), 0 1px 2px rgba(0, 0, 0, 0.3)",
				},
			},
		},
	},
});
