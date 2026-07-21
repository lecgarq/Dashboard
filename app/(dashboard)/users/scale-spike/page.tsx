import { notFound } from "next/navigation";
import { ScaleSpikeClient } from "./ScaleSpikeClient";
import { SPIKE_DEFAULT_COUNT, SPIKE_DEFAULT_SEED } from "./spikeSynthetic";

// Phase-37 SCALE-01 feasibility spike surface. Flag-gated dev route: with
// NEXT_PUBLIC_ACC_SCALE_SPIKE unset this is a 404 and nothing here affects any
// live surface. Remove-or-re-gate decision belongs to the v2.7 milestone close.
export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.JSX.Element> {
  if (process.env.NEXT_PUBLIC_ACC_SCALE_SPIKE !== "1") notFound();
  const sp = await searchParams;
  const first = (v: string | string[] | undefined): string | undefined =>
    Array.isArray(v) ? v[0] : v;
  const count = Math.max(1, Number(first(sp.n)) || SPIKE_DEFAULT_COUNT);
  const seed = Number(first(sp.seed)) || SPIKE_DEFAULT_SEED;
  const gpu = first(sp.gpu) === "1";
  return <ScaleSpikeClient count={count} seed={seed} gpu={gpu} />;
}
