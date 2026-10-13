import { useEffect, useState } from "react";

/** 手机宽度。桌面窗口最小 860，不会误入这套布局。 */
function mediaQuery(query: string) {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return null;
  }
  return window.matchMedia(query);
}

export function useNarrow(query = "(max-width: 760px)") {
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
