'use client';

import { useEffect, useRef } from 'react';
import i18next from '@/i18n/index';

type Station = {
  id: string; name: string; address: string; status: string;
  latitude: number; longitude: number; availableChargers: number; totalChargers: number;
};

const STATUS_COLOR: Record<string, string> = {
  active: '#22c55e',
  maintenance: '#f59e0b',
  inactive: '#7d7d7d',
  closed: '#ef4444',
};

export default function StationMap({ stations }: { stations: Station[] }) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<ReturnType<typeof import('leaflet')['map']> | null>(null);

  const getStatusLabel = (status: string) => {
    const key = status.toUpperCase();
    switch(key) {
      case 'ACTIVE': return i18next.t('dashboard:data.status.ACTIVE');
      case 'MAINTENANCE': return i18next.t('dashboard:data.status.MAINTENANCE');
      case 'CLOSED':
      case 'INACTIVE': return i18next.t('dashboard:data.status.INACTIVE');
      default: return i18next.t(`dashboard:data.status.${key}`, { defaultValue: status });
    }
  };

  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;

    import('leaflet').then((L) => {
      delete (L.Icon.Default.prototype as { _getIconUrl?: () => void })._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });

      const map = L.map(mapRef.current!, {
        center: [10.8231, 106.6297],
        zoom: 12,
        zoomControl: false,
      });

      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '© CartoDB',
        maxZoom: 19,
      }).addTo(map);

      L.control.zoom({ position: 'bottomright' }).addTo(map);

      mapInstance.current = map;

      stations.forEach((s) => {
        const color = STATUS_COLOR[s.status] || '#7d7d7d';
        const statusLabel = getStatusLabel(s.status);
        const chargersLabel = i18next.t('dashboard:map.chargers_available', { available: s.availableChargers, total: s.totalChargers });
        
        const icon = L.divIcon({
          className: '',
          html: `
            <div style="
              width:36px; height:36px; border-radius:50%;
              background:${color}22; border:2px solid ${color};
              display:flex; align-items:center; justify-content:center;
              box-shadow: 0 0 12px ${color}55;
            ">
              <div style="width:10px;height:10px;border-radius:50%;background:${color};"></div>
            </div>
          `,
          iconSize: [36, 36],
          iconAnchor: [18, 18],
        });

        L.marker([s.latitude, s.longitude], { icon })
          .addTo(map)
          .bindPopup(`
            <div style="font-family:Inter,sans-serif;padding:8px;min-width:180px;">
              <p style="font-weight:700;color:#fff;font-size:13px;margin:0 0 4px">${s.name}</p>
              <p style="color:#b8b8b8;font-size:11px;margin:0 0 8px">${s.address}</p>
              <div style="display:flex;gap:12px;">
                <span style="font-size:11px;color:${color};text-transform:uppercase;">${statusLabel}</span>
                <span style="font-size:11px;color:#b8b8b8">${chargersLabel}</span>
              </div>
            </div>
          `, {
            className: 'ev-popup',
            maxWidth: 220,
          });
      });
    });

    return () => {
      mapInstance.current?.remove();
      mapInstance.current = null;
    };
  }, []);

  return (
    <>
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <style>{`
        .leaflet-container { background: #181818 !important; border-radius: 20px; }
        .leaflet-popup-content-wrapper { background: rgba(24,24,24,0.95) !important; border: 1px solid rgba(255,255,255,0.08) !important; border-radius: 12px !important; color: #fff; box-shadow: 0 8px 32px rgba(0,0,0,0.5) !important; }
        .leaflet-popup-tip { background: rgba(24,24,24,0.95) !important; }
        .leaflet-popup-close-button { color: #7d7d7d !important; }
      `}</style>
      <div ref={mapRef} style={{ width: '100%', height: '100%', borderRadius: '20px' }} />
    </>
  );
}
