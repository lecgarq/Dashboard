import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export async function GET(request: Request) {
  const session = await auth();
  if (!session) return redirect("/login");

  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");

  if (!token) {
    // Trello returns the token as a URL hash fragment (#token=...) which browsers
    // never send to the server. This HTML reads the fragment and re-redirects with
    // the token as a proper query param so the server can process it.
    return new Response(
      `<!DOCTYPE html><html><script>
var h=new URLSearchParams(location.hash.slice(1)),t=h.get('token');
location.replace(t?location.pathname+'?token='+encodeURIComponent(t):'/trello?error=no_token');
</script></html>`,
      { headers: { "Content-Type": "text/html" } }
    );
  }

  const apiKey = process.env.TRELLO_API_KEY ?? "";
  const meRes = await fetch(
    `https://api.trello.com/1/members/me?fields=id,username&key=${apiKey}&token=${token}`
  );
  if (!meRes.ok) return redirect("/trello?error=invalid_token");

  const me = (await meRes.json()) as { id: string; username: string };

  await db.account.upsert({
    where: {
      provider_providerAccountId: {
        provider: "trello",
        providerAccountId: me.id,
      },
    },
    create: {
      userId: session.user.id,
      type: "trello-token",
      provider: "trello",
      providerAccountId: me.id,
      access_token: token,
    },
    update: {
      access_token: token,
      userId: session.user.id,
    },
  });

  const cookieStore = await cookies();
  const callbackUrl = cookieStore.get("trello_callback_url")?.value ?? "/trello";
  cookieStore.delete("trello_callback_url");

  return redirect(callbackUrl);
}
