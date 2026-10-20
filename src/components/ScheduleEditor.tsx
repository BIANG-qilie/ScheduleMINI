import {
  type ButtonHTMLAttributes,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  CALL_CHANNEL_OPTIONS,
  DEFAULT_CALL_CHANNEL,
  DEFAULT_WORK_KIND,
  GAME_PLATFORM_OPTIONS,
  SCHEDULE_TAG_OPTIONS,
  WEEKDAY_LABELS,
  WORK_KIND_META,
  WORK_KIND_OPTIONS,
  formatDateKey,
  partnerFacingName,
  itemSkippedDates,
  tagRespectsHolidays,
  workKindRequiredField,
  type CallChannel,
  type CoupleIdentity,
  type GamePlatform,
  type ItemOwner,
  type Recurrence,
  type ScheduleItem,
  type ScheduleTag,
  type WorkKind,
} from "@/lib/config";
import { TAG_SURFACE } from "@/lib/schedule-style";
import { cn } from "@/lib/utils";

export type Draft = {
  id?: string;
  start: string;
  end: string;
  title: string;
  note: string;
  weekdays: number[];
  enabled: boolean;
  recurrence: Recurrence;
  date: string;
  activeFrom: string;
  activeUntil: string;
  tag: ScheduleTag;
  origin: string;
  destination: string;
  callChannel: CallChannel;
  gamePlatform: GamePlatform | "";
  workKind: WorkKind;
  workPrimary: string;
  workSecondary: string;
  isCourseSwap: boolean;
  owner: ItemOwner;
};

type Props = {
  draft: Draft;
  setDraft: Dispatch<SetStateAction<Draft>>;
  soloMode: boolean;
  couple: CoupleIdentity;
  items: ScheduleItem[];
  heartBurst: number;
  onHeart: () => void;
  formError: string | null;
  onToggleWeekday: (day: number) => void;
  onUnskip: (id: string, date: string) => void;
};

function Block({
  label,
  hint,
  children,
}: {
  label?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2.5">
      {label ? <Label>{label}</Label> : null}
      {children}
      {hint ? (
        <p className="text-[11px] leading-relaxed text-[var(--color-ink-muted)]">
          {hint}
        </p>
      ) : null}
    </section>
  );
}

