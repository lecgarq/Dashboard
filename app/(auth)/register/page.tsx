import { Metadata } from "next";

import { AuthShell } from "@/components/auth/AuthShell";
import { RegistrationForm } from "@/components/auth/RegistrationForm";

export const metadata: Metadata = {
  title: "Register | BIM Dashboard",
  description: "Create your BIM Dashboard account",
};

export default function RegisterPage() {
  return (
    <AuthShell>
      <RegistrationForm />
    </AuthShell>
  );
}
