/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string;
  readonly VITE_WS_URL: string;
  readonly VITE_STATION_ID: string;
  readonly VITE_POINT_ID?: string;
  readonly VITE_CHARGER_ID?: string;
  readonly VITE_KIOSK_API_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
