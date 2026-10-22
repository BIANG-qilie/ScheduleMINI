import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { summarizeNotes } from "@/lib/update/release";
import {
  openInstallPermissionSettings,
  updatePlatform,
} from "@/lib/update/install";
import { APP_VERSION } from "@/lib/update/version";
import { UPDATE_INTERVAL_MS, useUpdateStore } from "@/store/update-store";

export function useAutoUpdateCheck() {
  const check = useUpdateStore((s) => s.check);
  useEffect(() => {
    void check();
    const id = window.setInterval(() => void check(), UPDATE_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [check]);
}

function installLabel(status: string, percent: number | null) {
  if (status === "installing") {
    return percent === null ? "下载中…" : `下载中 ${percent}%`;
  }
  return "更新";
}

function ReleaseNotes({ markdown }: { markdown: string }) {
  const [showAll, setShowAll] = useState(false);
  const summary = summarizeNotes(markdown);
  const notes = showAll ? summary.lines : summary.preview;
  return (
    <>
      {notes.length > 0 && (
        <ul className="list-disc space-y-1 pl-5 text-[var(--color-ink-muted)]">
          {notes.map((line, i) => (
            <li key={`${i}-${line}`}>{line}</li>
          ))}
        </ul>
      )}
      {summary.hidden > 0 && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-auto whitespace-normal px-1 text-left"
          aria-expanded={showAll}
          onClick={() => setShowAll((open) => !open)}
        >
          {showAll ? (
            <>
              收起
              <ChevronUp className="h-4 w-4" aria-hidden />
            </>
          ) : (
            <>
              查看全部更新说明（还有 {summary.hidden} 项）
              <ChevronDown className="h-4 w-4" aria-hidden />
            </>
          )}
        </Button>
      )}
    </>
  );
}

export function UpdatePrompt() {
  const {
    release,
    status,
    percent,
    error,
    handedOffTo,
    promptOpen,
    install,
    later,
    skip,
  } = useUpdateStore();

  if (!release) return null;
  const android = updatePlatform() === "android";

  return (
    <Dialog
      open={promptOpen}
      onOpenChange={(open) => !open && later()}
      title={`发现新版本 v${release.version}`}
      eyebrow="更新"
      description={`当前 v${APP_VERSION}`}
      dense
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="ghost" onClick={skip}>
            跳过此版本
          </Button>
          <Button type="button" variant="outline" onClick={later}>
            稍后
          </Button>
          <Button
            type="button"
            disabled={status === "installing"}
            onClick={() => void install()}
          >
            {installLabel(status, percent)}
          </Button>
        </div>
      }
    >
      <div className="space-y-3 px-5 py-4 text-sm">
        <ReleaseNotes key={release.version} markdown={release.notes} />
        {status === "installing" && android && (
          <p>下载完成后会打开系统安装界面。</p>
        )}
        {status === "needs-permission" && (
          <div className="space-y-2 rounded-2xl border border-[var(--color-line)] p-3">
            <p>需要允许小日程安装未知应用，开启后返回再点「更新」。</p>
            <Button
              type="button"
              variant="outline"
              onClick={openInstallPermissionSettings}
            >
              去开启
            </Button>
          </div>
        )}
        {status === "handed-off" && (
          <p>
            {handedOffTo === "installer"
              ? "已打开系统安装界面。"
              : "已在浏览器打开下载页。"}
          </p>
        )}
        {status === "error" && error && (
          <p className="text-[var(--color-danger)]">{error}</p>
        )}
      </div>
    </Dialog>
  );
}

export function AboutSection() {
  const { status, release, error, check } = useUpdateStore();
  const message =
    status === "checking"
      ? "检查中…"
      : status === "latest"
        ? "已是最新版本"
        : status === "error"
          ? error
          : release && status !== "idle"
            ? `最新 v${release.version}`
            : null;

  return (
    <section className="mt-5 space-y-2 border-t border-[var(--color-line)] pt-4">
      <h3 className="text-sm font-semibold">关于</h3>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span>小日程 v{APP_VERSION}</span>
        <Button
          type="button"
          variant="outline"
          disabled={status === "checking"}
          onClick={() => void check({ manual: true })}
        >
          检查更新
        </Button>
        {message && <span role="status">{message}</span>}
      </div>
    </section>
  );
}
