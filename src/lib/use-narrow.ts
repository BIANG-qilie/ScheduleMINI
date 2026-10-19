import { useEffect, useState } from "react";

/** 手机：竖屏按宽度，横屏按触屏矮窗。桌面窗口最小 860 且是鼠标，不会误入。 */
function mediaQuery(query: string) {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return null;
  }
  return window.matchMedia(query);
}

export function useNarrow(
  query = "(max-width: 760px), (max-height: 520px) and (orientation: landscape) and (pointer: coarse)",
) {
  const [narrow, setNarrow] = useState(
    () => mediaQuery(query)?.matches ?? false,
  );

  useEffect(() => {
    const mq = mediaQuery(query);
    if (!mq) return;
    const sync = () => setNarrow(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, [query]);

  return narrow;
}
