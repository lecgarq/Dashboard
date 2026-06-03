import { db } from "@/server/db";
import { prewarmAccHotCache } from "@/lib/server/acc-hot-cache";

function isLocalHost(hostname: string) {
  return ["localhost", "127.0.0.1", "::1", "0.0.0.0"].includes(hostname);
}

export async function GET(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return new Response(null, { status: 404 });
  }

  const url = new URL(request.url);
  if (!isLocalHost(url.hostname)) {
    return Response.json({ ok: false, error: "Local development only" }, { status: 403 });
  }

  const result = await prewarmAccHotCache(db);
  return Response.json({
    ok: result.tasks.every((task) => task.ok),
    ...result,
  });
}
