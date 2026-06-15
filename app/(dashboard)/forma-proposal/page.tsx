import { loadFormaFolderTree } from "@/lib/server/formaFolderTree";
import { FormaProposalClient } from "./components/FormaProposalClient";

export const metadata = { title: "Forma Proposal" };
export const dynamic = "force-dynamic";

export default async function FormaProposalRoute() {
  const { templateId, templateName, folders } = await loadFormaFolderTree();
  return (
    <div className="flex h-full min-h-0 flex-col text-foreground">
      <FormaProposalClient
        templateId={templateId}
        templateName={templateName}
        folders={folders}
      />
    </div>
  );
}
