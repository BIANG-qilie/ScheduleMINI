import { useEffect } from "react";
import { SettingsPage } from "@/pages/SettingsPage";
import { WidgetPage } from "@/pages/WidgetPage";
import { resolveView } from "@/lib/windows";

export default function App() {
  const view = resolveView();

  useEffect(() => {
    document.body.classList.toggle("widget-body", view === "widget");
    document.title = "小日程";
  }, [view]);

  if (view === "widget") {
    return <WidgetPage />;
  }
  return <SettingsPage />;
}
