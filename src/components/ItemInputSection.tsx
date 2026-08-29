import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import LockIcon from "@mui/icons-material/Lock";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import FormControlLabel from "@mui/material/FormControlLabel";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useEffect, useMemo, useRef, useState } from "react";
import { analyzeItemInput } from "#/helpers/parseItemInput";

interface ItemInputSectionProps {
	itemInput: string;
	setItemInput: (value: string) => void;
	areEnchantsGemsLocked: boolean;
	setAreEnchantsGemsLocked: (value: boolean) => void;
}

const PLACEHOLDER = `Paste your WowSims Exporter output here, e.g.

{"items":[{"id":28825,"enchant":2673,"gems":[24033]}, ...]}

— or — a comma-separated list of item IDs:

28825, 29011, 28749`;

export default function ItemInputSection({
	itemInput,
	setItemInput,
	areEnchantsGemsLocked,
	setAreEnchantsGemsLocked,
}: ItemInputSectionProps) {
	const analysis = useMemo(() => analyzeItemInput(itemInput), [itemInput]);
	const isValid = analysis.status === "valid";

	const [textareaOpen, setTextareaOpen] = useState(() => itemInput.trim().length > 0);
	const [manualEdit, setManualEdit] = useState(false);
	const [focused, setFocused] = useState(false);
	const containerRef = useRef<HTMLDivElement>(null);

	const editing = manualEdit || focused || (!isValid && textareaOpen);
	const showSummary = isValid && !editing;

	// Collapse only on an actual click outside the component — not on blur, so
	// toggling controls inside it (e.g. the lock switch) or losing window focus
	// (alt-tab, clicking off the browser) doesn't collapse the input.
	useEffect(() => {
		if (!focused) return;
		const handlePointerDown = (e: MouseEvent) => {
			if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
				setFocused(false);
				if (analyzeItemInput(itemInput).status === "valid") setManualEdit(false);
			}
		};
		document.addEventListener("mousedown", handlePointerDown);
		return () => document.removeEventListener("mousedown", handlePointerDown);
	}, [focused, itemInput]);

	const handlePasteFromClipboard = async () => {
		setTextareaOpen(true);
		try {
			const text = await navigator.clipboard.readText();
			if (text) setItemInput(text);
		} catch {
			// clipboard permission denied — leave the textarea open for a manual paste
		}
	};

	if (showSummary) {
		return (
			<Paper
				variant="outlined"
				sx={{
					display: "flex",
					alignItems: "center",
					gap: 1.5,
					px: 1.75,
					py: 1.25,
				}}
			>
				<Typography variant="body2" sx={{ fontWeight: 500, width: 78, flexShrink: 0 }}>
					Gear pool
				</Typography>
				<Stack direction="row" spacing={0.75} alignItems="center">
					<Box
						sx={{
							width: 7,
							height: 7,
							borderRadius: "50%",
							bgcolor: "success.main",
						}}
					/>
					<Typography variant="body2" color="success.main">
						{analysis.status === "valid" &&
							`${analysis.count} ${analysis.count === 1 ? "item" : "items"}${analysis.format === "json" ? " · WowSims export" : ""}`}
					</Typography>
				</Stack>

				<Stack direction="row" spacing={1} alignItems="center" sx={{ ml: "auto" }}>
					<FormControlLabel
						sx={{ mr: 0 }}
						control={
							<Switch
								size="small"
								checked={areEnchantsGemsLocked}
								onChange={(e) => setAreEnchantsGemsLocked(e.target.checked)}
							/>
						}
						label={
							<Typography variant="body2" color="text.secondary">
								Lock enchants &amp; gems
							</Typography>
						}
					/>
					<Typography
						variant="body2"
						color="primary"
						sx={{ cursor: "pointer" }}
						onClick={() => setManualEdit(true)}
					>
						Replace
					</Typography>
				</Stack>
			</Paper>
		);
	}

	return (
		<Paper
			ref={containerRef}
			variant="outlined"
			sx={{ p: 2, display: "flex", flexDirection: "column", gap: 1.25 }}
		>
			<Stack direction="row" alignItems="baseline" justifyContent="space-between">
				<Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
					Gear pool
				</Typography>
				<Typography variant="caption" color="text.secondary">
					Every set draws from these items
				</Typography>
			</Stack>

			{!textareaOpen ? (
				<Box
					sx={{
						border: "1px dashed",
						borderColor: "divider",
						borderRadius: 1,
						bgcolor: "background.default",
						py: 3.5,
						px: 2.5,
						display: "flex",
						flexDirection: "column",
						alignItems: "center",
						gap: 1,
						textAlign: "center",
					}}
				>
					<Typography variant="body1" sx={{ fontWeight: 500 }}>
						Paste your WowSims export
					</Typography>
					<Typography
						variant="body2"
						color="text.secondary"
						sx={{ maxWidth: 380 }}
					>
						Or a comma-separated list of item IDs. Export with the WowSims
						Exporter addon.
					</Typography>
					<Stack direction="row" spacing={1} sx={{ mt: 0.75 }}>
						<Button variant="contained" onClick={handlePasteFromClipboard}>
							Paste from clipboard
						</Button>
						<Button variant="outlined" onClick={() => setTextareaOpen(true)}>
							Type it in
						</Button>
					</Stack>
				</Box>
			) : (
				<>
					<TextField
						placeholder={PLACEHOLDER}
						variant="outlined"
						fullWidth
						multiline
						minRows={4}
						maxRows={12}
						autoFocus
						value={itemInput}
						onChange={(e) => setItemInput(e.target.value)}
						onFocus={() => setFocused(true)}
						error={analysis.status === "error"}
						slotProps={{ htmlInput: { spellCheck: false } }}
					/>
					<Box sx={{ minHeight: 24 }}>
						{analysis.status === "valid" ? (
							<Stack direction="row" spacing={0.5} alignItems="center">
								<CheckCircleIcon color="success" fontSize="small" />
								<Typography variant="caption" color="success.main">
									{analysis.count} {analysis.count === 1 ? "item" : "items"} recognized
									{analysis.format === "json" ? " from WowSims export" : ""}
								</Typography>
							</Stack>
						) : analysis.status === "error" ? (
							<Stack direction="row" spacing={0.5} alignItems="center">
								<ErrorOutlineIcon color="error" fontSize="small" />
								<Typography variant="caption" color="error.main">
									{analysis.message}
								</Typography>
							</Stack>
						) : null}
					</Box>
					<FormControlLabel
						control={
							<Switch
								size="small"
								checked={areEnchantsGemsLocked}
								onChange={(e) => setAreEnchantsGemsLocked(e.target.checked)}
							/>
						}
						label={
							<Stack direction="row" spacing={0.5} alignItems="center">
								<LockIcon fontSize="inherit" />
								<Typography variant="body2">Lock enchants and gems</Typography>
							</Stack>
						}
					/>
				</>
			)}
		</Paper>
	);
}
