import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Flag, Heart, Hexagon } from "lucide-react";
import { readAnniversary, type Anniversary } from "@/lib/anniversary";
import {
  formatImportWhen,
  isCountdownItem,
  nextCountdownStart,
  readCountdown,
  type CountdownDisplay,
} from "@/lib/countdown";
import { formatDateKey, itemDisplayTitle, type ScheduleItem } from "@/lib/config";
import { cn, createId } from "@/lib/utils";

export type ToolsRoute =
  | { name: "hub" }
  | { name: "anniversaries" }
  | { name: "anniversary-edit"; id?: string }
  | { name: "anniversary"; id: string }
  | { name: "countdowns" }
  | { name: "countdown-import" }
  | { name: "countdown"; id: string };

function useNow(active: boolean) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, [active]);
  return now;
}

function PageTitle({
  title,
  onBack,
  action,
}: {
  title: string;
  onBack?: () => void;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex items-center gap-3">
      {onBack ? (
        <button
          type="button"
          className="inline-flex min-h-11 items-center gap-1 font-display text-[1.7rem] leading-none text-[var(--color-ink)]"
          onClick={onBack}
        >
          <ChevronLeft className="h-6 w-6" strokeWidth={1.6} />
          {title}
        </button>
      ) : (
        <h2 className="font-display text-[1.7rem] leading-none text-[var(--color-ink)]">
          {title}
        </h2>
      )}
      {action ? <div className="ml-auto">{action}</div> : null}
    </div>
  );
}

function EmptyMark({ label }: { label: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center pb-16 text-center">
      <span className="mb-5 h-px w-8 bg-[var(--color-ink)]" />
      <p className="font-display text-[1.65rem] text-[var(--color-ink)]">{label}</p>
    </div>
  );
}

