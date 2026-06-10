// Users router — thin composition of the domain modules under ./users/.
// Procedure implementations live in account.ts (identity/admin/auth),
// acc-profile.ts (ACC per-user intel), and acc-graph.ts (ACC sync/graph).
import { router } from "../trpc";
import { userAccountProcedures } from "./users/account";
import { userAccProfileProcedures } from "./users/acc-profile";
import { userAccGraphProcedures } from "./users/acc-graph";

export const usersRouter = router({
  ...userAccountProcedures,
  ...userAccProfileProcedures,
  ...userAccGraphProcedures,
});
