// lib/acc/template-mty.ts
//
// The single ACC project template this dashboard tab analyzes.
// A template is an Account-Admin "project template" (classification:"template"),
// reachable via the ACC Admin API like any project, but absent from the standard
// "list projects" sync — so its AccProject row is seeded manually. (The old
// lib/acc/templateSync.ts helper was deleted as dead code in 85448e96.)

/** ACC Template MTY — project-admin/template-settings/projects/<id>. */
export const TEMPLATE_MTY_ID = "def5fdea-8035-4b56-be60-66b36ba45149";
export const TEMPLATE_MTY_NAME = "ACC Template MTY";
