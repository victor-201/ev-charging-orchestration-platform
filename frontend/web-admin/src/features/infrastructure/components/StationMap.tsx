'use client';

import { useEffect, useRef, useState } from 'react';
import i18next from '@/i18n/index';
import 'leaflet/dist/leaflet.css';

type Station = {
  id: string; name: string; address: string; status: string;
  latitude: number; longitude: number; availableChargers: number; totalChargers: number;
};

const STATUS_PALETTE: Record<string, { glow: string; bar: string; text: string }> = {
  active:      { glow: '#22c55e55', bar: '#22c55e', text: '#22c55e' },
  maintenance: { glow: '#f59e0b55', bar: '#f59e0b', text: '#f59e0b' },
  inactive:    { glow: '#6b728055', bar: '#6b7280', text: '#9ca3af' },
  closed:      { glow: '#ef444455', bar: '#ef4444', text: '#ef4444' },
};

function resolvePin(station: Station) {
  const st = station.status.toLowerCase();
  if (st === 'closed') {
    return {
      gradientA: '#ef4444', gradientB: '#dc2626',
      shadow: 'rgba(239,68,68,0.5)',
      icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`,
      label: 'CLOSE',
    };
  }
  if (st === 'maintenance') {
    return {
      gradientA: '#f59e0b', gradientB: '#d97706',
      shadow: 'rgba(245,158,11,0.5)',
      icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>`,
      label: 'MAINT',
    };
  }
  if (st === 'inactive') {
    return {
      gradientA: '#6b7280', gradientB: '#4b5563',
      shadow: 'rgba(107,114,128,0.5)',
      icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18.36 6.64A9 9 0 0 1 20.77 15"/><path d="M6.16 6.16a9 9 0 0 0 12.68 12.68"/><path d="M12 2v4"/><path d="m2 2 20 20"/></svg>`,
      label: 'INACT',
    };
  }

  const total = station.totalChargers;
  const available = station.availableChargers;
  const inUse = total - available;

  if (total === 0 || available === 0) {
    return {
      gradientA: '#f97316', gradientB: '#ea580c',
      shadow: 'rgba(249,115,22,0.5)',
      icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="2" width="10" height="20" rx="2"/><path d="M12 18h.01"/></svg>`,
      label: `${total}/${total}`,
    };
  }

  return {
    gradientA: '#22c55e', gradientB: '#16a34a',
    shadow: 'rgba(34,197,94,0.5)',
    icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="2" width="10" height="20" rx="2"/><path d="M12 18h.01"/></svg>`,
    label: `${inUse}/${total}`,
  };
}

function buildTeardropSvg(pin: ReturnType<typeof resolvePin>, isSelected: boolean) {
  const w = 46;
  const h = 63;
  const bodyR = 20;
  const cx = w / 2;
  const cy = bodyR + 2;
  const tipY = h - 3;
  const strokeW = isSelected ? 2.5 : 1.5;
  const strokeCol = isSelected ? '#ffffff' : 'rgba(255,255,255,0.3)';

  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${pin.gradientA}"/>
        <stop offset="100%" stop-color="${pin.gradientB}"/>
      </linearGradient>
      <filter id="s">
        <feDropShadow dx="0" dy="2" stdDeviation="${isSelected ? 4 : 2}" flood-color="${pin.shadow}"/>
      </filter>
    </defs>
    <path d="M${cx},${tipY} C${cx + 12},${cy + 10} ${w - 2},${cy + 5} ${w - 2},${cy} A${bodyR},${bodyR} 0 1,0 ${2},${cy} C${2},${cy + 5} ${cx - 12},${cy + 10} ${cx},${tipY}Z"
      fill="url(#g)" stroke="${strokeCol}" stroke-width="${strokeW}" filter="url(#s)"/>
  </svg>`;
}

export default function StationMap({ 
  stations,
  editingStationId,
  onCoordinatesChange
}: { 
  stations: Station[];
  editingStationId?: string;
  onCoordinatesChange?: (lat: number, lng: number) => void;
}) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<ReturnType<typeof import('leaflet')['map']> | null>(null);
  const markersGroupRef = useRef<any>(null);
  const tileLayerRef = useRef<any>(null);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [mapReady, setMapReady] = useState(false);
  const mountedRef = useRef(true);

  // Track map camera and popups to prevent lag and infinite snaps
  const lastFitStationIds = useRef<string>('');
  const hasShownEditPopupRef = useRef<Record<string, boolean>>({});

  // Detect Theme Changes
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const initialTheme = (document.documentElement.getAttribute('data-theme') || 'dark') as 'dark' | 'light';
    setTheme(initialTheme);

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.attributeName === 'data-theme') {
          const nextTheme = (document.documentElement.getAttribute('data-theme') || 'dark') as 'dark' | 'light';
          setTheme(nextTheme);
        }
      });
    });

    observer.observe(document.documentElement, { attributes: true });
    return () => observer.disconnect();
  }, []);

  // Initialize Map
  useEffect(() => {
    mountedRef.current = true;
    if (!mapRef.current || mapInstance.current) return;

    import('leaflet').then((L) => {
      if (!mountedRef.current || !mapRef.current || (mapRef.current as any)._leaflet_id) {
        return;
      }

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

      L.control.zoom({ position: 'bottomright' }).addTo(map);

      markersGroupRef.current = L.layerGroup().addTo(map);
      mapInstance.current = map;
      setMapReady(true);
    });

    return () => {
      mountedRef.current = false;
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
        setMapReady(false);
      }
    };
  }, []);

  // Update Tile Layer dynamically when theme changes or map becomes ready
  useEffect(() => {
    if (!mapInstance.current || !mapReady) return;

    if (tileLayerRef.current) {
      mapInstance.current.removeLayer(tileLayerRef.current);
    }

    import('leaflet').then((L) => {
      if (!mountedRef.current || !mapInstance.current) return;

      const tileUrl = theme === 'light'
        ? 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
        : 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';

      tileLayerRef.current = L.tileLayer(tileUrl, {
        attribution: '© CartoDB',
        maxZoom: 19,
        subdomains: 'abcd',
      }).addTo(mapInstance.current!);
    });
  }, [theme, mapReady]);

  // Update Markers when stations change or map becomes ready
  useEffect(() => {
    if (!mapInstance.current || !markersGroupRef.current || !mapReady) return;

    import('leaflet').then((L) => {
      if (!mountedRef.current || !mapInstance.current || !markersGroupRef.current) return;

      markersGroupRef.current.clearLayers();
      const bounds: [number, number][] = [];

      stations.forEach((s) => {
        if (!s) return;
        const pin = resolvePin(s);
        const palette = STATUS_PALETTE[s.status.toLowerCase()] || STATUS_PALETTE.inactive;
        const isEditing = editingStationId === s.id;

        const markerSvg = buildTeardropSvg(pin, isEditing);

        const containerHtml = `
          <div class="ev-pin" style="cursor:pointer;width:46px;height:63px;position:relative;">
            ${markerSvg}
            <div style="position:absolute;top:5px;left:0;right:0;display:flex;flex-direction:column;align-items:center;justify-content:center;pointer-events:none;">
              ${pin.icon}
              <span style="color:white;font-weight:900;font-size:9px;letter-spacing:-0.3px;line-height:1;margin-top:1px;">${pin.label}</span>
            </div>
          </div>
        `;

        // Precise anchoring: pin height is 63px, tip is mathematically at tipY (60px)
        const icon = L.divIcon({
          className: '',
          html: containerHtml,
          iconSize: [46, 63],
          iconAnchor: [23, 60],
        });

        bounds.push([s.latitude, s.longitude]);

        const marker = L.marker([s.latitude, s.longitude], { 
          icon,
          draggable: isEditing 
        }).addTo(markersGroupRef.current);

        if (isEditing) {
          if (onCoordinatesChange) {
            marker.on('dragend', (event: any) => {
              const position = event.target.getLatLng();
              onCoordinatesChange(position.lat, position.lng);
            });
          }

          marker.bindPopup(`
            <div style="font-family:Inter,sans-serif;padding:6px;min-width:180px;text-align:center;color:var(--text-main);">
              <p style="font-weight:700;color:var(--text-main);font-size:12px;margin:0 0 4px;">Chế độ chỉnh sửa ghim</p>
              <p style="color:#10bfc9;font-weight:600;font-size:10px;margin:0;line-height:1.4;">Kéo thả ghim đến vị trí mới và nhấn Lưu thay đổi!</p>
            </div>
          `, { closeButton: false });

          // Only open popup automatically once to prevent blocking subsequent drags
          if (!hasShownEditPopupRef.current[s.id]) {
            marker.openPopup();
            hasShownEditPopupRef.current[s.id] = true;
          }
        } else {
          // Clear edit popup flag if we exit editing
          if (hasShownEditPopupRef.current[s.id]) {
            delete hasShownEditPopupRef.current[s.id];
          }

          marker.bindPopup(`
            <div style="font-family:Inter,sans-serif;padding:8px;min-width:200px;color:var(--text-main);">
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
                <span style="display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:8px;background:${palette.bar}22;border:1px solid ${palette.bar};">
                  ${pin.icon}
                </span>
                <div>
                  <p style="font-weight:700;color:var(--text-main);font-size:13px;margin:0;">${s.name}</p>
                  <p style="color:var(--text-faded);font-size:10px;margin:0;">${s.address}</p>
                </div>
              </div>
              <div style="display:flex;gap:8px;flex-wrap:wrap;">
                <span style="font-size:10px;font-weight:700;text-transform:uppercase;color:${palette.bar};padding:2px 8px;border-radius:4px;background:${palette.bar}15;">${pin.label}</span>
                <span style="font-size:10px;color:var(--text-faded);">Sẵn sàng: ${s.availableChargers}/${s.totalChargers}</span>
              </div>
            </div>
          `, {
            className: 'ev-popup',
            maxWidth: 260,
          });
        }
      });

      // Fit bounds only if station list actually changed and we are NOT in editing mode
      const stationIdsStr = stations.map(s => s ? s.id : '').join(',');
      if (bounds.length > 0 && lastFitStationIds.current !== stationIdsStr && !editingStationId) {
        mapInstance.current!.fitBounds(L.latLngBounds(bounds), { padding: [50, 50] });
        lastFitStationIds.current = stationIdsStr;
      }
    });
  }, [stations, mapReady, editingStationId, onCoordinatesChange]);

  return (
    <>
      <style>{`
        .leaflet-container { background: var(--bg-color) !important; border-radius: 20px; }
        .leaflet-popup-content-wrapper { background: var(--card-bg) !important; border: 1.5px solid var(--card-border) !important; border-radius: 12px !important; color: var(--text-main) !important; box-shadow: var(--card-shadow) !important; backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); }
        .leaflet-popup-tip { background: var(--card-bg) !important; }
        .leaflet-popup-close-button { color: var(--text-faded) !important; }
      `}</style>
      <div ref={mapRef} style={{ width: '100%', height: '100%', borderRadius: '20px' }} />
    </>
  );
}
