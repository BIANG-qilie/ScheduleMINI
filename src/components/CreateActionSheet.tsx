import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: () => void;
  onReplay?: () => void;
};

export function CreateActionSheet({
  open,
  onOpenChange,
  onCreate,
  onReplay,
}: Props) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="写一条"
      className="phone-sheet sm:max-w-sm"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Button
          type="button"
          className="h-12 w-full"
          onClick={() => {
            onOpenChange(false);
            onCreate();
          }}
        >
          新建日程
        </Button>
        {onReplay ? (
          <Button
            type="button"
            variant="secondary"
            className="h-12 w-full"
            onClick={() => {
              onOpenChange(false);
              onReplay();
            }}
          >
            补录日程
          </Button>
        ) : null}
      </div>
    </Dialog>
  );
}
