import "server-only";
import { db } from "@/server/db";
import { TEMPLATE_MTY_ID, TEMPLATE_MTY_NAME } from "@/lib/acc/template-mty";
import type { FormaFolder } from "@/lib/forma/inheritance";
import { selectRealFolders } from "@/lib/forma/folderFilter";

export interface FormaFolderTree {
  templateId: string;
  templateName: string;
  folders: FormaFolder[];
}

/** Load the ACC Template MTY folder tree (id, parentId, name, fullPath). */
export async function loadFormaFolderTree(): Promise<FormaFolderTree> {
  const rows = await db.accFolder.findMany({
    where: { projectId: TEMPLATE_MTY_ID },
    select: { id: true, parentId: true, name: true, fullPath: true },
    orderBy: { fullPath: "asc" },
  });
  // Drop ACC's hidden system/module roots (GUID/code names); keep the real
  // document tree (Project Files, Photos, …).
  const folders = selectRealFolders(rows);
  return { templateId: TEMPLATE_MTY_ID, templateName: TEMPLATE_MTY_NAME, folders };
}
