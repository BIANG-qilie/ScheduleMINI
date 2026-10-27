import { CalendarPlus, History } from "lucide-react";
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
    <Dialog open={open} onOpenChange={onOpenChange} title="新建" third>
      <div className="create-choice-row">
        <button
          type="button"
          className="create-choice"
          aria-labelledby="create-choice-new-title"
          aria-describedby="create-choice-new-desc"
          onClick={() => {
            onOpenChange(false);
            onCreate();
          }}
        >
          <span className="create-choice-icon" aria-hidden>
            <CalendarPlus />
          </span>
          <span id="create-choice-new-title" className="create-choice-title">
            新建日程
          </span>
          <span id="create-choice-new-desc" className="create-choice-desc">
            手写一条新的安排
          </span>
        </button>
        {onReplay ? (
          <button
            type="button"
            className="create-choice"
            aria-labelledby="create-choice-replay-title"
            aria-describedby="create-choice-replay-desc"
            onClick={() => {
              onOpenChange(false);
              onReplay();
            }}
          >
            <span className="create-choice-icon" aria-hidden>
              <History />
            </span>
            <span id="create-choice-replay-title" className="create-choice-title">
              补录日程
            </span>
            <span id="create-choice-replay-desc" className="create-choice-desc">
              对照今天用过的应用补上
            </span>
          </button>
        ) : null}
      </div>
    </Dialog>
  );
}
