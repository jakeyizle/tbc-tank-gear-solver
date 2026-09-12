import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import type { LPItem } from "#/solver/types";

interface InheritedItemsNoticeProps {
	items: LPItem[];
	/** See SolveResult.inheritedItemIds. Absent on results saved before it existed. */
	inheritedItemIds?: string[];
}

/**
 * Explains why some of this set's items were not freely optimized.
 *
 * With dependent configs (the default), an earlier set's picks are locked into every later set's
 * pool WITH their gems and enchants - because an item exists once and can be gemmed one way, so
 * whichever set takes it first decides how. That is the intended behaviour, but nothing on
 * screen used to say so, and its effects look like bugs: a later set can score well below what
 * its pool allows, and can move when a completely unrelated item is added to the pool (adding an
 * item changes the EARLIER set's pick, which changes what this one inherits).
 *
 * Exactly that cost an afternoon chasing a "superset pool gave a worse result" report that was
 * this feature working as designed.
 */
export default function InheritedItemsNotice({
	items,
	inheritedItemIds,
}: InheritedItemsNoticeProps) {
	if (!inheritedItemIds?.length) return null;

	const inherited = new Set(inheritedItemIds);
	const names = items
		.filter((item) => inherited.has(item.id))
		.map((item) => item.name);
	if (names.length === 0) return null;

	return (
		<Box
			sx={{
				mb: 1.5,
				px: 1.25,
				py: 0.875,
				borderRadius: 1,
				border: 1,
				borderColor: "warning.main",
				bgcolor: "rgba(255,167,38,0.06)",
			}}
		>
			<Typography variant="body2" color="warning.main" sx={{ fontWeight: 500 }}>
				{names.length} {names.length === 1 ? "item was" : "items were"}{" "}
				inherited from an earlier set
			</Typography>
			<Typography variant="caption" color="text.secondary">
				{names.join(", ")} — an earlier set chose {names.length === 1 ? "it" : "them"}{" "}
				first, so the gems and enchants were already fixed and this set could not
				re-optimize them. An item can only be gemmed one way. Turn on "Compare
				independently" to let every set solve from the same untouched pool.
			</Typography>
		</Box>
	);
}
