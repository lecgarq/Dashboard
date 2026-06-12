/** One row from accds/v0 `template=activities`. Optional fields may be absent/null. */
export interface AccdsActivityRow {
  id?: string;
  activity_id: string;
  created_at: string;
  account_id?: string;
  project_id: string;
  service_group?: string | null;
  activity_verb: string;
  created_by: string;
  created_by_email?: string | null;
  created_by_display_name?: string | null;
  object_id?: string | null;
  object_object_type?: string | null;
  object_display_name?: string | null;
  docs_object_folder_id?: string | null;
  docs_object_folder_display_name?: string | null;
}

/** Insert shape for the `AccActivityAccds` table. */
export interface AccdsActivityInsert {
  accdsActivityId: string;
  autodeskId: string;
  userEmail: string | null;
  userName: string | null;
  projectId: string;
  serviceGroup: string | null;
  activityVerb: string;
  objectId: string | null;
  objectType: string | null;
  objectName: string | null;
  folderId: string | null;
  folderName: string | null;
  createdAt: Date;
  ingestRunId: string | null;
}

export function mapAccdsRow(
  row: AccdsActivityRow,
  ingestRunId: string | null = null,
): AccdsActivityInsert {
  return {
    accdsActivityId: row.activity_id,
    autodeskId: row.created_by,
    userEmail: row.created_by_email ? row.created_by_email.toLowerCase() : null,
    userName: row.created_by_display_name ?? null,
    projectId: row.project_id,
    serviceGroup: row.service_group ?? null,
    activityVerb: row.activity_verb,
    objectId: row.object_id ?? null,
    objectType: row.object_object_type ?? null,
    objectName: row.object_display_name ?? null,
    folderId: row.docs_object_folder_id ?? null,
    folderName: row.docs_object_folder_display_name ?? null,
    createdAt: new Date(row.created_at),
    ingestRunId,
  };
}
