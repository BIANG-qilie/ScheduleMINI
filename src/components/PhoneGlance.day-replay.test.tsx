/** @vitest-environment jsdom */
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PhoneGlance } from "@/components/PhoneGlance";
import { defaultCouple } from "@/lib/config";
import { on26 } from "@/lib/day-replay.fixtures";
import { useConfigStore } from "@/store/config-store";

const ENTRY_LABEL = "根据手机记录补今天";
const couple = defaultCouple();

vi.mock("@/lib/day-replay-native", () => ({
  dayReplayBridge: () => ({
    readToday: () =>
      JSON.stringify({
        ok: true,
        queryTime: on26(18, 0),
        events: [],
        calls: [],
      }),
  }),
  hasDayReplayBridge: () => true,
}));

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  useConfigStore.setState({
    config: {
      ...useConfigStore.getState().config,
      items: [],
      soloMode: true,
      showHolidays: false,
    },
  });
});

describe("PhoneGlance day replay entry", () => {
  it("puts the text line under the greeting inside now-hero", () => {
    render(
      <PhoneGlance
        couple={couple}
        soloMode
        showHolidays={false}
        onReplayCommit={() => undefined}
      />,
    );
    const hero = document.querySelector(".now-hero");
    expect(hero).toBeTruthy();
    const entry = within(hero as HTMLElement).getByRole("button", {
      name: ENTRY_LABEL,
    });
    expect(entry.className).toContain("now-replay-link");
    expect(screen.queryByRole("button", { name: "补今天" })).toBeNull();
  });

  it("hides the entry when there is no commit handler (no bridge path from parent)", () => {
    render(
      <PhoneGlance couple={couple} soloMode showHolidays={false} />,
    );
    expect(screen.queryByRole("button", { name: ENTRY_LABEL })).toBeNull();
  });
});
