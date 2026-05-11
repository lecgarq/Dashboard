import { router } from "../trpc";
import { familiesRouter } from "./families";
import { clashRouter } from "./clash";
import { examRouter } from "./exam";
import { kpiRouter } from "./kpi";
import { tasksRouter } from "./tasks";
import { searchRouter } from "./search";
import { usersRouter } from "./users";
import { projectRouter } from "./project";
import { trelloRouter } from "./trello";
import { simRouter } from "./sim";
import { calendarRouter } from "./calendar";
import { chatRouter } from "./chat";
import { lodRouter } from "./lod";
import { apsSearchRouter } from "./aps-search";
import { gmailRouter } from "./gmail";
import { workspaceRouter } from "./workspace";
import { accSyncRouter } from "./acc-sync";
import { accActivityRouter } from "./acc-activity";

export const appRouter = router({
  project: projectRouter,
  families: familiesRouter,
  clash: clashRouter,
  exam: examRouter,
  kpi: kpiRouter,
  tasks: tasksRouter,
  search: searchRouter,
  users: usersRouter,
  trello: trelloRouter,
  sim: simRouter,
  calendar: calendarRouter,
  chat: chatRouter,
  lod: lodRouter,
  apsSearch: apsSearchRouter,
  gmail: gmailRouter,
  workspace: workspaceRouter,
  accSync: accSyncRouter,
  accActivity: accActivityRouter,
});

export type AppRouter = typeof appRouter;
