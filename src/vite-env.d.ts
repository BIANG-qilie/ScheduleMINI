/// <reference types="vite/client" />

declare const __APP_VERSION__: string;

interface Window {
  __scheduleOpenNow?: () => void;
  SmWidget?: {
    notifyScheduleChanged?: () => void;
    consumeOpenNow?: () => boolean;
  };
  SmDayReplay?: {
    readToday?: () => string;
    requestAccess?: () => void;
  };
}
