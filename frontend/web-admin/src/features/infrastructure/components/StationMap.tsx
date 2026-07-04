'use client';

import { useEffect, useRef, useState } from 'react';
import i18next from '@/i18n/index';

// NOTE: Leaflet CSS is injected at runtime (not statically imported) to avoid
// Turbopack/Next.js CSS parser errors caused by the legacy IE `filter: progid:...`
// syntax in leaflet/dist/leaflet.css line 538.
function injectLeafletCss() {
  if (typeof document === 'undefined') return;
  const id = 'leaflet-css';
  if (document.getElementById(id)) return;
  const link = document.createElement('link');
  link.id = id;
  link.rel = 'stylesheet';
  link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
  link.integrity = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=';
  link.crossOrigin = '';
  document.head.appendChild(link);
}

type Station = {
  id: string; name: string; address: string; status: string;
  latitude: number; longitude: number; availableChargers: number; totalChargers: number;
};

function resolvePin(station: Station) {
  const st = station.status.toLowerCase();
  
  if (st === 'closed') {
    return {
      status: 'closed',
      color: '#4B5563', // Solid dark grey — Closed
      icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`,
      label: 'CLOSE',
    };
  }
  if (st === 'maintenance') {
    return {
      status: 'maintenance',
      color: '#F59E0B', // Solid amber — Under maintenance
      icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>`,
      label: 'MAINT',
    };
  }
  if (st === 'inactive') {
    return {
      status: 'inactive',
      color: '#9CA3AF', // Solid grey — Inactive
      icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18.36 6.64A9 9 0 0 1 20.77 15"/><path d="M6.16 6.16a9 9 0 0 0 12.68 12.68"/><path d="M12 2v4"/><path d="m2 2 20 20"/></svg>`,
      label: 'INACT',
    };
  }

  const total = station.totalChargers;
  const available = station.availableChargers;
  const inUse = total - available;

  const cyanHex = '#10BFC9';
  const limeHex = '#19BE4B';

  if (total === 0 || available === 0) {
    return {
      status: 'active_full',
      color: '#EF4444', // Solid danger red — Fully occupied
      icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="2" width="10" height="20" rx="2"/><path d="M12 18h.01"/></svg>`,
      label: `${total}/${total}`,
    };
  }

  if (available === total) {
    return {
      status: 'active_empty',
      color: limeHex,   // Solid lime — All slots available
      icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="2" width="10" height="20" rx="2"/><path d="M12 18h.01"/></svg>`,
      label: `0/${total}`,
    };
  }

  return {
    status: 'active_partial',
    color: cyanHex,   // Solid cyan — Some slots available
    icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="2" width="10" height="20" rx="2"/><path d="M12 18h.01"/></svg>`,
    label: `${inUse}/${total}`,
  };
}

function getStationMarkerSvg({
  status,
  text,
  isSelected = false,
}: {
  status: string;
  text: string;
  isSelected?: boolean;
}) {
  let gradientId = 'grad_inactive';
  let stop1 = '#9CA3AF';
  let stop2 = '#4B5563';

  const cyanHex = '#10BFC9';
  const limeHex = '#19BE4B';

  switch (status) {
    case 'closed':
      gradientId = 'grad_closed';
      stop1 = '#4B5563'; // Solid dark grey — Closed
      stop2 = '#4B5563';
      break;
    case 'active_full':
      gradientId = 'grad_active_full';
      stop1 = '#EF4444'; // Solid danger red — Fully occupied
      stop2 = '#EF4444';
      break;
    case 'active_empty':
      gradientId = 'grad_active_empty';
      stop1 = limeHex;   // Solid lime — All slots available
      stop2 = limeHex;
      break;
    case 'active_partial':
      gradientId = 'grad_active_partial';
      stop1 = cyanHex;   // Solid cyan — Some slots available
      stop2 = cyanHex;
      break;
    case 'maintenance':
      gradientId = 'grad_maint';
      stop1 = '#F59E0B'; // Solid amber — Under maintenance
      stop2 = '#F59E0B';
      break;
    case 'inactive':
    default:
      gradientId = 'grad_inactive';
      stop1 = '#9CA3AF'; // Solid grey — Inactive
      stop2 = '#9CA3AF';
      break;
  }

  // Determine font size
  let fontSize = text.length > 3 ? '10' : '14';
  if (text === 'CLOSE') fontSize = '12';
  if (text === 'MAINT') fontSize = '10';

  return `
<svg width="72" height="92" viewBox="-6 -6 72 92" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="${gradientId}" x1="30" y1="0" x2="30" y2="66" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="${stop1}"/>
      <stop offset="50%" stop-color="${stop1}"/>
      <stop offset="100%" stop-color="${stop2}"/>
    </linearGradient>
  </defs>
  <!-- Ambient Shadow for selected pin -->
  ${isSelected ? `<circle cx="30" cy="30" r="28" fill="${stop1}" fill-opacity="0.25"/>` : ''}
  <!-- Main Pin Body -->
  <path d="M30 80C30 80 60 52.4183 60 30C60 13.4315 46.5685 0 30 0C13.4315 0 0 13.4315 0 30C0 52.4183 30 80 30 80Z" fill="url(#${gradientId})"/>
  <!-- Highlight stroke when selected -->
  ${isSelected ? `<path d="M30 80C30 80 60 52.4183 60 30C60 13.4315 46.5685 0 30 0C13.4315 0 0 13.4315 0 30C0 52.4183 30 80 30 80Z" stroke="white" stroke-width="3" stroke-linecap="round"/>` : ''}
  <!-- Inner translucent circle -->
  <circle cx="30" cy="30" r="24" fill="white" fill-opacity="0.2"/>
  <!-- Decorative highlight ring -->
  <circle cx="30" cy="30" r="26" stroke="white" stroke-width="1.2" stroke-opacity="0.4"/>
  <!-- Charger Icon -->
  <rect x="23" y="16" width="10" height="16" rx="2" fill="white"/>
  <path d="M33 22H35C36.1046 22 37 22.8954 37 24V30C37 31.1046 36.1046 32 35 32H33" stroke="white" stroke-width="2.2" stroke-linecap="round"/>
  <!-- Text representation of availability/state -->
  <text x="30" y="55" text-anchor="middle" font-family="Inter, sans-serif" font-weight="bold" font-size="${fontSize}" fill="white">${text}</text>
</svg>
`;
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
    injectLeafletCss();
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
        const isEditing = editingStationId === s.id;

        const markerSvg = getStationMarkerSvg({
          status: pin.status,
          text: pin.label,
          isSelected: isEditing,
        });

        const containerHtml = `
          <div class="ev-pin" style="cursor:pointer;width:72px;height:92px;position:relative;">
            ${markerSvg}
          </div>
        `;

        // Precise anchoring: pin height is 92px, tip is mathematically at y = 86px, x = 36px
        const icon = L.divIcon({
          className: '',
          html: containerHtml,
          iconSize: [72, 92],
          iconAnchor: [36, 86],
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
                <span style="display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:8px;background:${pin.color}22;border:1px solid ${pin.color};">
                  ${pin.icon}
                </span>
                <div>
                  <p style="font-weight:700;color:var(--text-main);font-size:13px;margin:0;">${s.name}</p>
                  <p style="color:var(--text-faded);font-size:10px;margin:0;">${s.address}</p>
                </div>
              </div>
              <div style="display:flex;gap:8px;flex-wrap:wrap;">
                <span style="font-size:10px;font-weight:700;text-transform:uppercase;color:${pin.color};padding:2px 8px;border-radius:4px;background:${pin.color}15;">${pin.label}</span>
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
