import { AccessAnalysisShellClient } from "../access-analysis/AccessAnalysisShellClient";

// "Spatial Graph" (nav: Organization → Spatial Graph) renders the activity
// universe (v2.7): the 4.9M-event payload is fetched client-side as one binary
// artifact (/api/activity-universe/payload), so there is no tRPC prefetch or
// hydration boundary here — the instance graphSnapshot/instanceEmbedding
// prefetch retired with the user×project instance graph (ACT-03).
export default function Page(): React.JSX.Element {
  return (
    <div className="h-screen" style={{ contain: "strict" }}>
      <AccessAnalysisShellClient />
    </div>
  );
}
