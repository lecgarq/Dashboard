import { Metadata } from "next";

import { AuthShell } from "@/components/auth/AuthShell";
import { RegistrationForm } from "@/components/auth/RegistrationForm";

export const metadata: Metadata = {
  title: "Register | BIM Dashboard",
  description: "Create your BIM Dashboard account",
};

export default function RegisterPage() {
  return (
    <AuthShell
      eyebrow="New workspace access"
      title="Create a clean onboarding path for the team."
      description="Start with a local account, then connect the external systems your BIM workflow depends on."
      highlights={[
        "A clearer onboarding flow reduces auth mistakes and duplicate accounts.",
        "Local credentials can be created first, with provider linking afterward.",
        "The visual language now matches the live dashboard shell.",
      ]}
      statusLabel="Registration ready"
    >
      <RegistrationForm />
    </AuthShell>
  );
}
