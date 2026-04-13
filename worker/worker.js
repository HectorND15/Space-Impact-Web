// Cloudflare Worker — Space Impact leaderboard
// KV namespace binding expected: LB (set in wrangler.toml)
// Endpoints:
//   GET  /leaderboard     → top 20 [{username, score, time, ts}]
//   POST /score           → { username, score, time }
//
// Anti-abuse:
//  - username: 1–12 chars, alphanum/space/dash, sanitized
//  - score: integer 0..999999
//  - time:  integer 0..3_600_000 (1h)
//  - per-IP rate limit: 1 submission / 10s via KV

const CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
};
const TOP_KEY = "top";
const MAX_ENTRIES = 20;

function json(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { "Content-Type": "application/json", ...CORS },
    });
}

function sanitizeName(n) {
    if (typeof n !== "string") return "";
    return n.trim().slice(0, 12).replace(/[^\w\- ]/g, "");
}

async function getTop(env) {
    const raw = await env.LB.get(TOP_KEY);
    return raw ? JSON.parse(raw) : [];
}

async function putTop(env, list) {
    await env.LB.put(TOP_KEY, JSON.stringify(list.slice(0, MAX_ENTRIES)));
}

export default {
    async fetch(req, env) {
        const url = new URL(req.url);

        if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

        if (url.pathname === "/leaderboard" && req.method === "GET") {
            return json(await getTop(env));
        }

        if (url.pathname === "/score" && req.method === "POST") {
            const ip = req.headers.get("cf-connecting-ip") || "unknown";
            const rlKey = `rl:${ip}`;
            if (await env.LB.get(rlKey)) return json({ error: "rate limited" }, 429);

            let body;
            try { body = await req.json(); }
            catch { return json({ error: "bad json" }, 400); }

            const username = sanitizeName(body.username) || "anon";
            const score = Math.floor(Number(body.score));
            const time = Math.floor(Number(body.time));
            if (!Number.isFinite(score) || score < 0 || score > 999999) return json({ error: "bad score" }, 400);
            if (!Number.isFinite(time) || time < 0 || time > 3_600_000) return json({ error: "bad time" }, 400);

            const list = await getTop(env);
            list.push({ username, score, time, ts: Date.now() });
            list.sort((a, b) => b.score - a.score || a.time - b.time);
            await putTop(env, list);
            await env.LB.put(rlKey, "1", { expirationTtl: 10 });

            return json({ ok: true, rank: list.slice(0, MAX_ENTRIES).findIndex(e => e.username === username && e.score === score && e.time === time) + 1 });
        }

        return json({ error: "not found" }, 404);
    },
};
