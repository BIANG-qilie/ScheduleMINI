import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import { GripHorizontal } from "lucide-react";
import { isCurrentItem, todaysItems } from "@/lib/config";
import { getTodayLabel } from "@/lib/holidays";
import { subscribeConfigChanges, useConfigStore } from "@/store/config-store";

export function WidgetPage() {
  const { config, loading, hydrated, init, setConfig } = useConfigStore();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    void init();
  }, [init]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let active = true;
    let unlisten: (() => void) | undefined;
    void subscribeConfigChanges((next) => {
      void setConfig(next, false);
    }).then((fn) => {
      if (!active) {
        fn();
        return;
      }
      unlisten = fn;
    });
    return () => {
      active = false;
      unlisten?.();
    };
  }, [setConfig]);

  const items = useMemo(() => todaysItems(config.items, now), [config.items, now]);
  const holiday = useMemo(() => getTodayLabel(now), [now]);
  const dateText = format(now, "M月d日 EEEE", { locale: zhCN });

  if (!hydrated || loading) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <div className="w-full rounded-2xl bg-[color-mix(in_oklab,#10231f_88%,black)] px-4 py-6 text-center text-sm text-white/80">
          加载中…
        </div>
      </div>
    );
  }

  return (
    <div className="h-full p-2">
      <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-white/15 bg-[linear-gradient(165deg,rgba(16,35,31,0.92),rgba(20,48,42,0.88))] text-white shadow-[0_18px_40px_rgba(0,0,0,0.28)] backdrop-blur-md">
        <div
          data-tauri-drag-region
          className="flex cursor-grab items-center gap-2 border-b border-white/10 px-3 py-2 active:cursor-grabbing"
        >
          <GripHorizontal className="h-4 w-4 text-white/55" data-tauri-drag-region />
          <div data-tauri-drag-region className="min-w-0 flex-1">
            <p data-tauri-drag-region className="truncate text-xs text-white/60">
              今日日程
            </p>
            <p data-tauri-drag-region className="truncate text-sm font-medium">
              {dateText}
            </p>
          </div>
        </div>

        {config.showHolidays && holiday.kind !== "none" ? (
          <div
            className={
              holiday.kind === "work-on-weekend"
                ? "border-b border-white/10 bg-amber-500/20 px-3 py-2 text-xs text-amber-100"
                : "border-b border-white/10 bg-emerald-400/15 px-3 py-2 text-xs text-emerald-100"
            }
          >
            {holiday.name}
          </div>
        ) : null}

        <div className="flex-1 space-y-2 overflow-y-auto p-3">
          {items.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/20 px-3 py-8 text-center">
              <p className="text-sm font-medium text-white/90">今日暂无日程</p>
              <p className="mt-1 text-xs text-white/55">
                在设置里添加条目，或检查星期是否包含今天
              </p>
            </div>
          ) : (
            items.map((item) => {
              const current = isCurrentItem(item, now);
              return (
                <div
                  key={item.id}
                  className={
                    current
                      ? "rounded-xl border border-emerald-300/50 bg-emerald-400/20 px-3 py-2.5"
                      : "rounded-xl border border-white/10 bg-white/5 px-3 py-2.5"
                  }
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={
                        current
                          ? "font-mono text-xs text-emerald-100"
                          : "font-mono text-xs text-white/65"
                      }
                    >
                      {item.start}–{item.end}
                    </span>
                    {current ? (
                      <span className="text-[10px] tracking-wide text-emerald-100 uppercase">
                        进行中
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm font-medium leading-snug">{item.title}</p>
                  {item.note ? (
                    <p className="mt-0.5 text-xs text-white/55">{item.note}</p>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
