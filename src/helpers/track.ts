type TrackEvent =
	| "solve_started"
	| "solve_succeeded"
	| "solve_failed"
	| "unknown_id_detected";

export type UnknownIdType = "item" | "gem" | "enchant";

export interface UnknownId {
	type: UnknownIdType;
	id: string;
}

interface TrackPayload {
	event: TrackEvent;
	durationMs?: number;
	configCount?: number;
	phase?: number;
	errorKind?: "validation" | "solve_error";
	unknownIds?: UnknownId[];
}

export const track = (payload: TrackPayload): void => {
	try {
		fetch("/api/track", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(payload),
			keepalive: true,
		}).catch(() => {});
	} catch {
		// tracking must never break the UI
	}
};
