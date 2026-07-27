-- DB-01 (CONCERNS §1.2): roleId-leading lookups on AccFolderPermission (~6M rows) had no index;
-- the composite @@unique([folderId, roleId]) cannot serve a roleId-only scan. Standard (non-CONCURRENT)
-- build is fine on the local single-user DB.
CREATE INDEX IF NOT EXISTS "acc_folder_permission_role_id_idx" ON "AccFolderPermission" ("roleId");
