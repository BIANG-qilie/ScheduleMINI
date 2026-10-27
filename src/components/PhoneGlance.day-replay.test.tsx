/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PhoneGlance } from "@/components/PhoneGlance";
import { defaultCouple } from "@/lib/config";
import { useConfigStore } from "@/store/config-store";

const couple = defaultCouple();

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
  it("does not put the replay trigger under the greeting", () => {
    render(<PhoneGlance couple={couple} soloMode showHolidays={false} />);
    const hero = document.querySelector(".now-hero");
    expect(hero).toBeTruthy();
    expect(screen.queryByRole("button", { name: /补日程|补今天/ })).toBeNull();
    expect(screen.queryByText(/根据手机记录/)).toBeNull();
  });
});