function Chip({
  active,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      type="button"
      className={cn(
        "h-8 rounded-full border px-3 text-xs tracking-wide transition-colors duration-150",
        active
          ? "border-transparent"
          : "border-[var(--color-line)] bg-transparent text-[var(--color-ink-muted)] hover:border-[color-mix(in_oklab,var(--color-ink)_25%,var(--color-line))] hover:text-[var(--color-ink)]",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function ScheduleEditor({
  draft,
  setDraft,
  soloMode,
  couple,
  items,
  heartBurst,
  onHeart,
  formError,
  onToggleWeekday,
  onUnskip,
}: Props) {
  const courseLocked = draft.isCourseSwap;
  const onceMode = draft.recurrence === "once" || courseLocked;

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] lg:gap-0">
      <div className="flex flex-col gap-6 lg:pr-8">
        {!soloMode ? (
          <Block label="归属">
            <div className="relative inline-flex self-start rounded-full border border-[var(--color-line)] bg-[color-mix(in_oklab,var(--color-bg)_55%,var(--color-surface))] p-1">
              {(
                [
                  ["self", "自己", couple.selfColor] as const,
                  ["partner", partnerFacingName(couple), couple.partnerColor] as const,
                  ["shared", "共同", "#f3a6a0"] as const,
                ] as const
              ).map(([value, label, color]) => {
                const active = draft.owner === value;
                return (
                  <button
                    key={value}
                    type="button"
                    className={cn(
                      "relative h-8 overflow-visible rounded-full px-3.5 text-xs tracking-wide transition-colors",
                      !active &&
                        "text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]",
                    )}
                    style={
                      active
                        ? {
                            backgroundColor: color,
                            color: value === "shared" ? "#3f1d24" : "#fff",
                            boxShadow:
                              value === "shared"
                                ? "0 2px 10px -2px rgba(243,166,160,0.55)"
                                : undefined,
                          }
                        : undefined
                    }
                    onClick={() => {
                      setDraft((prev) => ({ ...prev, owner: value }));
                      if (value === "shared") onHeart();
                    }}
                  >
                    {label}
                    {value === "shared" && heartBurst > 0 ? (
                      <span
                        key={heartBurst}
                        className="owner-heart-burst pointer-events-none absolute inset-0"
                        aria-hidden
                      >
                        <span className="owner-heart owner-heart-a">♥</span>
                        <span className="owner-heart owner-heart-b">♥</span>
                        <span className="owner-heart owner-heart-c">♥</span>
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </Block>
        ) : null}

        <Block
          label="标签"
          hint={
            tagRespectsHolidays(draft.tag) &&
            draft.recurrence === "weekly" &&
            !draft.isCourseSwap
              ? "放假日不出现"
              : undefined
          }
        >
          <div className="flex flex-wrap gap-1.5">
            {SCHEDULE_TAG_OPTIONS.map((opt) => (
              <Chip
                key={opt.id}
                active={draft.tag === opt.id}
                className={
                  draft.tag === opt.id
                    ? cn(TAG_SURFACE[opt.id].chip, "ring-1 ring-[var(--color-ink)]/15")
                    : undefined
                }
                onClick={() =>
                  setDraft((prev) => ({
                    ...prev,
                    tag: opt.id,
                    callChannel:
                      opt.id === "call"
                        ? prev.callChannel || DEFAULT_CALL_CHANNEL
                        : prev.callChannel,
                    workKind:
                      opt.id === "work"
                        ? prev.workKind || DEFAULT_WORK_KIND
                        : prev.workKind,
                    isCourseSwap: opt.id === "work" ? prev.isCourseSwap : false,
                    owner:
                      opt.id === "game" && prev.tag !== "game"
                        ? "shared"
                        : prev.owner,
                  }))
                }
              >
                {opt.label}
              </Chip>
            ))}
          </div>
        </Block>

        {draft.tag === "work" ? (
          <Block label="工作类型">
            <div className="flex flex-wrap gap-1.5">
              {WORK_KIND_OPTIONS.map((opt) => (
                <Chip
                  key={opt.id}
                  active={draft.workKind === opt.id}
                  className={
                    draft.workKind === opt.id
                      ? cn(TAG_SURFACE.work.chip, "ring-1 ring-[var(--color-ink)]/15")
                      : undefined
                  }
                  onClick={() =>
                    setDraft((prev) => ({
                      ...prev,
                      workKind: opt.id,
                      isCourseSwap: opt.id === "class" ? prev.isCourseSwap : false,
                      recurrence:
                        opt.id === "class" && prev.isCourseSwap
                          ? "once"
                          : prev.recurrence,
                    }))
                  }
                >
                  {opt.label}
                </Chip>
              ))}
            </div>
            {draft.workKind === "class" ? (
              <div className="mt-1 flex items-center justify-between gap-3 rounded-2xl border border-[#e7d3a4] bg-[#fbf6ea] px-3.5 py-3">
                <div className="min-w-0">
                  <Label htmlFor="course-swap">换课</Label>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-[#7a5a22]">
                    开启后固定为仅一次，周循环不可用
                  </p>
                </div>
                <Switch
                  id="course-swap"
                  checked={draft.isCourseSwap}
                  onCheckedChange={(on) =>
                    setDraft((prev) => ({
                      ...prev,
                      isCourseSwap: on,
                      recurrence: on ? "once" : prev.recurrence,
                      date:
                        on && !prev.date ? formatDateKey(new Date()) : prev.date,
                    }))
                  }
                />
              </div>
            ) : null}
          </Block>
        ) : null}

        {draft.tag === "call" ? (
          <Block label="通话渠道">
            <div className="flex flex-wrap gap-1.5">
              {CALL_CHANNEL_OPTIONS.map((opt) => (
                <Chip
                  key={opt.id}
                  active={draft.callChannel === opt.id}
                  className={
                    draft.callChannel === opt.id ? TAG_SURFACE.call.chip : undefined
                  }
                  onClick={() =>
                    setDraft((prev) => ({ ...prev, callChannel: opt.id }))
                  }
                >
                  {opt.label}
                </Chip>
              ))}
            </div>
          </Block>
        ) : null}

        {draft.tag === "game" ? (
          <Block label="平台">
            <div className="flex flex-wrap gap-1.5">
              {GAME_PLATFORM_OPTIONS.map((opt) => (
                <Chip
                  key={opt.id}
                  active={draft.gamePlatform === opt.id}
                  className={
                    draft.gamePlatform === opt.id ? TAG_SURFACE.game.chip : undefined
                  }
                  onClick={() =>
                    setDraft((prev) => ({
                      ...prev,
                      gamePlatform: prev.gamePlatform === opt.id ? "" : opt.id,
                    }))
                  }
                >
                  {opt.label}
                </Chip>
              ))}
            </div>
          </Block>
        ) : null}

        <Block label="时间">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor="start" className="text-xs text-[var(--color-ink-muted)]">
                开始
              </Label>
              <Input
                id="start"
                type="time"
                step={60}
                value={draft.start}
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, start: e.target.value }))
                }
              />
              <p className="text-[11px] leading-relaxed text-[var(--color-ink-muted)]">
                24 小时制
              </p>
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor="end" className="text-xs text-[var(--color-ink-muted)]">
                结束
              </Label>
              <Input
                id="end"
                type="time"
                step={60}
                value={draft.end}
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, end: e.target.value }))
                }
              />
              <p className="text-[11px] leading-relaxed text-[var(--color-ink-muted)]">
                早于开始即跨日
              </p>
            </div>
          </div>
        </Block>

      </div>

      <div className="flex flex-col gap-6 border-t border-[var(--color-line)] pt-6 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
        <Block label="重复方式">
          <div className="inline-flex self-start rounded-full border border-[var(--color-line)] bg-[color-mix(in_oklab,var(--color-bg)_55%,var(--color-surface))] p-1">
            <button
              type="button"
              disabled={courseLocked}
              className={cn(
                "h-8 rounded-full px-3.5 text-xs tracking-wide",
                draft.recurrence === "weekly" && !courseLocked
                  ? "bg-[var(--color-ink)] text-[var(--color-surface)]"
                  : "text-[var(--color-ink-muted)]",
                courseLocked && "cursor-not-allowed opacity-40",
              )}
              onClick={() =>
                setDraft((prev) => ({ ...prev, recurrence: "weekly" }))
              }
            >
              每周重复
            </button>
            <button
              type="button"
              className={cn(
                "h-8 rounded-full px-3.5 text-xs tracking-wide",
                onceMode
                  ? "bg-[var(--color-ink)] text-[var(--color-surface)]"
                  : "text-[var(--color-ink-muted)]",
              )}
              onClick={() =>
                setDraft((prev) => ({ ...prev, recurrence: "once" }))
              }
            >
              仅一次
            </button>
          </div>
          {courseLocked ? (
            <p className="text-xs leading-relaxed text-[#7a5a22]">
              换课中：已锁定为仅一次
            </p>
          ) : null}

          {onceMode ? (
            <div className="flex min-w-0 flex-col gap-1.5 pt-1">
              <Label htmlFor="once-date">日期</Label>
              <Input
                id="once-date"
                type="date"
                value={draft.date}
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, date: e.target.value }))
                }
              />
            </div>
          ) : (
            <div className="flex flex-col gap-3 pt-1">
              <div className="flex flex-wrap gap-1.5">
                {[1, 2, 3, 4, 5, 6, 0].map((day) => {
                  const label = WEEKDAY_LABELS[day];
                  const active = draft.weekdays.includes(day);
                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() => onToggleWeekday(day)}
                      className={
                        active
                          ? "h-9 min-w-9 rounded-full bg-[var(--color-ink)] px-3 text-sm text-[var(--color-surface)]"
                          : "h-9 min-w-9 rounded-full border border-[var(--color-line)] bg-transparent px-3 text-sm text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
                      }
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="active-from">生效</Label>
                  <Input
                    id="active-from"
                    type="date"
                    value={draft.activeFrom}
                    onChange={(e) =>
                      setDraft((prev) => ({
                        ...prev,
                        activeFrom: e.target.value,
                      }))
                    }
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="active-until">失效</Label>
                  <Input
                    id="active-until"
                    type="date"
                    value={draft.activeUntil}
                    onChange={(e) =>
                      setDraft((prev) => ({
                        ...prev,
                        activeUntil: e.target.value,
                      }))
                    }
                  />
                </div>
              </div>
            </div>
          )}
        </Block>
        {draft.tag === "commute" ? (
          <Block label="路线">
            <div className="grid grid-cols-1 gap-3">
              <div className="flex min-w-0 flex-col gap-1.5">
                <Label htmlFor="origin">出发地</Label>
                <Input
                  id="origin"
                  value={draft.origin}
                  placeholder="例如：大旺"
                  onChange={(e) =>
                    setDraft((prev) => ({ ...prev, origin: e.target.value }))
                  }
                />
              </div>
              <div className="flex min-w-0 flex-col gap-1.5">
                <Label htmlFor="destination">目的地</Label>
                <Input
                  id="destination"
                  value={draft.destination}
                  placeholder="例如：学校"
                  onChange={(e) =>
                    setDraft((prev) => ({
                      ...prev,
                      destination: e.target.value,
                    }))
                  }
                />
              </div>
            </div>
          </Block>
        ) : null}

        {draft.tag === "work" && draft.workKind !== "other" ? (
          <Block label="内容">
            {(() => {
              const meta = WORK_KIND_META[draft.workKind];
              const required = workKindRequiredField(draft.workKind);
              const primaryOptional = required !== "primary";
              const secondaryOptional = required !== "secondary";
              const primaryFirst = required !== "secondary";
              const primaryField = (
                <div className="flex min-w-0 flex-col gap-1.5" key="primary">
                  <Label htmlFor="work-primary">
                    {meta.primaryLabel}
                    {primaryOptional ? (
                      <span className="ml-1 font-normal text-[var(--color-ink-muted)]">
                        选填
                      </span>
                    ) : null}
                  </Label>
                  <Input
                    id="work-primary"
                    value={draft.workPrimary}
                    placeholder={meta.primaryPlaceholder}
                    onChange={(e) =>
                      setDraft((prev) => ({
                        ...prev,
                        workPrimary: e.target.value,
                      }))
                    }
                  />
                </div>
              );
              const secondaryField = (
                <div className="flex min-w-0 flex-col gap-1.5" key="secondary">
                  <Label htmlFor="work-secondary">
                    {meta.secondaryLabel}
                    {secondaryOptional ? (
                      <span className="ml-1 font-normal text-[var(--color-ink-muted)]">
                        选填
                      </span>
                    ) : null}
                  </Label>
                  <Input
                    id="work-secondary"
                    value={draft.workSecondary}
                    placeholder={meta.secondaryPlaceholder}
                    onChange={(e) =>
                      setDraft((prev) => ({
                        ...prev,
                        workSecondary: e.target.value,
                      }))
                    }
                  />
                </div>
              );
              return (
                <div className="grid grid-cols-1 gap-3">
                  {primaryFirst ? (
                    <>
                      {primaryField}
                      {secondaryField}
                    </>
                  ) : (
                    <>
                      {secondaryField}
                      {primaryField}
                    </>
                  )}
                </div>
              );
            })()}
          </Block>
        ) : (
          <Block>
            <Label htmlFor="title">
              {draft.tag === "work" ? WORK_KIND_META.other.primaryLabel : "标题"}
            </Label>
            <Input
              id="title"
              value={draft.title}
              placeholder={
                draft.tag === "work"
                  ? WORK_KIND_META.other.primaryPlaceholder
                  : "例如：站会、深度工作、约谈"
              }
              onChange={(e) =>
                setDraft((prev) => ({ ...prev, title: e.target.value }))
              }
            />
          </Block>
        )}

        <Block>
          <Label htmlFor="note">
            备注
            <span className="ml-1 font-normal text-[var(--color-ink-muted)]">
              选填
            </span>
          </Label>
          <Textarea
            id="note"
            value={draft.note}
            placeholder="补充说明"
            onChange={(e) =>
              setDraft((prev) => ({ ...prev, note: e.target.value }))
            }
          />
        </Block>

        <div className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--color-line)] px-3.5 py-3">
          <Label htmlFor="enabled">启用此日程</Label>
          <Switch
            id="enabled"
            checked={draft.enabled}
            onCheckedChange={(enabled) =>
              setDraft((prev) => ({ ...prev, enabled }))
            }
          />
        </div>

        {draft.id && draft.recurrence === "weekly" && !draft.isCourseSwap
          ? (() => {
              const existing = items.find((it) => it.id === draft.id);
              const skipped = existing ? itemSkippedDates(existing) : [];
              if (skipped.length === 0) return null;
              return (
                <Block label="已取消的日期">
                  <div className="flex flex-wrap gap-1.5">
                    {skipped.map((d) => (
                      <button
                        key={d}
                        type="button"
                        className="inline-flex h-7 items-center gap-1 rounded-full border border-[var(--color-line)] px-2.5 font-mono text-xs text-[var(--color-ink-muted)] hover:border-[var(--color-ink)] hover:text-[var(--color-ink)]"
                        title="恢复该次"
                        onClick={() => onUnskip(draft.id!, d)}
                      >
                        {d}
                        <span aria-hidden>×</span>
                      </button>
                    ))}
                  </div>
                </Block>
              );
            })()
          : null}

        {formError ? (
          <p className="text-sm text-[var(--color-danger)]">{formError}</p>
        ) : null}
      </div>
    </div>
  );
}
