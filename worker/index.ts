interface Env {
	ASSETS: Fetcher;
	TANK_SOLVER_ANALYTICS: AnalyticsEngineDataset;
}

type TrackEvent = "solve_started" | "solve_succeeded" | "solve_failed";

const TRACK_EVENTS: readonly TrackEvent[] = [
	"solve_started",
	"solve_succeeded",
	"solve_failed",
];

interface TrackBody {
	event: TrackEvent;
	durationMs?: number;
	configCount?: number;
	phase?: number;
	errorKind?: string;
}

const isTrackBody = (value: unknown): value is TrackBody => {
	if (typeof value !== "object" || value === null) return false;
	const body = value as Record<string, unknown>;
	if (!TRACK_EVENTS.includes(body.event as TrackEvent)) return false;
	if (body.durationMs !== undefined && !Number.isFinite(body.durationMs))
		return false;
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
