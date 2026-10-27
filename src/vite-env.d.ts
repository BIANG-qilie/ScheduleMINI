/// <reference types="vite/client" />

declare const __APP_VERSION__: string;

interface Window {
  __scheduleOpenNow?: () => void;
  SmWidget?: {
    notifyScheduleChanged?: () => void;
    consumeOpenNow?: () => boolean;
  };
  SmDayReplay?: {
    readDay?: (dayOffset: number) => string;
    readToday?: () => string;
    requestAccess?: () => void;
  };
}
