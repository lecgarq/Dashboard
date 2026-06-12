-- accds/v0 activity rows. Physically separate from AccActivity (DC source) so the
-- two pipelines run alongside each other without double-counting in existing queries.
CREATE TABLE IF NOT EXISTS "AccActivityAccds" (
  "accdsActivityId" TEXT PRIMARY KEY,
  "autodeskId"      TEXT NOT NULL,
  "userEmail"       TEXT,
  "userName"        TEXT,
  "projectId"       TEXT NOT NULL,
  "serviceGroup"    TEXT,
  "activityVerb"    TEXT NOT NULL,
  "objectId"        TEXT,
  "objectType"      TEXT,
  "objectName"      TEXT,
  "folderId"        TEXT,
  "folderName"      TEXT,
  "createdAt"       TIMESTAMPTZ NOT NULL,
  "ingestRunId"     TEXT,
  "fetchedAt"       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "AccActivityAccds_projectId_createdAt_idx" ON "AccActivityAccds" ("projectId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "AccActivityAccds_userEmail_createdAt_idx" ON "AccActivityAccds" ("userEmail", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "AccActivityAccds_activityVerb_idx" ON "AccActivityAccds" ("activityVerb");
CREATE INDEX IF NOT EXISTS "AccActivityAccds_createdAt_idx" ON "AccActivityAccds" ("createdAt" DESC);
CREATE INDEX IF NOT EXISTS "AccActivityAccds_ingestRunId_idx" ON "AccActivityAccds" ("ingestRunId");
