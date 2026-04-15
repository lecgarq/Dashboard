import { Building2, Orbit, ShieldCheck, Sparkles } from "lucide-react";

type AuthShellProps = {
  eyebrow: string;
  title: string;
  description: string;
  highlights: string[];
  children: React.ReactNode;
  statusLabel?: string;
};

function BrandMark() {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/14 shadow-[inset_0_1px_0_rgba(255,255,255,0.18)] ring-1 ring-white/20 backdrop-blur-sm">
        <Building2 className="h-5 w-5 text-white" />
      </div>
      <div>
        <p className="font-display text-lg font-semibold tracking-tight text-white">
          BIM Dashboard
        </p>
        <p className="text-sm text-white/68">Coordination, QA, and delivery in one workspace.</p>
      </div>
    </div>
  );
}

export function AuthShell({
  eyebrow,
  title,
  description,
  highlights,
  children,
  statusLabel = "Secure workspace",
}: AuthShellProps) {
  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0">
        <div className="auth-mesh absolute inset-0 opacity-35" />
        <div className="animate-drift absolute -left-24 top-16 h-64 w-64 rounded-full bg-sky-300/25 blur-3xl" />
        <div className="animate-float absolute right-[-7rem] top-[-5rem] h-80 w-80 rounded-full bg-amber-200/40 blur-3xl" />
        <div className="animate-float-delayed absolute bottom-[-6rem] right-[22%] h-72 w-72 rounded-full bg-teal-200/28 blur-3xl" />
      </div>

      <div className="relative grid min-h-screen lg:grid-cols-[minmax(0,1.08fr)_minmax(460px,0.92fr)]">
        <section className="hidden lg:flex lg:flex-col lg:justify-between lg:px-12 lg:py-10 xl:px-16">
          <div className="surface-chip flex w-fit items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.28em] text-white/84">
            <Sparkles className="h-3.5 w-3.5" />
            {eyebrow}
          </div>

          <div className="relative overflow-hidden rounded-[2rem] border border-white/12 bg-[linear-gradient(145deg,rgba(20,33,61,0.96),rgba(29,78,216,0.88)_52%,rgba(15,118,110,0.82))] px-10 py-10 text-white shadow-[0_40px_120px_-52px_rgba(15,23,42,0.88)]">
            <div className="auth-mesh absolute inset-0 opacity-20" />
            <div className="absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-white/65 to-transparent" />
            <div className="relative flex h-full flex-col justify-between gap-10">
              <div className="space-y-8">
                <BrandMark />

                <div className="space-y-4">
                  <div className="surface-chip inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.26em] text-white/78">
                    <Orbit className="h-3.5 w-3.5" />
                    Connected delivery
                  </div>
                  <h1 className="font-display max-w-xl text-5xl font-semibold leading-[1.02] tracking-[-0.04em] text-balance">
                    {title}
                  </h1>
                  <p className="max-w-lg text-lg leading-8 text-white/74">{description}</p>
                </div>
              </div>

              <div className="grid gap-3">
                {highlights.map((highlight) => (
                  <div
                    key={highlight}
                    className="surface-panel flex items-center gap-3 rounded-2xl px-4 py-3 text-sm text-white/84"
                  >
                    <ShieldCheck className="h-4 w-4 shrink-0 text-amber-200" />
                    <span>{highlight}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4 text-sm text-slate-600">
            <div className="surface-chip inline-flex items-center gap-2 rounded-full px-4 py-2">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulseGlow" />
              {statusLabel}
            </div>
            <span className="font-medium text-slate-500">Design tuned for focused daily use.</span>
          </div>
        </section>

        <section className="relative flex items-center justify-center px-5 py-10 sm:px-8 lg:px-12">
          <div className="w-full max-w-[34rem] space-y-6">
            <div className="lg:hidden space-y-4">
              <div className="surface-chip inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.28em] text-primary">
                <Sparkles className="h-3.5 w-3.5" />
                {eyebrow}
              </div>
              <div className="space-y-3">
                <p className="font-display text-2xl font-semibold tracking-tight text-primary">
                  BIM Dashboard
                </p>
                <h1 className="font-display text-4xl font-semibold leading-tight tracking-[-0.04em] text-balance text-slate-950">
                  {title}
                </h1>
                <p className="max-w-xl text-sm leading-7 text-slate-600">{description}</p>
              </div>
            </div>

            {children}
          </div>
        </section>
      </div>
    </div>
  );
}
