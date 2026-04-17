import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type WikiLinkDialogProps = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onApply: (url: string) => void;
  setUrl: (url: string) => void;
  url: string;
};

export function WikiLinkDialog({
  isOpen,
  onApply,
  onOpenChange,
  setUrl,
  url,
}: WikiLinkDialogProps) {
  return (
    <Dialog onOpenChange={onOpenChange} open={isOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Insert Link</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="link-url">Destination URL</Label>
            <Input
              id="link-url"
              onChange={(event) => setUrl(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  onApply(url);
                }
              }}
              placeholder="https://example.com"
              value={url}
            />
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Cancel</Button>
          </DialogClose>
          <Button disabled={!url.trim()} onClick={() => onApply(url)}>
            Apply Link
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
