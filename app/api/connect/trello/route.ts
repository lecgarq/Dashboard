import { auth } from "@/server/auth";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getAuthUrl } from "@/lib/auth-env";

export async function GET(request: Request) {
  const session = await auth();
  if (!session) return redirect("/login");

  const { searchParams } = new URL(request.url);
  const callbackUrl = searchParams.get("callbackUrl") ?? "/trello";

  const cookieStore = await cookies();
  cookieStore.set("trello_callback_url", callbackUrl, {
    httpOnly: true,
    maxAge: 300,
    path: "/",
    sameSite: "lax",
  });

  const baseUrl = getAuthUrl() ?? "http://localhost:3000";
  const returnUrl = `${baseUrl}/api/auth/callback/trello`;
  const apiKey = process.env.TRELLO_API_KEY ?? "";

  const trelloAuthUrl =
    "https://trello.com/1/authorize?" +
    new URLSearchParams({
      expiration: "never",
      scope: "read,write,account",
      response_type: "token",
      name: "BIM Dashboard",
      key: apiKey,
      return_url: returnUrl,
    }).toString();

  return redirect(trelloAuthUrl);
}
