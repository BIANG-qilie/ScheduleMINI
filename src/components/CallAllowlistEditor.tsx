import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  readCallAllowlist,
  writeCallAllowlist,
  type KeyValueStore,
} from "@/lib/call-allowlist";

type Props = {
  storage?: KeyValueStore;
  /** 打开设置等外层时重读 */
  refreshKey?: string | number | boolean;
};

export function CallAllowlistEditor({ storage, refreshKey }: Props) {
  const [allowlist, setAllowlist] = useState<string[]>([]);
  const [draftNumber, setDraftNumber] = useState("");

  useEffect(() => {
    setAllowlist(readCallAllowlist(storage));
  }, [storage, refreshKey]);

  const save = (numbers: string[]) => {
    writeCallAllowlist(numbers, storage);
    setAllowlist(numbers);
  };

  return (
    <div className="space-y-3 rounded-2xl border border-[var(--color-line)] p-4">
      <div>
        <h3 className="text-sm font-semibold">本机号码名单</h3>
        <p className="mt-1 text-xs leading-relaxed text-[var(--color-ink-muted)]">
          只留在这台手机上；名单空着时通话不会出现在补录里。
        </p>
      </div>
      {allowlist.length === 0 ? (
        <p className="text-sm text-[var(--color-ink-muted)]">名单是空的。</p>
      ) : (
        <ul className="space-y-1">
          {allowlist.map((number) => (
            <li
              key={number}
              className="flex items-center justify-between gap-2 text-sm"
            >
              <span className="tabular-nums">{number}</span>
              <button
                type="button"
                className="text-xs text-[var(--color-ink-muted)] underline-offset-2 hover:underline"
                onClick={() => save(allowlist.filter((item) => item !== number))}
              >
                移除
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const next = draftNumber.trim();
          if (!next || allowlist.includes(next)) return;
          save([...allowlist, next]);
          setDraftNumber("");
        }}
      >
        <Input
          value={draftNumber}
          onChange={(event) => setDraftNumber(event.target.value)}
          placeholder="+8613800138000"
          aria-label="名单号码"
          inputMode="tel"
        />
        <Button type="submit" variant="secondary" size="sm">
          加入
        </Button>
      </form>
    </div>
  );
}
