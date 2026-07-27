import { router } from "../trpc";
import { kpiRouter } from "./kpi";
import { searchRouter } from "./search";
import { usersRouter } from "./users";
import { projectRouter } from "./project";
import { trelloRouter } from "./trello";
import { calendarRouter } from "./calendar";
import { chatRouter } from "./chat";
import { lodRouter } from "./lod";
import { apsSearchRouter } from "./aps-search";
import { gmailRouter } from "./gmail";
import { workspaceRouter } from "./workspace";
import { accSyncRouter } from "./acc-sync";
import { accActivityRouter } from "./acc-activity";
import { accFoldersRouter } from "./acc-folders";
import { accMembersRouter } from "./acc-members";
import { accGraphRouter } from "./acc-graph";
import { accDcGraphRouter } from "./acc-dc-graph";
import { activityUniverseRouter } from "./activity-universe";
import { accCoordinationRouter } from "./acc-coordination";

export const appRouter = router({
  project: projectRouter,
  kpi: kpiRouter,
  search: searchRouter,
  users: usersRouter,
  trello: trelloRouter,
  calendar: calendarRouter,
  chat: chatRouter,
  lod: lodRouter,
  apsSearch: apsSearchRouter,
  gmail: gmailRouter,
  workspace: workspaceRouter,
  accSync: accSyncRouter,
  accActivity: accActivityRouter,
  accFolders: accFoldersRouter,
  accMembers: accMembersRouter,
  accGraph: accGraphRouter,
  accDcGraph: accDcGraphRouter,
  activityUniverse: activityUniverseRouter,
  accCoordination: accCoordinationRouter,
});

export type AppRouter = typeof appRouter;
