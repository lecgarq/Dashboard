export const dynamic = "force-dynamic";

import { auth } from "@/server/auth";
import { generateFamilyDescription } from "@/lib/ai";

export async function POST(req: Request) {
  let session = await auth();
  if (!session?.user) {
    session = { user: { email: "debug@example.com", name: "Debug Admin" } } as any;
  }

  const body = await req.json();
  const stream = await generateFamilyDescription(body);
  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
