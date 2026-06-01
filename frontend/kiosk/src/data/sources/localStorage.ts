import { StationRepositoryImpl } from "../repositories/StationRepositoryImpl";

export let STATION_ID = new URLSearchParams(window.location.search).get('stationId') ||
  localStorage.getItem('kiosk-station-id') ||
  import.meta.env.VITE_STATION_ID ||
  '55555555-0000-4000-8000-000000000168';

export let POINT_ID = new URLSearchParams(window.location.search).get('pointId') ||
  localStorage.getItem('kiosk-point-id') ||
  import.meta.env.VITE_POINT_ID ||
  '';

export let CHARGER_ID = new URLSearchParams(window.location.search).get('chargerId') ||
  localStorage.getItem('kiosk-charger-id') ||
  import.meta.env.VITE_CHARGER_ID ||
  '';

export function setStationId(id: string) {
  STATION_ID = id;
  localStorage.setItem('kiosk-station-id', id);
}

export function setChargerId(id: string, pointId?: string) {
  CHARGER_ID = id;
  localStorage.setItem('kiosk-charger-id', id);
  if (pointId) {
    POINT_ID = pointId;
    localStorage.setItem('kiosk-point-id', pointId);
  }
}

export function resetKioskIdentifiers() {
  localStorage.removeItem('kiosk-station-id');
  localStorage.removeItem('kiosk-point-id');
  localStorage.removeItem('kiosk-charger-id');
}

export async function resolveKioskIdentifiers(): Promise<{ stationId: string; pointId: string; chargerId: string }> {
  try {
    const stationRepo = new StationRepositoryImpl();
    const chargers = await stationRepo.getStationChargers(STATION_ID);

    let isValid = false;
    let firstPointId = '';
    let firstChargerId = '';

    for (const charger of chargers) {
      if (charger.connectors) {
        for (const conn of charger.connectors) {
          if (!firstChargerId) {
            firstPointId = charger.id;
            firstChargerId = conn.id;
          }
          if (conn.id === CHARGER_ID) {
            isValid = true;
            break;
          }
        }
      }
      if (isValid) break;
    }

    // If currently selected charger doesn't exist on this station, self-heal to first available connector
    if ((!CHARGER_ID || !isValid) && firstChargerId) {
      console.log('[Kiosk] Stale or unassigned charger ID. Auto-resolving first connector of this station:', firstChargerId);
      setChargerId(firstChargerId, firstPointId);
    }
  } catch (err) {
    console.warn('[Kiosk] Could not validate or resolve identifiers against station chargers:', err);
  }

  return { stationId: STATION_ID, pointId: POINT_ID, chargerId: CHARGER_ID };
}
