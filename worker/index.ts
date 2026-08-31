interface Env {
	ASSETS: Fetcher;
	TANK_SOLVER_ANALYTICS: AnalyticsEngineDataset;
}

type TrackEvent =
	| "solve_started"
	| "solve_succeeded"
	| "solve_failed"
	| "unknown_id_detected";

const TRACK_EVENTS: readonly TrackEvent[] = [
	"solve_started",
	"solve_succeeded",
	"solve_failed",
	"unknown_id_detected",
];

type UnknownIdType = "item" | "gem" | "enchant";

const UNKNOWN_ID_TYPES: readonly UnknownIdType[] = ["item", "gem", "enchant"];

interface UnknownId {
	type: UnknownIdType;
	id: string;
}

const isUnknownId = (value: unknown): value is UnknownId => {
	if (typeof value !== "object" || value === null) return false;
	const entry = value as Record<string, unknown>;
	return (
		UNKNOWN_ID_TYPES.includes(entry.type as UnknownIdType) &&
		typeof entry.id === "string" &&
		entry.id.length > 0 &&
		entry.id.length <= 64
	);
};

interface TrackBody {
	event: TrackEvent;
	durationMs?: number;
	configCount?: number;
	phase?: number;
	errorKind?: string;
	unknownIds?: UnknownId[];
}

const isTrackBody = (value: unknown): value is TrackBody => {
	if (typeof value !== "object" || value === null) return false;
	const body = value as Record<string, unknown>;
	if (!TRACK_EVENTS.includes(body.event as TrackEvent)) return false;
	if (body.durationMs !== undefined && !Number.isFinite(body.durationMs))
		return false;
	if (body.unknownIds !== undefined) {
		if (!Array.isArray(body.unknownIds)) return false;
		if (body.unknownIds.length > 100) return false;
		if (!body.unknownIds.every(isUnknownId)) return false;
	}
	return true;
};

const handleTrack = async (request: Request, env: Env): Promise<Response> => {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return new Response("invalid json", { status: 400 });
	}

	if (!isTrackBody(body)) {
		return new Response("invalid body", { status: 400 });
	}

	const durationMs =
		body.durationMs !== undefined && body.durationMs >= 0 ? body.durationMs : 0;

	env.TANK_SOLVER_ANALYTICS.writeDataPoint({
		blobs: [
			body.event,
			String(body.configCount ?? ""),
			String(body.phase ?? ""),
		],
		doubles: [durationMs],
		indexes: [body.event],
	});

	if (body.unknownIds) {
		for (const { type, id } of body.unknownIds) {
			env.TANK_SOLVER_ANALYTICS.writeDataPoint({
				blobs: ["unknown_id_detected", type, id],
				doubles: [],
				indexes: [id],
			});
		}
	}

	return new Response(null, { status: 204 });
};

export default {
	async fetch(request, env) {
		const url = new URL(request.url);
		if (url.pathname === "/api/track" && request.method === "POST") {
			return handleTrack(request, env);
		}
		return env.ASSETS.fetch(request);
	},
} satisfies ExportedHandler<Env>;
