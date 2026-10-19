import { create } from "zustand";
import {
  fetchLatestRelease,
  type ReleaseInfo,
} from "@/lib/update/release";
import { installRelease } from "@/lib/update/install";
import { APP_VERSION, isNewer } from "@/lib/update/version";

const SKIP_KEY = "schedulemini.update.skipped";
export const UPDATE_INTERVAL_MS = 6 * 60 * 60 * 1000;

type Status =
  | "idle"
  | "checking"
  | "latest"
  | "available"
  | "installing"
  | "needs-permission"
  | "handed-off"
  | "error";

type UpdateState = {
  status: Status;
  release: ReleaseInfo | null;
  percent: number | null;
  error: string | null;
  promptOpen: boolean;
  check: (opts?: { manual?: boolean }) => Promise<void>;
  install: () => Promise<void>;
  later: () => void;
  skip: () => void;
};

export const useUpdateStore = create<UpdateState>((set, get) => ({
  status: "idle",
  release: null,
  percent: null,
  error: null,
  promptOpen: false,

  async check({ manual = false } = {}) {
    if (get().status === "checking" || get().status === "installing") return;
    set({ status: "checking", error: null });
    try {
      const release = await fetchLatestRelease();
      if (!release || !isNewer(release.version, APP_VERSION)) {
        set({ status: "latest", release });
        return;
      }
      const skipped = localStorage.getItem(SKIP_KEY) === release.version;
      set({
        status: "available",
        release,
        promptOpen: manual || !skipped,
      });
    } catch (e) {
      set({ status: "error", error: (e as Error).message });
    }
  },

  async install() {
    const release = get().release!;
    set({ status: "installing", percent: null, error: null });
    try {
      await installRelease(release, (e) => {
        if (e.kind === "progress") set({ percent: e.percent });
        if (e.kind === "needs-permission") set({ status: "needs-permission" });
        if (e.kind === "handed-off") set({ status: "handed-off" });
      });
    } catch (e) {
      set({ status: "error", error: (e as Error).message });
    }
  },

  later() {
    set({ promptOpen: false });
  },

  skip() {
    localStorage.setItem(SKIP_KEY, get().release!.version);
    set({ promptOpen: false });
  },
}));