function OutlineButton({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="inline-flex h-10 items-center rounded-full border border-[var(--color-ink)] px-4 text-sm text-[var(--color-ink)]"
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function ClockSentence({ sentence }: { sentence: string }) {
  const match = sentence.match(/^(.*?)(\d+)( 秒)$/);
  if (!match) return <>{sentence}</>;
  return (
    <>
      {match[1]}
      <span className="text-[var(--color-accent)]">{match[2]}</span>
      {match[3]}
    </>
  );
}

function CountdownBody({ display }: { display: CountdownDisplay }) {
  if (display.mode === "during") {
    return (
      <p className="pt-16 text-center font-display text-3xl underline decoration-[var(--color-ink)] decoration-1 underline-offset-[10px]">
        进行中
      </p>
    );
  }
  if (display.mode === "ended") {
    return (
      <p className="pt-16 text-center font-display text-2xl text-[var(--color-ink)]">
        {display.sentence}
      </p>
    );
  }
  const columns = [
    ["天", display.parts.days],
    ["小时", display.parts.hours],
    ["分", display.parts.minutes],
    ["秒", display.parts.seconds],
  ] as const;
  return (
    <div className="pt-10">
      <div className="grid grid-cols-4">
        {columns.map(([label, value], index) => (
          <div
            key={label}
            className={cn(
              "px-1 text-center",
              index > 0 && "border-l border-[var(--color-line)]",
            )}
          >
            <p
              className={cn(
                "font-display text-6xl leading-none tabular-nums",
                index === 3 ? "text-[var(--color-accent)]" : "text-[var(--color-ink)]",
              )}
            >
              {value}
            </p>
            <p className="mt-2 text-sm text-[var(--color-ink-muted)]">{label}</p>
          </div>
        ))}
      </div>
      <p className="mt-8 text-center text-sm tracking-wide text-[var(--color-ink-muted)]">
        {display.sentence}
      </p>
    </div>
  );
}

export function ToolsPages({
  route,
  onRoute,
  anniversaries,
  items,
  onSaveAnniversary,
  onDeleteAnniversary,
  onSetCountdown,
  onOpenSettings,
}: {
  route: ToolsRoute;
  onRoute: (route: ToolsRoute) => void;
  anniversaries: Anniversary[];
  items: ScheduleItem[];
  onSaveAnniversary: (item: Anniversary) => void;
  onDeleteAnniversary: (id: string) => void;
  onSetCountdown: (id: string, on: boolean) => void;
  onOpenSettings: () => void;
}) {
  const ticking =
    route.name === "countdowns" ||
    route.name === "countdown" ||
    route.name === "countdown-import";
  const now = useNow(ticking);
  const todayKey = formatDateKey(now);

  const readings = useMemo(
    () =>
      anniversaries
        .map((item) => ({ item, reading: readAnniversary(item, todayKey) }))
        .sort((a, b) => a.reading.days - b.reading.days || a.item.name.localeCompare(b.item.name, "zh-CN")),
    [anniversaries, todayKey],
  );

  if (route.name === "hub") {
    const rows = [
      { label: "纪念日", icon: Heart, route: { name: "anniversaries" } as const },
      { label: "倒数日", icon: Flag, route: { name: "countdowns" } as const },
    ];
    return (
      <div className="tools-page">
        <h2 className="mb-5 font-display text-[1.7rem] leading-none">小工具</h2>
        <div className="overflow-hidden rounded-[22px] border border-[var(--color-line)] bg-[var(--color-surface)]">
          {rows.map((row) => (
            <button
              key={row.label}
              type="button"
              className="tools-row"
              onClick={() => onRoute(row.route)}
            >
              <row.icon className="h-5 w-5" strokeWidth={1.6} />
              <span>{row.label}</span>
              <ChevronRight className="ml-auto h-4 w-4 text-[var(--color-ink-muted)]" />
            </button>
          ))}
          <button type="button" className="tools-row" onClick={onOpenSettings}>
            <Hexagon className="h-5 w-5" strokeWidth={1.6} />
            <span>设置</span>
            <ChevronRight className="ml-auto h-4 w-4 text-[var(--color-ink-muted)]" />
          </button>
        </div>
      </div>
    );
  }

  if (route.name === "anniversaries") {
    return (
      <div className="tools-page">
        <PageTitle
          title="纪念日"
          onBack={() => onRoute({ name: "hub" })}
          action={
            <OutlineButton onClick={() => onRoute({ name: "anniversary-edit" })}>
              添加
            </OutlineButton>
          }
        />
        {readings.length === 0 ? (
          <EmptyMark label="还没有纪念日" />
        ) : (
          <ul>
            {readings.map(({ item, reading }) => (
              <li key={item.id} className="border-b border-[var(--color-line)]/80">
                <button
                  type="button"
                  className="flex w-full items-center gap-3 py-4 text-left"
                  onClick={() => onRoute({ name: "anniversary", id: item.id })}
                >
                  <span className="font-display text-lg">{reading.listTitle}</span>
                  <span className="mb-1 h-px flex-1 border-b border-dotted border-[var(--color-line)]" />
                  {reading.today ? (
                    <span className="rounded-full border border-[#e4b2ad] px-3 py-1 text-sm text-[#a14b45]">
                      就是今天
                    </span>
                  ) : (
                    <span className="shrink-0 text-sm text-[var(--color-ink-muted)]">
                      {reading.listAside}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  if (route.name === "anniversary-edit") {
    return (
      <AnniversaryForm
        existing={anniversaries.find((item) => item.id === route.id)}
        onBack={() =>
          onRoute(route.id ? { name: "anniversary", id: route.id } : { name: "anniversaries" })
        }
        onSave={(item) => {
          onSaveAnniversary(item);
          onRoute({ name: "anniversary", id: item.id });
        }}
      />
    );
  }

  if (route.name === "anniversary") {
    const item = anniversaries.find((entry) => entry.id === route.id);
    if (!item) {
      return (
        <div className="tools-page">
          <PageTitle title="纪念日" onBack={() => onRoute({ name: "anniversaries" })} />
          <EmptyMark label="还没有纪念日" />
        </div>
      );
    }
    const reading = readAnniversary(item, todayKey);
    return (
      <div className="tools-page">
        <PageTitle title="纪念日" onBack={() => onRoute({ name: "anniversaries" })} />
        <p className="text-sm text-[var(--color-ink-muted)]">{item.name}</p>
        <AnniversarySentence reading={reading} />
        {item.note?.trim() ? (
          <div className="mt-10">
            <p className="text-sm text-[var(--color-ink-muted)]">备注</p>
            <p className="mt-2 text-base leading-relaxed">{item.note.trim()}</p>
          </div>
        ) : null}
        <div className="mt-10 flex gap-4 text-sm">
          <button
            type="button"
            className="underline decoration-1 underline-offset-4"
            onClick={() => onRoute({ name: "anniversary-edit", id: item.id })}
          >
            编辑
          </button>
          <button
            type="button"
            className="text-[var(--color-danger)] underline decoration-1 underline-offset-4"
            onClick={() => {
              if (!window.confirm(`确定删除「${item.name}」？`)) return;
              onDeleteAnniversary(item.id);
              onRoute({ name: "anniversaries" });
            }}
          >
            删除
          </button>
        </div>
      </div>
    );
  }

  if (route.name === "countdown-import") {
    const choices = items
      .filter((item) => item.enabled && !isCountdownItem(item))
      .map((item) => ({ item, start: nextCountdownStart(item, now) }))
      .filter((entry): entry is { item: ScheduleItem; start: Date } => entry.start != null)
      .sort((a, b) => a.start.getTime() - b.start.getTime());
    return (
      <div className="tools-page">
        <PageTitle title="设为倒数日" onBack={() => onRoute({ name: "countdowns" })} />
        {choices.length === 0 ? (
          <EmptyMark label="还没有可以设的日程" />
        ) : (
          <ul>
            {choices.map(({ item, start }) => (
              <li
                key={item.id}
                className="flex items-center gap-3 border-b border-[var(--color-line)] py-4"
              >
                <p className="min-w-0 flex-1">
                  <span className="font-medium">{itemDisplayTitle(item)}</span>{" "}
                  <span className="text-sm text-[var(--color-ink-muted)]">
                    {formatImportWhen(start, now)}
                  </span>
                </p>
                <button
                  type="button"
                  className="shrink-0 text-sm underline decoration-1 underline-offset-4"
                  onClick={() => {
                    onSetCountdown(item.id, true);
                    onRoute({ name: "countdown", id: item.id });
                  }}
                >
                  设为倒数日
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  if (route.name === "countdown") {
    const item = items.find((entry) => entry.id === route.id && isCountdownItem(entry));
    return (
      <div className="tools-page">
        <PageTitle title="看倒数" onBack={() => onRoute({ name: "countdowns" })} />
        {!item ? (
          <EmptyMark label="还没有倒数日" />
        ) : (
          <>
            <p className="font-display text-xl">{itemDisplayTitle(item)}</p>
            <CountdownBody display={readCountdown(item, now)} />
            <button
              type="button"
              className="mt-12 text-sm underline decoration-1 underline-offset-4"
              onClick={() => {
                onSetCountdown(item.id, false);
                onRoute({ name: "countdowns" });
              }}
            >
              取消倒数日
            </button>
          </>
        )}
      </div>
    );
  }

  const highlighted = items
    .filter((item) => isCountdownItem(item))
    .map((item) => ({ item, display: readCountdown(item, now) }))
    .sort((a, b) => a.item.title.localeCompare(b.item.title, "zh-CN"));

  return (
    <div className="tools-page">
      <PageTitle
        title="倒数日"
        onBack={() => onRoute({ name: "hub" })}
        action={
          <OutlineButton onClick={() => onRoute({ name: "countdown-import" })}>
            设为倒数日
          </OutlineButton>
        }
      />
      {highlighted.length === 0 ? (
        <EmptyMark label="还没有倒数日" />
      ) : (
        <ul>
          {highlighted.map(({ item, display }) => (
            <li key={item.id} className="border-b border-[var(--color-line)]">
              <button
                type="button"
                className="flex w-full items-center justify-between gap-4 py-4 text-left"
                onClick={() => onRoute({ name: "countdown", id: item.id })}
              >
                <span className="font-medium">{itemDisplayTitle(item)}</span>
                {display.mode === "during" ? (
                  <span className="shrink-0 underline decoration-1 underline-offset-4">
                    进行中
                  </span>
                ) : (
                  <span className="shrink-0 text-sm text-[var(--color-ink-muted)]">
                    <ClockSentence sentence={display.sentence} />
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AnniversarySentence({
  reading,
}: {
  reading: ReturnType<typeof readAnniversary>;
}) {
  if (reading.today || reading.days === 0) {
    return (
      <p className="mt-8 font-display text-3xl leading-snug">{reading.sentence}</p>
    );
  }
  const token = ` ${reading.days} `;
  const at = reading.sentence.indexOf(token);
  if (at < 0) {
    return <p className="mt-8 font-display text-3xl leading-snug">{reading.sentence}</p>;
  }
  return (
    <p className="mt-8 font-display leading-tight" aria-label={reading.sentence}>
      <span className="block text-2xl">{reading.sentence.slice(0, at).trim()}</span>
      <span className="mt-2 inline-flex items-end gap-2">
        <span className="text-7xl leading-none tabular-nums">{reading.days}</span>
        <span className="pb-2 text-2xl">天</span>
      </span>
    </p>
  );
}

function AnniversaryForm({
  existing,
  onBack,
  onSave,
}: {
  existing?: Anniversary;
  onBack: () => void;
  onSave: (item: Anniversary) => void;
}) {
  const [name, setName] = useState(existing?.name ?? "");
  const [date, setDate] = useState(existing?.date ?? "");
  const [note, setNote] = useState(existing?.note ?? "");
  const [yearly, setYearly] = useState(existing?.yearly ?? false);
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    if (!name.trim()) {
      setError("请填写名字");
      return;
    }
    if (!date) {
      setError("请选择日期");
      return;
    }
    onSave({
      id: existing?.id ?? createId(),
      name: name.trim(),
      date,
      note: note.trim(),
      yearly,
      updatedAt: new Date().toISOString(),
    });
  };

  return (
    <div className="tools-page">
      <PageTitle title={existing ? "编辑" : "添加"} onBack={onBack} />
      <label className="mb-6 block">
        <span className="text-sm text-[var(--color-ink-muted)]">名字</span>
        <input
          className="tools-line"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <label className="mb-6 block">
        <span className="text-sm text-[var(--color-ink-muted)]">日期</span>
        <input
          className="tools-line"
          type="date"
          lang="zh-CN"
          value={date}
          onChange={(event) => setDate(event.target.value)}
        />
      </label>
      <label className="mb-8 block">
        <span className="text-sm text-[var(--color-ink-muted)]">备注</span>
        <input
          className="tools-line"
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </label>
      <div className="flex items-center justify-between">
        <span className="text-base">按年循环</span>
        <button
          type="button"
          role="switch"
          aria-checked={yearly}
          aria-label="按年循环"
          className={cn("tools-switch", yearly && "tools-switch-on")}
          onClick={() => setYearly((value) => !value)}
        >
          <span />
        </button>
      </div>
      {error ? <p className="mt-4 text-sm text-[var(--color-danger)]">{error}</p> : null}
      <button
        type="button"
        className="mt-8 inline-flex h-11 w-fit items-center self-start rounded-full border border-[var(--color-ink)] px-5"
        onClick={submit}
      >
        {existing ? "保存" : "添加"}
      </button>
    </div>
  );
}
