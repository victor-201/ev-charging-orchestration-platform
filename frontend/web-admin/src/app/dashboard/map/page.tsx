/**
 * Station Map Page Component
 *
 * Renders the interactive geospatial map dashboard representing station locations,
 * charging capacity statistics, status filters, and real-time network statuses.
 */

'use client';

import { useQuery } from '@tanstack/react-query';
import apiClient from '@/services/api-client';
import { motion } from 'framer-motion';
import { Wifi, WifiOff, Plus, X, Zap, Info, MapPin, Filter, CheckCircle2, Edit, Trash2, Users, CheckCircle, Clock, AlertTriangle, Activity, BatteryCharging, Thermometer, Gauge, Timer, DollarSign } from 'lucide-react';
import Pagination from '@/core/components/ui/Pagination';
import CustomSelect from '@/core/components/ui/CustomSelect';
import dynamic from 'next/dynamic';
import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { cn } from '@/core/utils/cn';
import { toast } from 'sonner';
import { useAuthStore } from '@/features/auth/store/auth.store';
import { tSafe, translateMessage } from '@/i18n/formatter';
import { useTelemetrySocket } from '@/features/charging/hooks/useTelemetrySocket';

const StationMap = dynamic(() => import('@/features/infrastructure/components/StationMap'), { ssr: false });

type Connector = {
  id: string;
  connectorType: string;
  maxPowerKw: number | null;
};

type Charger = {
  id: string;
  stationId: string;
  name: string;
  externalId: string | null;
  maxPowerKw: number;
  status: string;
  connectors: Connector[];
};

type Station = {
  id: string; name: string; address: string; status: string;
  latitude: number; longitude: number; totalChargers: number; availableChargers: number;
  chargers?: Charger[];
};

// ─── LiveSessionPanel ──────────────────────────────────────────────────────────
// Renders active charging session info + latest telemetry for a charger in_use.
function LiveSessionPanel({ chargerId }: { chargerId: string; stationId: string }) {
  const { data: session, isLoading: sessionLoading, error: sessionError } = useQuery<any>({
    queryKey: ['active-session', chargerId],
    queryFn: async () => {
      const res = await apiClient.get(`/charging/charger/${chargerId}/active`);
      return res.data;
    },
    refetchInterval: 15_000,
    retry: false,
  });

  const [telemetryReading, setTelemetryReading] = useState<any>(null);
  const [energyKwh, setEnergyKwh] = useState<number | null>(null);
  const [amountDue, setAmountDue] = useState<number | null>(null);

  // Sync with session when it loads/changes
  useEffect(() => {
    if (session) {
      setEnergyKwh(session.energyKwh);
      setAmountDue(session.amountDue);
    }
  }, [session]);

  const { data: telemetryData, isLoading: telLoading } = useQuery<any>({
    queryKey: ['session-telemetry', session?.id],
    queryFn: async () => {
      const res = await apiClient.get(`/charging/telemetry/${session.id}`);
      return res.data;
    },
    enabled: !!session?.id,
    retry: false,
  });

  // Seed initial telemetry
  useEffect(() => {
    if (telemetryData?.readings?.[0]) {
      setTelemetryReading(telemetryData.readings[0]);
    }
  }, [telemetryData]);

  // Hook up useTelemetrySocket for live updates
  useTelemetrySocket({
    sessionId: session?.id || null,
    enabled: !!session?.id,
    onTelemetry: useCallback((newReading: any) => {
      setTelemetryReading(newReading);
      if (session && newReading.meterWh != null) {
        const startMeter = Number(session.startMeterWh ?? 0);
        const currentEnergy = Math.max(0, (newReading.meterWh - startMeter) / 1000);
        setEnergyKwh(currentEnergy);

        const initialEnergy = Number(session.energyKwh ?? 0);
        const initialCost = Number(session.amountDue ?? 0);
        const pricePerKwh = initialEnergy > 0 ? (initialCost / initialEnergy) : 3500;
        setAmountDue(currentEnergy * pricePerKwh);
      }
    }, [session]),
  });

  const elapsedMinutes = session?.startTime
    ? Math.floor((Date.now() - new Date(session.startTime).getTime()) / 60000)
    : null;
  const elapsedStr = elapsedMinutes !== null
    ? elapsedMinutes >= 60
      ? `${Math.floor(elapsedMinutes / 60)}h ${elapsedMinutes % 60}ph`
      : `${elapsedMinutes} phút`
    : null;

  const latestReading = telemetryReading;

  if (sessionLoading) {
    return (
      <div className="mt-3 pt-3 border-t border-cyan/10">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-1.5 h-1.5 rounded-full bg-cyan animate-pulse" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-cyan">Phiên sạc đang chạy</span>
        </div>
        <div className="space-y-2">
          {[1,2,3].map(i => <div key={i} className="h-5 rounded-lg bg-white/5 animate-pulse" />)}
        </div>
      </div>
    );
  }

  if (sessionError || !session) {
    return (
      <div className="mt-3 pt-3 border-t border-white/10 flex items-center gap-2 text-text-muted">
        <Activity className="w-3.5 h-3.5" />
        <span className="text-[11px]">Không tìm thấy phiên sạc nào đang hoạt động.</span>
      </div>
    );
  }

  return (
    <div className="mt-1 pt-3 border-t border-cyan/20 space-y-3">
      {/* Section header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-cyan animate-pulse" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-cyan">Phiên sạc đang chạy</span>
        </div>
        <span className="text-[9px] font-mono text-slate-400 dark:text-slate-500 truncate max-w-[140px]" title={session.id}>
          #{session.id.slice(0, 8)}…
        </span>
      </div>

      {/* Session info grid */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-cyan/5 border border-cyan/15 rounded-xl p-2 flex flex-col items-center gap-0.5 text-center">
          <Timer className="w-3.5 h-3.5 text-cyan" />
          <span className="text-[11px] font-bold text-slate-900 dark:text-white">{elapsedStr ?? '--'}</span>
          <span className="text-[9px] text-slate-400 uppercase tracking-wide">Thời gian</span>
        </div>
        <div className="bg-cyan/5 border border-cyan/15 rounded-xl p-2 flex flex-col items-center gap-0.5 text-center">
          <BatteryCharging className="w-3.5 h-3.5 text-cyan" />
          <span className="text-[11px] font-bold text-slate-900 dark:text-white">
            {energyKwh != null ? `${Number(energyKwh).toFixed(2)} kWh` : '--'}
          </span>
          <span className="text-[9px] text-slate-400 uppercase tracking-wide">Năng lượng</span>
        </div>
        <div className="bg-cyan/5 border border-cyan/15 rounded-xl p-2 flex flex-col items-center gap-0.5 text-center">
          <Zap className="w-3.5 h-3.5 text-cyan" />
          <span className="text-[11px] font-bold text-slate-900 dark:text-white">
            {amountDue != null ? `${Number(amountDue).toLocaleString('vi-VN')}₫` : '--'}
          </span>
          <span className="text-[9px] text-slate-400 uppercase tracking-wide">Tạm tính</span>
        </div>
      </div>

      {/* Telemetry readings */}
      {latestReading ? (
        <div className="space-y-1.5">
          <p className="text-[9px] text-slate-400 uppercase tracking-wider font-semibold">Telemetry thời gian thực</p>
          <div className="grid grid-cols-2 gap-1.5">
            {latestReading.powerKw != null && (
              <div className="flex items-center gap-1.5 bg-white/[0.04] dark:bg-white/[0.03] border border-white/8 rounded-lg px-2.5 py-1.5">
                <Gauge className="w-3 h-3 text-cyan shrink-0" />
                <span className="text-[10px] text-slate-400">Công suất:</span>
                <span className="ml-auto text-[10px] font-bold text-cyan">{Number(latestReading.powerKw).toFixed(1)} kW</span>
              </div>
            )}
            {latestReading.voltageV != null && (
              <div className="flex items-center gap-1.5 bg-white/[0.04] dark:bg-white/[0.03] border border-white/8 rounded-lg px-2.5 py-1.5">
                <Activity className="w-3 h-3 text-warning shrink-0" />
                <span className="text-[10px] text-slate-400">Hiệu điện thế:</span>
                <span className="ml-auto text-[10px] font-bold text-warning">{Number(latestReading.voltageV).toFixed(0)} V</span>
              </div>
            )}
            {latestReading.currentA != null && (
              <div className="flex items-center gap-1.5 bg-white/[0.04] dark:bg-white/[0.03] border border-white/8 rounded-lg px-2.5 py-1.5">
                <Zap className="w-3 h-3 text-yellow-400 shrink-0" />
                <span className="text-[10px] text-slate-400">Dòng điện:</span>
                <span className="ml-auto text-[10px] font-bold text-yellow-400">{Number(latestReading.currentA).toFixed(1)} A</span>
              </div>
            )}
            {latestReading.socPercent != null && (
              <div className="flex items-center gap-1.5 bg-white/[0.04] dark:bg-white/[0.03] border border-white/8 rounded-lg px-2.5 py-1.5">
                <BatteryCharging className="w-3 h-3 text-success shrink-0" />
                <span className="text-[10px] text-slate-400">Pin (SoC):</span>
                <span className="ml-auto text-[10px] font-bold text-success">{latestReading.socPercent}%</span>
              </div>
            )}
            {latestReading.temperatureC != null && (
              <div className="flex items-center gap-1.5 bg-white/[0.04] dark:bg-white/[0.03] border border-white/8 rounded-lg px-2.5 py-1.5">
                <Thermometer className="w-3 h-3 text-danger shrink-0" />
                <span className="text-[10px] text-slate-400">Nhiệt độ:</span>
                <span className={cn("ml-auto text-[10px] font-bold", latestReading.temperatureC > 60 ? 'text-danger' : 'text-text-main')}>
                  {Number(latestReading.temperatureC).toFixed(1)}°C
                </span>
              </div>
            )}
            <div className="flex items-center gap-1.5 bg-white/[0.04] dark:bg-white/[0.03] border border-white/8 rounded-lg px-2.5 py-1.5">
              <Clock className="w-3 h-3 text-slate-400 shrink-0" />
              <span className="text-[10px] text-slate-400">Cập nhật:</span>
              <span className="ml-auto text-[10px] font-mono text-slate-400">
                {new Date(latestReading.recordedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            </div>
          </div>
        </div>
      ) : telLoading ? (
        <div className="space-y-1">
          {[1,2].map(i => <div key={i} className="h-7 rounded-lg bg-white/5 animate-pulse" />)}
        </div>
      ) : (
        <p className="text-[11px] text-slate-400 italic">Chưa có dữ liệu telemetry cho phiên này.</p>
      )}
    </div>
  );
}

export default function MapPage() {
  const { user } = useAuthStore();
  const isAdmin = user?.roles?.includes('admin');
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const renderPortal = (content: React.ReactNode) => {
    if (!mounted || typeof document === 'undefined') return null;
    return createPortal(content, document.body);
  };

  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [connectorType, setConnectorType] = useState('');
  const [page, setPage] = useState(1);
  const LIMIT = 20;
  const [selectedStation, setSelectedStation] = useState<Station | null>(null);
  const { t } = useTranslation(['dashboard', 'common']);

  // Fetch my staff profile to get the assigned stationId
  const { data: staffProfileData } = useQuery<any>({
    queryKey: ['my-staff-profile-map', user?.id],
    queryFn: async () => {
      if (!user || isAdmin) return null;
      const res = await apiClient.get('/staff');
      const items = res.data?.items || res.data || [];
      return items[0] || null;
    },
    enabled: !!user && !isAdmin,
  });

  const staffStationId = staffProfileData?.stationId || null;

  const staffStationIds: string[] = !isAdmin
    ? (staffStationId ? [staffStationId] : [])
    : (user?.stationIds?.length
      ? user.stationIds
      : user?.stationId
        ? [user.stationId]
        : []);

  const assignedStationId = staffStationIds[0] || null;

  // Load my attendance history to track status
  const { data: attendanceData, refetch: refetchAttendance } = useQuery({
    queryKey: ['my-attendance-map', user?.id],
    queryFn: async () => {
      if (!user || isAdmin) return null;
      const res = await apiClient.get('/attendance');
      const items = res.data?.items || res.data || [];
      return Array.isArray(items) ? items.map((item: any) => ({
        ...item,
        checkIn: item.checkIn || item.checkInTime,
        checkInTime: item.checkInTime || item.checkIn,
        checkOut: item.checkOut || item.checkOutTime,
        checkOutTime: item.checkOutTime || item.checkOut,
      })) : [];
    },
    enabled: !!user && !isAdmin,
  });

  const todayStr = new Date().toISOString().split('T')[0];
  const myTodayAttendance = Array.isArray(attendanceData)
    ? attendanceData.find((a: any) => {
        const isMe = a.userId === user?.id;
        const isToday = a.checkInTime && a.checkInTime.startsWith(todayStr);
        return isMe && isToday;
      })
    : null;

  // Attendance Check-in / Check-out handlers using navigator.geolocation
  const handleCheckIn = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      toast.error(tSafe('common:gps.not_supported', 'Trình duyệt không hỗ trợ định vị GPS!'));
      return;
    }
    
    toast.info(tSafe('common:gps.fetching', 'Đang lấy tọa độ GPS của bạn...'));
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          await apiClient.post('/attendance/check-in', {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            stationId: assignedStationId,
          });
          toast.success(tSafe('dashboard:home.checkin.checkin_success', 'Điểm danh Check-in trạm thành công!'));
          refetchAttendance();
        } catch (err: any) {
          const data = err?.response?.data;
          const errMsg = data?.message;
          const errStr = Array.isArray(errMsg) ? errMsg.join('; ') : (errMsg || '');
          console.error('[Check-in error]', JSON.stringify(data));
          if (/latitude|longitude|tọa độ|coordinates/i.test(errStr)) {
            toast.error(tSafe('dashboard:home.checkin.out_of_range', 'Bạn cần đến trạm để thực hiện thao tác (GPS hiện tại ngoài phạm vi)'));
          } else {
            toast.error(translateMessage(errStr, 'dashboard:home.checkin.checkin_failed'));
          }
        }
      },
      (err) => {
        toast.error(tSafe('common:gps.permission_denied', 'Vui lòng cấp quyền truy cập GPS để điểm danh trạm sạc!'));
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleCheckOut = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      toast.error(tSafe('common:gps.not_supported', 'Trình duyệt không hỗ trợ định vị GPS!'));
      return;
    }
    
    toast.info(tSafe('common:gps.fetching', 'Đang lấy tọa độ GPS của bạn...'));
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          await apiClient.post('/attendance/check-out', {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
          });
          toast.success(tSafe('dashboard:home.checkin.checkout_success', 'Điểm danh Check-out trạm thành công!'));
          refetchAttendance();
        } catch (err: any) {
          const data = err?.response?.data;
          const errMsg = data?.message;
          const errStr = Array.isArray(errMsg) ? errMsg.join('; ') : (errMsg || '');
          console.error('[Check-out error]', JSON.stringify(data));
          if (/latitude|longitude|tọa độ|coordinates/i.test(errStr)) {
            toast.error(tSafe('dashboard:home.checkin.out_of_range', 'Bạn cần đến trạm để thực hiện thao tác (GPS hiện tại ngoài phạm vi)'));
          } else {
            toast.error(translateMessage(errStr, 'dashboard:home.checkin.checkout_failed'));
          }
        }
      },
      (err) => {
        toast.error(tSafe('common:gps.permission_denied', 'Vui lòng cấp quyền truy cập GPS để điểm danh trạm sạc!'));
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  // Incident Reporting states & handlers
  const [isReportIncidentModalOpen, setIsReportIncidentModalOpen] = useState(false);
  const [incidentChargerId, setIncidentChargerId] = useState('');
  const [incidentSeverity, setIncidentSeverity] = useState('medium');
  const [incidentDescription, setIncidentDescription] = useState('');
  const [isSubmittingIncident, setIsSubmittingIncident] = useState(false);

  const handleOpenReportIncidentModal = () => {
    setIncidentChargerId('');
    setIncidentSeverity('medium');
    setIncidentDescription('');
    setIsReportIncidentModalOpen(true);
  };

  const handleReportIncident = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStation) return;
    setIsSubmittingIncident(true);
    try {
      await apiClient.post('/stations/incidents', {
        stationId: selectedStation.id,
        chargerId: incidentChargerId || undefined,
        severity: incidentSeverity,
        description: incidentDescription,
      });
      toast.success(tSafe('dashboard:map.report_incident_success', 'Báo cáo sự cố trạm sạc cho Admin thành công!'));
      setIsReportIncidentModalOpen(false);
    } catch (err: any) {
      toast.error(translateMessage(err?.response?.data?.message, 'dashboard:map.report_incident_error'));
    } finally {
      setIsSubmittingIncident(false);
    }
  };

  // Fetch stations query
  const { data, isLoading, refetch } = useQuery<{ items: Station[]; total: number }>({
    queryKey: ['stations', statusFilter, search, connectorType, page, isAdmin, assignedStationId],
    queryFn: async () => {
      if (!isAdmin) {
        if (!assignedStationId) {
          return { items: [], total: 0 };
        }
        const res = await apiClient.get(`/stations/${assignedStationId}`);
        const stationDetail = res.data?.data || res.data;
        if (!stationDetail) {
          return { items: [], total: 0 };
        }
        return {
          items: [stationDetail],
          total: 1
        };
      }

      const params: Record<string, any> = { limit: LIMIT, offset: (page - 1) * LIMIT };
      if (statusFilter !== 'all') params.status = statusFilter;
      if (search.trim()) params.search = search.trim();
      if (connectorType) params.connectorType = connectorType;
      return (await apiClient.get('/stations', { params })).data;
    },
    refetchInterval: 60_000,
    enabled: isAdmin || staffProfileData !== undefined,
  });

  // Fetch cities list for station form
  const { data: citiesData } = useQuery<any[]>({
    queryKey: ['cities'],
    queryFn: async () => {
      const res = await apiClient.get('/stations/cities');
      return res.data?.data || res.data || [];
    }
  });

  const rawStations = data?.items ?? [];
  const stations = !isAdmin
    ? assignedStationId
      ? rawStations.filter((s) => staffStationIds.includes(s.id))
      : []
    : rawStations;

  const total = !isAdmin ? stations.length : (data?.total ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / LIMIT));
  const cities = citiesData || [];

  const resetPage = () => setPage(1);

  // Auto-select staff's station
  useEffect(() => {
    if (!isAdmin && assignedStationId && stations.length > 0 && !selectedStation) {
      const assigned = stations.find((s) => s.id === assignedStationId);
      if (assigned) {
        setSelectedStation(assigned);
      }
    }
  }, [assignedStationId, stations, isAdmin, selectedStation]);

  // Management states
  const [selectedChargerForDetails, setSelectedChargerForDetails] = useState<Charger | null>(null);
  const [isUpdatingChargerStatus, setIsUpdatingChargerStatus] = useState(false);
  const [isStatusEditOpen, setIsStatusEditOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingCharger, setEditingCharger] = useState<Charger | null>(null);

  // Form states
  const [chargerName, setChargerName] = useState('');
  const [chargerPower, setChargerPower] = useState(50);
  const [chargerConnector, setChargerConnector] = useState('CCS2');
  const [chargerStatus, setChargerStatus] = useState('available');
  const [chargerExternalId, setChargerExternalId] = useState('');

  // Station Management states
  const [isAddStationModalOpen, setIsAddStationModalOpen] = useState(false);
  const [isEditStationModalOpen, setIsEditStationModalOpen] = useState(false);

  // Pricing Modal states
  const [isPricingModalOpen, setIsPricingModalOpen] = useState(false);
  const [pricingRules, setPricingRules] = useState<any[]>([]);
  const [isLoadingPricing, setIsLoadingPricing] = useState(false);

  // Pricing Rule form states
  const [isRuleFormOpen, setIsRuleFormOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<any | null>(null);
  const [ruleConnectorType, setRuleConnectorType] = useState('CCS');
  const [ruleHourStart, setRuleHourStart] = useState<number | ''>('');
  const [ruleHourEnd, setRuleHourEnd] = useState<number | ''>('');
  const [rulePricePerKwh, setRulePricePerKwh] = useState(3500);
  const [ruleIdleFee, setRuleIdleFee] = useState(1000);
  const [ruleIdleGrace, setRuleIdleGrace] = useState(20);
  const [ruleLabel, setRuleLabel] = useState('');
  const [isSubmittingRule, setIsSubmittingRule] = useState(false);

  const fetchPricingRules = async (stationId: string) => {
    setIsLoadingPricing(true);
    try {
      const resp = await apiClient.get('/stations/pricing-rules', {
        params: { stationId, activeOnly: 'true' }
      });
      setPricingRules(resp.data);
    } catch (err) {
      console.error('Failed to fetch pricing rules:', err);
      toast.error('Không thể tải bảng giá của trạm');
    } finally {
      setIsLoadingPricing(false);
    }
  };

  const handleOpenAddRule = () => {
    setEditingRule(null);
    setRuleConnectorType('CCS');
    setRuleHourStart('');
    setRuleHourEnd('');
    setRulePricePerKwh(3500);
    setRuleIdleFee(1000);
    setRuleIdleGrace(20);
    setRuleLabel('');
    setIsRuleFormOpen(true);
  };

  const handleOpenEditRule = (rule: any) => {
    setEditingRule(rule);
    setRuleConnectorType(rule.connectorType || 'CCS');
    setRuleHourStart(rule.hourStart !== null ? rule.hourStart : '');
    setRuleHourEnd(rule.hourEnd !== null ? rule.hourEnd : '');
    setRulePricePerKwh(rule.pricePerKwh);
    setRuleIdleFee(rule.idleFeePerMinute);
    setRuleIdleGrace(rule.idleGraceMinutes);
    setRuleLabel(rule.label || '');
    setIsRuleFormOpen(true);
  };

  const handleSaveRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStation) return;
    setIsSubmittingRule(true);
    try {
      const payload: any = {
        stationId: selectedStation.id,
        connectorType: ruleConnectorType,
        validFrom: new Date().toISOString(),
        pricePerKwh: Number(rulePricePerKwh),
        idleGraceMinutes: Number(ruleIdleGrace),
        idleFeePerMinute: Number(ruleIdleFee),
        label: ruleLabel || undefined,
      };

      if (ruleHourStart !== '') payload.hourStart = Number(ruleHourStart);
      if (ruleHourEnd !== '') payload.hourEnd = Number(ruleHourEnd);

      if (editingRule) {
        await apiClient.patch(`/stations/pricing-rules/${editingRule.id}`, payload);
        toast.success('Cập nhật quy tắc giá thành công!');
      } else {
        await apiClient.post('/stations/pricing-rules', payload);
        toast.success('Thêm quy tắc giá mới thành công!');
      }
      setIsRuleFormOpen(false);
      fetchPricingRules(selectedStation.id);
    } catch (err: any) {
      console.error('Failed to save pricing rule:', err);
      toast.error(translateMessage(err?.response?.data?.message, 'Không thể lưu quy tắc giá'));
    } finally {
      setIsSubmittingRule(false);
    }
  };

  const handleDeactivateRule = async (ruleId: string) => {
    if (!selectedStation) return;
    if (!window.confirm('Bạn có chắc chắn muốn vô hiệu hóa quy tắc giá này không?')) return;
    try {
      await apiClient.patch(`/stations/pricing-rules/${ruleId}/deactivate`);
      toast.success('Đã vô hiệu hóa quy tắc giá');
      fetchPricingRules(selectedStation.id);
    } catch (err) {
      console.error('Failed to deactivate rule:', err);
      toast.error('Không thể vô hiệu hóa quy tắc giá');
    }
  };

  // Station Form states
  const [stationName, setStationName] = useState('');
  const [stationAddress, setStationAddress] = useState('');
  const [stationCityId, setStationCityId] = useState('');
  const [stationLat, setStationLat] = useState(21.028511);
  const [stationLng, setStationLng] = useState(105.804817);
  const [stationOwnerName, setStationOwnerName] = useState('');

  const [editingStationName, setEditingStationName] = useState('');
  const [editingStationAddress, setEditingStationAddress] = useState('');
  const [editingStationStatus, setEditingStationStatus] = useState('active');
  const [editingStationLat, setEditingStationLat] = useState(21.028511);
  const [editingStationLng, setEditingStationLng] = useState(105.804817);

  const handleOpenAddStationModal = () => {
    setStationName('');
    setStationAddress('');
    setStationCityId(cities[0]?.id || '');
    setStationLat(21.028511);
    setStationLng(105.804817);
    setStationOwnerName('');
    setIsAddStationModalOpen(true);
  };

  const handleOpenEditStationModal = () => {
    if (!selectedStation) return;
    setEditingStationName(selectedStation.name);
    setEditingStationAddress(selectedStation.address || '');
    setEditingStationStatus(selectedStation.status.toLowerCase());
    setEditingStationLat(selectedStation.latitude);
    setEditingStationLng(selectedStation.longitude);
    setIsEditStationModalOpen(true);
  };

  const handleAddStation = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        name: stationName,
        address: stationAddress || undefined,
        cityId: stationCityId,
        latitude: Number(stationLat),
        longitude: Number(stationLng),
        ownerName: stationOwnerName || undefined
      };
      const res = await apiClient.post('/stations', payload);
      const newStation = res.data?.data || res.data;
      setIsAddStationModalOpen(false);
      refetch();
      setSelectedStation(newStation);
      toast.success(tSafe('dashboard:map.add_station_success', 'Thêm trạm sạc mới thành công!'));
    } catch (error: any) {
      console.error(error);
      toast.error(translateMessage(error.response?.data?.message, 'dashboard:map.add_station_error'));
    }
  };

  const handleEditStation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStation) return;
    try {
      const payload = {
        name: editingStationName,
        address: editingStationAddress || undefined,
        status: editingStationStatus,
        latitude: Number(editingStationLat),
        longitude: Number(editingStationLng)
      };
      const res = await apiClient.patch(`/stations/${selectedStation.id}`, payload);
      const updated = res.data?.data || res.data;
      setSelectedStation({
        ...selectedStation,
        ...updated,
        latitude: Number(editingStationLat),
        longitude: Number(editingStationLng),
      });
      setIsEditStationModalOpen(false);
      refetch();
      toast.success(tSafe('dashboard:map.update_station_success', 'Cập nhật thông tin trạm sạc thành công!'));
    } catch (error: any) {
      console.error(error);
      const errMsg = error.response?.data?.message;
      const formattedMsg = Array.isArray(errMsg) ? errMsg.join(', ') : errMsg;
      toast.error(translateMessage(formattedMsg, 'dashboard:map.update_station_error'));
    }
  };

  const handleDeleteStation = async () => {
    if (!selectedStation) return;
    const confirmDelete = window.confirm(t('dashboard:map.confirm_delete_station', { name: selectedStation.name, defaultValue: `Bạn có chắc chắn muốn xóa trạm sạc "${selectedStation.name}" không? Thao tác này sẽ vô hiệu hóa trạm.` }));
    if (!confirmDelete) return;
    try {
      await apiClient.delete(`/stations/${selectedStation.id}`);
      setSelectedStation(null);
      refetch();
      toast.success(tSafe('dashboard:map.delete_station_success', 'Xóa trạm sạc thành công!'));
    } catch (error: any) {
      console.error(error);
      toast.error(translateMessage(error.response?.data?.message, 'dashboard:map.delete_station_error'));
    }
  };

  const handleOpenAddModal = () => {
    setChargerName('');
    setChargerPower(50);
    setChargerConnector('CCS2');
    setChargerExternalId('');
    setIsAddModalOpen(true);
  };

  // Admin-only: open the full edit form for a charger
  const handleOpenEditModal = (charger: Charger) => {
    setEditingCharger(charger);
    setChargerName(charger.name);
    const power = charger.maxPowerKw || Math.max(0, ...(charger.connectors?.map(c => c.maxPowerKw || 0) || [0]));
    setChargerPower(power);
    setChargerConnector(charger.connectors?.[0]?.connectorType || 'CCS2');
    setChargerStatus(charger.status.toLowerCase());
    setChargerExternalId(charger.externalId || '');
    setIsEditModalOpen(true);
  };

  const handleAddCharger = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStation) return;

    try {
      const payload = {
        name: chargerName,
        externalId: chargerExternalId || `CHG-${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
        maxPowerKw: Number(chargerPower),
        connectors: [
          {
            connectorType: chargerConnector,
            maxPowerKw: Number(chargerPower)
          }
        ]
      };

      const res = await apiClient.post(`/stations/${selectedStation.id}/chargers`, payload);
      const newCharger = res.data?.data || res.data;

      const updatedChargers = [...(selectedStation.chargers || []), {
        ...newCharger,
        status: 'available'
      }];

      setSelectedStation({
        ...selectedStation,
        chargers: updatedChargers
      });

      setIsAddModalOpen(false);
      toast.success(tSafe('dashboard:map.add_charger_success', 'Thêm trụ sạc mới thành công!'));
    } catch (error: any) {
      console.error(error);
      toast.error(translateMessage(error.response?.data?.message, 'dashboard:map.add_charger_error'));
    }
  };

  const handleEditCharger = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStation || !editingCharger) return;

    try {
      if (chargerStatus.toLowerCase() !== editingCharger.status.toLowerCase()) {
        await apiClient.patch(`/stations/${selectedStation.id}/chargers/${editingCharger.id}/status`, {
          status: chargerStatus.toLowerCase()
        });
      }

      const updatedChargers = (selectedStation.chargers || []).map(c => {
        if (c.id === editingCharger.id) {
          return {
            ...c,
            name: chargerName,
            maxPowerKw: Number(chargerPower),
            status: chargerStatus.toLowerCase(),
            connectors: [
              {
                id: c.connectors?.[0]?.id || 'conn-1',
                connectorType: chargerConnector,
                maxPowerKw: Number(chargerPower)
              }
            ]
          };
        }
        return c;
      });

      setSelectedStation({
        ...selectedStation,
        chargers: updatedChargers
      });

      setIsEditModalOpen(false);
      setEditingCharger(null);
      toast.success(tSafe('dashboard:map.update_charger_success', 'Cập nhật thông tin trụ sạc thành công!'));
    } catch (error: any) {
      console.error(error);
      toast.error(translateMessage(error.response?.data?.message, 'dashboard:map.update_charger_error'));
    }
  };

  const handleDeleteCharger = async (chargerId: string, name: string) => {
    if (!selectedStation) return;

    const confirmDelete = window.confirm(t('dashboard:map.confirm_delete_charger', { name, defaultValue: `Bạn có chắc chắn muốn xóa trụ sạc ${name} không?` }));
    if (!confirmDelete) return;

    try {
      await apiClient.delete(`/stations/${selectedStation.id}/chargers/${chargerId}`);
      const updatedChargers = (selectedStation.chargers || []).filter(c => c.id !== chargerId);
      setSelectedStation({
        ...selectedStation,
        chargers: updatedChargers
      });
      toast.success(tSafe('dashboard:map.delete_charger_success', `Xóa trụ sạc ${name} thành công!`).replace('{{name}}', name));
    } catch (error: any) {
      console.error(error);
      toast.error(tSafe('dashboard:map.delete_charger_error', 'Có lỗi xảy ra khi xóa trụ sạc.'));
    }
  };

  // Quick status update from the charger detail (info) modal — available to both admin and staff
  const handleUpdateChargerStatus = async (newStatus: string, newLabel: string) => {
    if (!selectedStation || !selectedChargerForDetails) return;
    const confirmed = window.confirm(
      t('dashboard:map.confirm_change_charger_status', {
        name: selectedChargerForDetails.name,
        status: newLabel,
        defaultValue: `Bạn có chắc chắn muốn đổi trạng thái trụ "${selectedChargerForDetails.name}" sang "${newLabel}" không?`
      })
    );
    if (!confirmed) return;
    setIsUpdatingChargerStatus(true);
    try {
      await apiClient.patch(`/stations/${selectedStation.id}/chargers/${selectedChargerForDetails.id}/status`, {
        status: newStatus.toLowerCase()
      });
      const updatedChargers = (selectedStation.chargers || []).map(c =>
        c.id === selectedChargerForDetails.id ? { ...c, status: newStatus.toLowerCase() } : c
      );
      const updatedCharger = { ...selectedChargerForDetails, status: newStatus.toLowerCase() };
      setSelectedStation({ ...selectedStation, chargers: updatedChargers });
      setSelectedChargerForDetails(updatedCharger);
      setIsStatusEditOpen(false);
      toast.success(tSafe('dashboard:map.update_charger_success', 'Cập nhật trạng thái trụ sạc thành công!'));
    } catch (error: any) {
      toast.error(translateMessage(error.response?.data?.message, 'dashboard:map.update_charger_error'));
    } finally {
      setIsUpdatingChargerStatus(false);
    }
  };

  const CHARGER_STATUS_STYLES: Record<string, {
    color: string;
    text: string;
    bg: string;
    border: string;
    dotBg: string;
    label: string;
  }> = {
    AVAILABLE: {
      color: 'var(--brand-success)',
      text: 'text-success',
      bg: 'bg-success/10',
      border: 'border-success/25',
      dotBg: 'bg-success',
      label: 'Sẵn sàng',
    },
    IN_USE: {
      color: 'var(--brand-cyan)',
      text: 'text-cyan',
      bg: 'bg-cyan/10',
      border: 'border-cyan/25',
      dotBg: 'bg-cyan',
      label: 'Đang sạc',
    },
    RESERVED: {
      color: 'var(--brand-warning)',
      text: 'text-warning',
      bg: 'bg-warning/10',
      border: 'border-warning/25',
      dotBg: 'bg-warning',
      label: 'Đã đặt',
    },
    OFFLINE: {
      color: 'var(--brand-muted)',
      text: 'text-text-muted',
      bg: 'bg-white/5',
      border: 'border-white/10',
      dotBg: 'bg-text-muted',
      label: 'Ngoại tuyến',
    },
    FAULTED: {
      color: 'var(--brand-danger)',
      text: 'text-danger',
      bg: 'bg-danger/10',
      border: 'border-danger/25',
      dotBg: 'bg-danger',
      label: 'Đang lỗi',
    },
  };

  const getChargerStyle = (status: string) => {
    const key = status.toUpperCase();
    return CHARGER_STATUS_STYLES[key] || {
      color: '#9e9e9e',
      text: 'text-[#9e9e9e]',
      bg: 'bg-[#9e9e9e]/10',
      border: 'border-[#9e9e9e]/25',
      dotBg: 'bg-[#9e9e9e]',
      label: status,
    };
  };

  const getStatusLabel = (status: string) => {
    const key = status.toUpperCase();
    switch(key) {
      case 'ACTIVE': return { label: t('dashboard:data.status.ACTIVE'), cls: 'badge-success' };
      case 'MAINTENANCE': return { label: t('dashboard:data.status.MAINTENANCE'), cls: 'badge-warning' };
      case 'CLOSED': 
      case 'INACTIVE': return { label: t('dashboard:data.status.INACTIVE'), cls: 'badge-danger' };
      default: return { label: t(`dashboard:data.status.${key}`, { defaultValue: status }), cls: 'badge-muted' };
    }
  };

  // Status action options for the info modal quick-change buttons
  const STATUS_ACTIONS = [
    { value: 'available', label: 'Sẵn sàng', border: 'border-success/30', textCls: 'text-success', bg: 'hover:bg-success/10' },
    { value: 'in_use', label: 'Đang sạc', border: 'border-cyan/30', textCls: 'text-cyan', bg: 'hover:bg-cyan/10' },
    { value: 'reserved', label: 'Đã đặt', border: 'border-warning/30', textCls: 'text-warning', bg: 'hover:bg-warning/10' },
    { value: 'offline', label: 'Ngoại tuyến', border: 'border-white/15', textCls: 'text-text-muted', bg: 'hover:bg-white/10' },
    { value: 'faulted', label: 'Đang lỗi', border: 'border-danger/30', textCls: 'text-danger', bg: 'hover:bg-danger/10' },
  ];

  const canChangeChargerStatus = isAdmin || user?.roles?.includes('staff');

  return (
    <div className="flex flex-col h-[calc(100vh-var(--page-inset))] animate-fade-in gap-4">
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-h2 font-bold text-text-main">{t('dashboard:map.title')}</h1>
          <p className="text-text-muted text-sm mt-1">
            {t('dashboard:map.subtitle', { total: data?.total ?? 0 })}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 text-text-muted text-xs">
            <Filter className="w-3.5 h-3.5" />
            <span>Lọc:</span>
          </div>
          <CustomSelect
            value={statusFilter}
            onChange={(val) => {
              setStatusFilter(val);
              setSelectedStation(null);
              resetPage();
            }}
            options={[
              { value: 'all', label: t('dashboard:map.filter_all') },
              { value: 'active', label: t('dashboard:map.filter_active') },
              { value: 'maintenance', label: t('dashboard:map.filter_maintenance') },
              { value: 'inactive', label: t('dashboard:map.filter_inactive') },
            ]}
            className="w-36 h-9"
          />
          <CustomSelect
            value={connectorType}
            onChange={(val) => { setConnectorType(val); resetPage(); }}
            options={[
              { value: '', label: 'Tất cả đầu cắm' },
              { value: 'CCS', label: 'CCS (DC fast)' },
              { value: 'CHAdeMO', label: 'CHAdeMO' },
              { value: 'Type2', label: 'Type 2 (AC)' },
              { value: 'GB/T', label: 'GB/T' },
              { value: 'Other', label: 'Khác' },
            ]}
            className="w-36 h-9"
          />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); resetPage(); }}
            placeholder="Tìm tên / địa chỉ trạm..."
            className="ev-input h-9 text-sm w-52"
          />
          {(statusFilter !== 'all' || connectorType || search) && (
            <button
              onClick={() => { setStatusFilter('all'); setConnectorType(''); setSearch(''); resetPage(); }}
              className="text-xs text-text-muted hover:text-danger transition-colors"
            >
              Xóa bộ lọc
            </button>
          )}
          {isAdmin && (
            <button 
              onClick={handleOpenAddStationModal}
              className="btn-primary flex items-center gap-2 h-9 px-4 text-sm ml-auto"
            >
              <Plus className="w-4 h-4" /> {t('dashboard:map.add_station')}
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 flex-1 min-h-0">
        {/* Station List */}
        <div 
          className={cn(
            "glass flex flex-col overflow-hidden transition-all duration-300 min-h-0", 
            selectedStation ? "lg:col-span-1" : "lg:col-span-3 w-full"
          )} 
        >
          {/* Staff GPS Checking Widget */}
          {!isAdmin && assignedStationId && (
            <div className="p-4 border-b border-white/5 bg-white/[0.02] space-y-3 shrink-0 relative overflow-hidden">
              <div className="corner-marker cm-tl" />
              <div className="corner-marker cm-tr" />
              <div className="corner-marker cm-bl" />
              <div className="corner-marker cm-br" />

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-cyan/10 border border-cyan/20 flex items-center justify-center">
                    <Users className="w-4 h-4 text-cyan" />
                  </div>
                  <div>
                    <h4 className="font-bold text-text-main text-xs uppercase tracking-wider">Điểm danh trạm sạc</h4>
                    <p className="text-[10px] text-text-muted mt-0.5">Trạm: {stations.find(st => st.id === assignedStationId)?.name || 'Trạm sạc'}</p>
                  </div>
                </div>
                
                {/* Live Status indicator */}
                <div>
                  {myTodayAttendance?.checkIn && !myTodayAttendance?.checkOut ? (
                    <span className="badge badge-success uppercase text-[9px] tracking-wider animate-pulse">Đã Check-In</span>
                  ) : myTodayAttendance?.checkIn && myTodayAttendance?.checkOut ? (
                    <span className="badge badge-muted uppercase text-[9px] tracking-wider">Hoàn thành ca</span>
                  ) : (
                    <span className="badge badge-warning uppercase text-[9px] tracking-wider">Chưa Check-In</span>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2.5 pt-1">
                {(!myTodayAttendance?.checkIn) && (
                  <button
                    onClick={handleCheckIn}
                    className="flex-1 py-1.5 rounded-xl text-xs font-bold text-white shadow-md shadow-cyan/20 hover:brightness-105 transition-all flex items-center justify-center gap-1 bg-gradient-to-r from-cyan to-blue-500"
                  >
                    <CheckCircle className="w-3.5 h-3.5" /> Check-In
                  </button>
                )}
                
                {myTodayAttendance?.checkIn && !myTodayAttendance?.checkOut && (
                  <button
                    onClick={handleCheckOut}
                    className="flex-1 py-1.5 rounded-xl text-xs font-bold text-white shadow-md shadow-danger/20 hover:brightness-105 transition-all flex items-center justify-center gap-1 bg-danger"
                  >
                    <Clock className="w-3.5 h-3.5" /> Check-Out
                  </button>
                )}

                {myTodayAttendance?.checkIn && myTodayAttendance?.checkOut && (
                  <div className="flex-1 py-2 rounded-xl text-center text-xs font-semibold text-text-muted bg-white/5 border border-white/10 flex items-center justify-center gap-1.5 w-full">
                    <CheckCircle className="w-3.5 h-3.5 text-success" /> Ca làm việc hoàn thành!
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="px-5 py-4 border-b border-white/5 shrink-0">
            <p className="font-semibold text-text-main text-sm">{t('dashboard:map.station_list')}</p>
          </div>
          {!selectedStation && (
            <div className="px-6 py-2 border-b border-white/5 text-[10px] font-bold uppercase tracking-wider text-text-muted shrink-0">
              <div className="grid grid-cols-12 gap-4">
                <div className="col-span-5 text-center">Trạm sạc</div>
                <div className="col-span-4 text-center">Địa chỉ</div>
                <div className="col-span-1 text-center">Số trụ</div>
                <div className="col-span-2 text-center">Trạng thái</div>
              </div>
            </div>
          )}
          <div className="flex-1 overflow-y-auto min-h-0">
            {isLoading ? (
              <div className="flex flex-col gap-2 p-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-16 rounded-xl bg-white/5 animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="flex flex-col divide-y divide-white/5">
                {stations.map((s) => {
                  const statusObj = getStatusLabel(s.status);
                  const isSelected = selectedStation?.id === s.id;
                  return (
                    <motion.div
                      key={s.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      onClick={() => setSelectedStation(s)}
                      className={cn(
                        "px-4 py-3.5 transition-colors cursor-pointer border-l-[3px] relative",
                        !selectedStation && "px-6 py-5",
                        isSelected
                          ? "bg-gradient-to-r from-cyan/[0.08] to-transparent border-cyan shadow-[inset_0_0_20px_-10px_rgba(16,191,201,0.15)]"
                          : "border-transparent hover:bg-white/5"
                      )}
                    >
                      {!selectedStation ? (
                        <div className="grid grid-cols-12 gap-4 items-center">
                          <div className="col-span-5 flex items-center gap-3 min-w-0">
                            <div className="w-10 h-10 rounded-xl bg-cyan/10 border border-cyan/20 flex items-center justify-center shrink-0">
                              <Zap className="w-5 h-5 text-cyan" />
                            </div>
                            <p className="text-sm font-medium text-text-main truncate text-left">{s.name}</p>
                          </div>
                          <div className="col-span-4 text-text-muted text-xs truncate text-left">{s.address}</div>
                          <div className="col-span-1 text-xs text-text-muted text-right">{t('dashboard:map.chargers_available', { available: s.availableChargers, total: s.totalChargers })}</div>
                          <div className="col-span-2 text-left"><span className={`badge ${statusObj.cls}`}>{statusObj.label}</span></div>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex items-center gap-2">
                              {isSelected && (
                                <CheckCircle2 className="w-4 h-4 text-cyan shrink-0" />
                              )}
                              <div>
                                <p className={cn("text-sm font-medium truncate", isSelected ? "text-cyan" : "text-text-main")}>
                                  {s.name}
                                </p>
                                <p className="text-text-muted text-xs truncate mt-0.5">{s.address}</p>
                              </div>
                            </div>
                            <span className={`badge ${statusObj.cls} shrink-0`}>
                              {statusObj.label}
                            </span>
                          </div>
                          <div className="flex items-center gap-4 mt-2">
                            <div className="flex items-center gap-1.5 text-xs text-text-muted">
                              {s.availableChargers > 0 ? <Wifi className="w-3.5 h-3.5 text-success" /> : <WifiOff className="w-3.5 h-3.5 text-danger" />}
                              {t('dashboard:map.chargers_available', { available: s.availableChargers, total: s.totalChargers })}
                            </div>
                          </div>
                        </>
                      )}
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Selected Station Map & Detailed View */}
        {selectedStation && (
          <div className="lg:col-span-2 glass flex flex-col overflow-hidden animate-fade-in min-h-0">
            <div className="px-5 py-3.5 border-b border-white/5 flex items-center justify-between bg-white/[0.01]">
              <div className="min-w-0 mr-2">
                <h3 className="font-semibold text-text-main text-sm truncate">{selectedStation.name}</h3>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {isAdmin && (
                  <>
                    <button
                      onClick={handleOpenEditStationModal}
                      className="w-7 h-7 rounded-full bg-white/5 flex items-center justify-center text-text-muted hover:text-cyan hover:bg-white/10 transition-colors"
                      title="Sửa thông tin trạm sạc"
                    >
                      <Edit className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={handleDeleteStation}
                      className="w-7 h-7 rounded-full bg-white/5 flex items-center justify-center text-text-muted hover:text-danger hover:bg-white/10 transition-colors"
                      title="Xóa trạm sạc"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </>
                )}
                <button 
                  onClick={() => setSelectedStation(null)}
                  className="w-7 h-7 rounded-full bg-white/5 flex items-center justify-center text-text-muted hover:text-text-main hover:bg-white/10 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            
            <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
              {/* Left Column: Map */}
              <div className="flex-1 relative min-h-[200px] md:min-h-0">
                <StationMap 
                  stations={[
                    isEditStationModalOpen 
                      ? { ...selectedStation, latitude: editingStationLat, longitude: editingStationLng } 
                      : selectedStation
                  ]} 
                  editingStationId={isEditStationModalOpen ? selectedStation.id : undefined}
                  onCoordinatesChange={(lat, lng) => {
                    setEditingStationLat(lat);
                    setEditingStationLng(lng);
                  }}
                />
              </div>
              
              {/* Right Column: Station Details or Edit Form */}
              <div className="w-full md:w-[320px] border-t md:border-t-0 md:border-l border-white/5 flex flex-col bg-white/[0.01] overflow-hidden">
                {isEditStationModalOpen ? (
                  <form onSubmit={handleEditStation} className="flex flex-col h-full overflow-hidden">
                    <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between bg-white/[0.005]">
                      <h4 className="font-bold text-text-main text-xs uppercase tracking-wider flex items-center gap-1.5">
                        <Edit className="w-3.5 h-3.5 text-cyan" />
                        Cập nhật trạm sạc
                      </h4>
                      <button 
                        type="button"
                        onClick={() => setIsEditStationModalOpen(false)}
                        className="text-text-muted hover:text-text-main p-0.5 transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs scrollbar-thin">
                      <div className="flex flex-col gap-1">
                        <label className="text-text-muted font-semibold">Tên trạm sạc</label>
                        <input 
                          type="text"
                          required
                          value={editingStationName}
                          onChange={(e) => setEditingStationName(e.target.value)}
                          className="ev-input w-full h-8 px-2.5 text-xs"
                        />
                      </div>

                      <div className="flex flex-col gap-1">
                        <label className="text-text-muted font-semibold">Địa chỉ</label>
                        <input 
                          type="text"
                          value={editingStationAddress}
                          onChange={(e) => setEditingStationAddress(e.target.value)}
                          className="ev-input w-full h-8 px-2.5 text-xs"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="flex flex-col gap-1">
                          <label className="text-text-muted font-semibold">Vĩ độ (Latitude)</label>
                          <input 
                            type="number"
                            step="0.000001"
                            required
                            value={editingStationLat}
                            onChange={(e) => setEditingStationLat(Number(e.target.value))}
                            className="ev-input w-full h-8 px-2.5 text-xs font-mono"
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-text-muted font-semibold">Kinh độ (Longitude)</label>
                          <input 
                            type="number"
                            step="0.000001"
                            required
                            value={editingStationLng}
                            onChange={(e) => setEditingStationLng(Number(e.target.value))}
                            className="ev-input w-full h-8 px-2.5 text-xs font-mono"
                          />
                        </div>
                      </div>

                      <div className="flex flex-col gap-1">
                        <label className="text-text-muted font-semibold">Trạng thái hoạt động</label>
                        <CustomSelect
                          value={editingStationStatus}
                          onChange={setEditingStationStatus}
                          options={[
                            { value: 'active', label: 'Hoạt động (active)' },
                            { value: 'maintenance', label: 'Bảo trì (maintenance)' },
                            { value: 'inactive', label: 'Dừng hoạt động (inactive)' },
                            { value: 'closed', label: 'Đã đóng cửa (closed)' },
                          ]}
                        />
                      </div>

                      <div className="p-3 rounded-xl bg-cyan/5 border border-cyan/15 text-[11px] text-cyan leading-relaxed">
                        💡 <strong>Mẹo định vị:</strong> Bạn có thể kéo thả ghim trạm sạc trực tiếp trên bản đồ sang vị trí mới, tọa độ ở trên sẽ tự động cập nhật!
                      </div>
                    </div>

                    <div className="p-4 border-t border-white/5 bg-white/[0.005] flex gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => setIsEditStationModalOpen(false)}
                        className="flex-1 py-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-xs font-semibold text-text-main transition-colors"
                      >
                        Hủy
                      </button>
                      <button
                        type="submit"
                        className="flex-1 py-2 rounded-xl text-xs font-bold text-white shadow-md shadow-cyan/20 hover:brightness-105 transition-all"
                        style={{ background: 'var(--grad-cyan-lime)' }}
                      >
                        Lưu thay đổi
                      </button>
                    </div>
                  </form>
                ) : (
                  <>
                    {/* Location and Directions info */}
                    <div className="p-4 border-b border-white/5 space-y-3 shrink-0">
                      <div className="flex flex-col gap-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-faded)' }}>
                          Địa chỉ:
                        </span>
                        <p className="text-text-main text-xs leading-normal font-medium">
                          {selectedStation.address}
                        </p>
                      </div>
                      
                      <div className="flex items-center justify-between gap-2 pt-1">
                        <a
                          href={`https://www.google.com/maps/dir/?api=1&destination=${selectedStation.latitude},${selectedStation.longitude}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3.5 py-1.5 rounded-full text-white text-[11px] font-bold flex items-center gap-1.5 shadow-lg transition-all duration-200 hover:brightness-105"
                          style={{
                            background: 'var(--grad-cyan-lime)',
                            boxShadow: '0 4px 12px var(--glow-cyan)'
                          }}
                        >
                          <MapPin className="w-3.5 h-3.5" /> Chỉ đường
                        </a>

                        {isAdmin && (
                          <button
                            type="button"
                            onClick={() => {
                              setIsPricingModalOpen(true);
                              fetchPricingRules(selectedStation.id);
                            }}
                            className="px-3.5 py-1.5 rounded-full bg-cyan/15 hover:bg-cyan/25 border border-cyan/25 text-cyan text-[11px] font-bold flex items-center gap-1.5 shadow-md transition-all duration-200"
                          >
                            <DollarSign className="w-3.5 h-3.5" /> Xem bảng giá
                          </button>
                        )}

                        {!isAdmin && (
                          <button
                            type="button"
                            onClick={() => handleOpenReportIncidentModal()}
                            className="px-3.5 py-1.5 rounded-full bg-danger/10 hover:bg-danger/20 border border-danger/25 text-danger text-[11px] font-bold flex items-center gap-1.5 shadow-md transition-all duration-200"
                          >
                            <AlertTriangle className="w-3.5 h-3.5 animate-pulse" /> Báo cáo sự cố
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Chargers Header */}
                    <div className="px-4 py-3 flex items-center justify-between shrink-0 border-b border-white/5 bg-white/[0.005]">
                      <h4 className="font-bold text-text-main text-xs uppercase tracking-wider">
                        Số trụ sạc: {selectedStation.chargers?.length ?? 0}
                      </h4>
                      {isAdmin && (
                        <button
                          onClick={handleOpenAddModal}
                          className="text-[10px] font-bold text-cyan hover:text-cyan/85 transition-colors duration-150 flex items-center gap-1 bg-white/5 border border-white/10 px-2.5 py-1 rounded-md"
                        >
                          <Plus className="w-3 h-3" /> Thêm trụ
                        </button>
                      )}
                    </div>

                    {/* Chargers Scrollable List */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-3">
                      {!selectedStation.chargers || selectedStation.chargers.length === 0 ? (
                        <div className="h-32 flex items-center justify-center border border-dashed border-white/5 rounded-2xl">
                          <p className="text-text-muted text-xs">Trạm chưa có trụ sạc nào</p>
                        </div>
                      ) : (
                        selectedStation.chargers.map((charger) => {
                          const style = getChargerStyle(charger.status);
                          return (
                            <div
                              key={charger.id}
                              className={cn(
                                "relative rounded-2xl border transition-all duration-200 overflow-hidden",
                                style.border
                              )}
                            >
                              <div 
                                className="absolute inset-0 pointer-events-none opacity-5"
                                style={{
                                  background: `linear-gradient(90deg, ${style.color} 0%, transparent 100%)`
                                }}
                              />
                              
                              <div className="p-3 flex items-center justify-between gap-3 relative z-10">
                                {/* Left: Power indicator box */}
                                <div 
                                  className={cn("w-12 h-12 rounded-xl flex flex-col items-center justify-center shrink-0", style.bg)}
                                >
                                  <Zap className="w-3.5 h-3.5" style={{ color: style.color }} />
                                  <span className="text-[10px] font-extrabold tracking-tight mt-0.5" style={{ color: style.color }}>
                                    {charger.maxPowerKw || Math.max(0, ...(charger.connectors?.map(c => c.maxPowerKw || 0) || [0]))} kW
                                  </span>
                                </div>

                                {/* Middle: Details */}
                                <div className="flex-1 min-w-0">
                                  <h5 className="font-bold text-text-main text-xs truncate leading-snug">
                                    {charger.name}
                                  </h5>
                                  <p className="text-[10px] text-text-muted mt-0.5 truncate" title={charger.connectors?.map(c => `${c.connectorType} (${c.maxPowerKw}kW)`).join(', ')}>
                                    {charger.connectors?.map(c => `${c.connectorType} (${c.maxPowerKw}kW)`).join(', ') || 'Other'}
                                  </p>
                                  
                                  <div className="flex items-center gap-1 mt-1.5">
                                    <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", style.dotBg)} />
                                    <span className="text-[9px] font-bold" style={{ color: style.color }}>
                                      {style.label}
                                    </span>
                                  </div>
                                </div>

                                {/* Right: Actions — info button (for all), edit+delete (admin only) */}
                                <div className="flex items-center gap-1.5 shrink-0">
                                  {/* Info button: opens detail modal with status-change actions for staff & admin */}
                                  <button
                                    onClick={() => { setIsStatusEditOpen(false); setSelectedChargerForDetails(charger); }}
                                    className="text-text-muted hover:text-cyan transition-colors duration-150 p-1 bg-white/5 hover:bg-cyan/10 rounded-md border border-cyan/20"
                                    title="Xem chi tiết & thay đổi trạng thái"
                                  >
                                    <Info className="w-3.5 h-3.5" />
                                  </button>

                                  {/* Admin-only: full edit form + delete */}
                                  {isAdmin && (
                                    <>
                                      <button
                                        onClick={() => handleOpenEditModal(charger)}
                                        className="text-text-muted hover:text-cyan transition-colors duration-150 p-1 bg-white/5 hover:bg-white/10 rounded-md border border-white/5"
                                        title="Chỉnh sửa thông tin trụ sạc"
                                      >
                                        <Edit className="w-3.5 h-3.5" />
                                      </button>
                                      <button
                                        onClick={() => handleDeleteCharger(charger.id, charger.name)}
                                        className="text-text-muted hover:text-danger transition-colors duration-150 p-1 bg-white/5 hover:bg-white/10 rounded-md border border-white/5"
                                        title="Xóa trụ sạc"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Standalone Pagination */}
      <div className="glass px-4 shrink-0">
        <Pagination
          page={page}
          totalPages={totalPages}
          onPageChange={(p) => { setSelectedStation(null); setPage(p); }}
          total={total}
          currentItemsCount={stations.length}
          itemLabel="trạm"
          loading={isLoading}
        />
      </div>

      {/* Xem Chi Tiết Trụ Sạc Modal — with quick status-change actions in header */}
      {selectedChargerForDetails && renderPortal((() => {
        const computedPower = selectedChargerForDetails.maxPowerKw || Math.max(0, ...(selectedChargerForDetails.connectors?.map(c => c.maxPowerKw || 0) || [0]));
        const connectorString = selectedChargerForDetails.connectors?.map(c => `${c.connectorType} (${c.maxPowerKw}kW)`).join(', ') || 'Other';
        const currentStyle = getChargerStyle(selectedChargerForDetails.status);
        return (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
            <div 
              className="w-full max-w-sm rounded-2xl relative border shadow-2xl bg-white dark:bg-slate-950 border-slate-200 dark:border-white/10 text-slate-800 dark:text-slate-100 animate-scale-up overflow-hidden"
            >
              <div className="corner-marker cm-tl" />
              <div className="corner-marker cm-tr" />
              <div className="corner-marker cm-bl" />
              <div className="corner-marker cm-br" />

              {/* Header */}
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 dark:border-white/10 bg-white/[0.01]">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: `${currentStyle.color}22` }}>
                    <Zap className="w-3.5 h-3.5" style={{ color: currentStyle.color }} />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 dark:text-white text-xs uppercase tracking-wider leading-none">
                      Chi tiết trụ sạc
                    </h3>
                    <p className="text-[10px] mt-0.5 font-semibold" style={{ color: currentStyle.color }}>
                      {currentStyle.label}
                    </p>
                  </div>
                </div>
                <button 
                  onClick={() => setSelectedChargerForDetails(null)}
                  className="w-7 h-7 rounded-full bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Info rows */}
              <div className="px-5 py-4 space-y-3 text-xs">
                <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-white/5">
                  <span className="text-slate-500 dark:text-slate-400">Tên trụ:</span>
                  <span className="text-slate-900 dark:text-white font-bold">{selectedChargerForDetails.name}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-white/5">
                  <span className="text-slate-500 dark:text-slate-400">Mã định danh:</span>
                  <span className="text-slate-900 dark:text-white font-mono">{selectedChargerForDetails.externalId || '---'}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-white/5">
                  <span className="text-slate-500 dark:text-slate-400">Công suất tối đa:</span>
                  <span className="text-cyan font-bold">{computedPower} kW</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-white/5">
                  <span className="text-slate-500 dark:text-slate-400">Đầu cắm:</span>
                  <span className="text-slate-900 dark:text-white font-semibold">{connectorString}</span>
                </div>

                {/* Status row with inline edit toggle */}
                <div className="flex items-center justify-between py-1.5">
                  <span className="text-slate-500 dark:text-slate-400">Trạng thái vận hành:</span>
                  <div className="flex items-center gap-2">
                    <span className="font-bold uppercase" style={{ color: currentStyle.color }}>
                      {currentStyle.label}
                    </span>
                    {canChangeChargerStatus && (
                      <button
                        onClick={() => setIsStatusEditOpen(v => !v)}
                        title="Thay đổi trạng thái"
                        className={cn(
                          "w-6 h-6 rounded-md flex items-center justify-center transition-colors border",
                          isStatusEditOpen
                            ? "bg-cyan/15 border-cyan/30 text-cyan"
                            : "bg-slate-100 dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-400 hover:text-cyan hover:bg-cyan/10 hover:border-cyan/25"
                        )}
                      >
                        <Edit className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Inline status selector panel */}
                {canChangeChargerStatus && isStatusEditOpen && (
                  <div className="pt-1 pb-0.5">
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 mb-2 uppercase tracking-wider font-semibold">Chọn trạng thái mới:</p>
                    <div className="grid grid-cols-2 gap-2">
                      {STATUS_ACTIONS.filter(s => s.value !== selectedChargerForDetails.status.toLowerCase()).map((s) => (
                        <button
                          key={s.value}
                          onClick={() => handleUpdateChargerStatus(s.value, s.label)}
                          disabled={isUpdatingChargerStatus}
                          className={cn(
                            "h-8 px-3 rounded-xl border text-[10px] font-bold uppercase tracking-wide transition-all duration-150 disabled:opacity-50 disabled:cursor-wait flex items-center justify-center gap-1.5",
                            s.border, s.textCls, s.bg
                          )}
                        >
                          {isUpdatingChargerStatus ? (
                            <div className="w-3 h-3 rounded-full border border-current border-t-transparent animate-spin" />
                          ) : (
                            s.label
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Live Session & Telemetry — only for in_use chargers */}
                {selectedChargerForDetails.status.toLowerCase() === 'in_use' && (
                  <LiveSessionPanel chargerId={selectedChargerForDetails.id} stationId={selectedStation?.id ?? ''} />
                )}
              </div>
            </div>
          </div>
        );
      })())}

      {/* Thêm Trụ Sạc Mới Modal */}
      {isAddModalOpen && renderPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <form 
            onSubmit={handleAddCharger}
            className="w-full max-w-sm p-6 rounded-2xl relative border shadow-2xl space-y-4 bg-white dark:bg-slate-950 border-slate-200 dark:border-white/10 text-slate-800 dark:text-slate-100 animate-scale-up"
          >
            <div className="corner-marker cm-tl" />
            <div className="corner-marker cm-tr" />
            <div className="corner-marker cm-bl" />
            <div className="corner-marker cm-br" />

            <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/10 pb-2.5">
              <div className="flex items-center gap-2">
                <Plus className="w-4 h-4 text-cyan" />
                <h3 className="font-bold text-slate-900 dark:text-white text-xs uppercase tracking-wider">
                  Thêm trụ sạc mới
                </h3>
              </div>
              <button 
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white p-0.5 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3.5 text-xs">
              <div className="flex flex-col gap-1">
                <label className="text-slate-500 dark:text-slate-400 font-semibold">Tên trụ sạc</label>
                <input 
                  type="text"
                  required
                  value={chargerName}
                  onChange={(e) => setChargerName(e.target.value)}
                  placeholder="Ví dụ: Trụ AC 01"
                  className="ev-input w-full h-8 px-2.5 text-xs"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-slate-500 dark:text-slate-400 font-semibold">Mã định danh (External ID - Tùy chọn)</label>
                <input 
                  type="text"
                  value={chargerExternalId}
                  onChange={(e) => setChargerExternalId(e.target.value)}
                  placeholder="Ví dụ: ocpp-charger-01"
                  className="ev-input w-full h-8 px-2.5 text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-slate-500 dark:text-slate-400 font-semibold">Công suất (kW)</label>
                  <input 
                    type="number"
                    required
                    min={1}
                    max={1000}
                    value={chargerPower}
                    onChange={(e) => setChargerPower(Number(e.target.value))}
                    className="ev-input w-full h-8 px-2.5 text-xs"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-slate-500 dark:text-slate-400 font-semibold">Đầu cắm</label>
                  <CustomSelect
                    value={chargerConnector}
                    onChange={setChargerConnector}
                    options={[
                      { value: 'CCS2', label: 'CCS2 (DC fast)' },
                      { value: 'Type2', label: 'Type 2 (AC)' },
                      { value: 'CHAdeMO', label: 'CHAdeMO' },
                      { value: 'GB/T', label: 'GB/T' },
                    ]}
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="px-3.5 py-1.5 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 border border-slate-200 dark:border-white/10 text-slate-800 dark:text-white text-xs font-semibold transition-colors rounded-xl"
              >
                Hủy
              </button>
              <button
                type="submit"
                className="px-3.5 py-1.5 text-xs font-bold text-white shadow-md shadow-cyan/20 rounded-xl transition-all"
                style={{
                  background: 'var(--grad-cyan-lime)'
                }}
              >
                Thêm mới
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Sửa Trụ Sạc Modal (Admin only) */}
      {isEditModalOpen && editingCharger && renderPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <form 
            onSubmit={handleEditCharger}
            className="w-full max-w-sm p-6 rounded-2xl relative border shadow-2xl space-y-4 bg-white dark:bg-slate-950 border-slate-200 dark:border-white/10 text-slate-800 dark:text-slate-100 animate-scale-up"
          >
            <div className="corner-marker cm-tl" />
            <div className="corner-marker cm-tr" />
            <div className="corner-marker cm-bl" />
            <div className="corner-marker cm-br" />

            <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/10 pb-2.5">
              <div className="flex items-center gap-2">
                <Edit className="w-4 h-4 text-cyan" />
                <h3 className="font-bold text-slate-900 dark:text-white text-xs uppercase tracking-wider">
                  {t('dashboard:map.update_charger_title')}
                </h3>
              </div>
              <button 
                type="button"
                onClick={() => { setIsEditModalOpen(false); setEditingCharger(null); }}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white p-0.5 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3.5 text-xs">
              <div className="flex flex-col gap-1">
                <label className="text-slate-500 dark:text-slate-400 font-semibold">Tên trụ sạc</label>
                <input 
                  type="text"
                  required
                  value={chargerName}
                  onChange={(e) => setChargerName(e.target.value)}
                  className="ev-input w-full h-8 px-2.5 text-xs"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-slate-500 dark:text-slate-400 font-semibold">Trạng thái vận hành</label>
                <CustomSelect
                  value={chargerStatus}
                  onChange={setChargerStatus}
                  options={[
                    { value: 'available', label: 'Sẵn sàng (available)' },
                    { value: 'in_use', label: 'Đang sạc (in_use)' },
                    { value: 'reserved', label: 'Đã đặt (reserved)' },
                    { value: 'offline', label: 'Ngoại tuyến (offline)' },
                    { value: 'faulted', label: 'Đang lỗi (faulted)' },
                  ]}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-slate-500 dark:text-slate-400 font-semibold">Công suất (kW)</label>
                  <input 
                    type="number"
                    required
                    min={1}
                    max={1000}
                    value={chargerPower}
                    onChange={(e) => setChargerPower(Number(e.target.value))}
                    className="ev-input w-full h-8 px-2.5 text-xs"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-slate-500 dark:text-slate-400 font-semibold">Đầu cắm</label>
                  <CustomSelect
                    value={chargerConnector}
                    onChange={setChargerConnector}
                    options={[
                      { value: 'CCS2', label: 'CCS2 (DC fast)' },
                      { value: 'Type2', label: 'Type 2 (AC)' },
                      { value: 'CHAdeMO', label: 'CHAdeMO' },
                      { value: 'GB/T', label: 'GB/T' },
                    ]}
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => { setIsEditModalOpen(false); setEditingCharger(null); }}
                className="px-3.5 py-1.5 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 border border-slate-200 dark:border-white/10 text-slate-800 dark:text-white text-xs font-semibold transition-colors rounded-xl"
              >
                Hủy
              </button>
              <button
                type="submit"
                className="px-3.5 py-1.5 text-xs font-bold text-white shadow-md shadow-cyan/20 rounded-xl transition-all"
                style={{
                  background: 'var(--grad-cyan-lime)'
                }}
              >
                Lưu thay đổi
              </button>
            </div>
          </form>
        </div>
      )}
      {/* Thêm Trạm Sạc Mới Modal */}
      {isAddStationModalOpen && renderPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <form 
            onSubmit={handleAddStation}
            className="w-full max-w-sm p-6 rounded-2xl relative border shadow-2xl space-y-4 bg-white dark:bg-slate-950 border-slate-200 dark:border-white/10 text-slate-800 dark:text-slate-100 animate-scale-up"
          >
            <div className="corner-marker cm-tl" />
            <div className="corner-marker cm-tr" />
            <div className="corner-marker cm-bl" />
            <div className="corner-marker cm-br" />

            <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/10 pb-2.5">
              <div className="flex items-center gap-2">
                <Plus className="w-4 h-4 text-cyan" />
                <h3 className="font-bold text-slate-900 dark:text-white text-xs uppercase tracking-wider">
                  Thêm trạm sạc mới
                </h3>
              </div>
              <button 
                type="button"
                onClick={() => setIsAddStationModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white p-0.5 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3.5 text-xs">
              <div className="flex flex-col gap-1">
                <label className="text-slate-500 dark:text-slate-400 font-semibold">Tên trạm sạc</label>
                <input 
                  type="text"
                  required
                  value={stationName}
                  onChange={(e) => setStationName(e.target.value)}
                  placeholder="Ví dụ: Trạm sạc VinFast Sóc Sơn"
                  className="ev-input w-full h-8 px-2.5 text-xs"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-slate-500 dark:text-slate-400 font-semibold">Địa chỉ</label>
                <input 
                  type="text"
                  value={stationAddress}
                  onChange={(e) => setStationAddress(e.target.value)}
                  placeholder="Ví dụ: Số 204 Nguyễn Trãi, Sóc Sơn, Hà Nội"
                  className="ev-input w-full h-8 px-2.5 text-xs"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-slate-500 dark:text-slate-400 font-semibold">Thành phố</label>
                <CustomSelect
                  value={stationCityId}
                  onChange={setStationCityId}
                  options={cities.map((city: any) => ({
                    value: city.id,
                    label: `${city.cityName} (${city.region})`,
                  }))}
                  placeholder="Chọn thành phố"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-slate-500 dark:text-slate-400 font-semibold">Vĩ độ (Latitude)</label>
                  <input 
                    type="number"
                    step="0.000001"
                    required
                    value={stationLat}
                    onChange={(e) => setStationLat(Number(e.target.value))}
                    className="ev-input w-full h-8 px-2.5 text-xs"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-slate-500 dark:text-slate-400 font-semibold">Kinh độ (Longitude)</label>
                  <input 
                    type="number"
                    step="0.000001"
                    required
                    value={stationLng}
                    onChange={(e) => setStationLng(Number(e.target.value))}
                    className="ev-input w-full h-8 px-2.5 text-xs"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-slate-500 dark:text-slate-400 font-semibold">Tên chủ sở hữu (Tùy chọn)</label>
                <input 
                  type="text"
                  value={stationOwnerName}
                  onChange={(e) => setStationOwnerName(e.target.value)}
                  placeholder="Ví dụ: VinFast Việt Nam"
                  className="ev-input w-full h-8 px-2.5 text-xs"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsAddStationModalOpen(false)}
                className="px-3.5 py-1.5 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 border border-slate-200 dark:border-white/10 text-slate-800 dark:text-white text-xs font-semibold transition-colors rounded-xl"
              >
                Hủy
              </button>
              <button
                type="submit"
                className="px-3.5 py-1.5 text-xs font-bold text-white shadow-md shadow-cyan/20 rounded-xl transition-all"
                style={{
                  background: 'var(--grad-cyan-lime)'
                }}
              >
                Thêm mới
              </button>
            </div>
          </form>
        </div>
      )}
      {/* Báo Cáo Sự Cố Modal */}
      {isReportIncidentModalOpen && selectedStation && renderPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <form 
            onSubmit={handleReportIncident}
            className="w-full max-w-sm p-6 rounded-2xl relative border shadow-2xl space-y-4 bg-white dark:bg-slate-950 border-slate-200 dark:border-white/10 text-slate-800 dark:text-slate-100 animate-scale-up"
          >
            <div className="corner-marker cm-tl" />
            <div className="corner-marker cm-tr" />
            <div className="corner-marker cm-bl" />
            <div className="corner-marker cm-br" />

            <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/10 pb-2.5">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-danger animate-pulse" />
                <h3 className="font-bold text-slate-900 dark:text-white text-xs uppercase tracking-wider">
                  Báo cáo sự cố trạm sạc
                </h3>
              </div>
              <button 
                type="button"
                onClick={() => setIsReportIncidentModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white p-0.5 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-text-muted">
              Báo cáo này sẽ được gửi trực tiếp cho Quản trị viên để kịp thời lên lịch bảo trì hoặc xử lý kỹ thuật.
            </p>

            <div className="space-y-3.5 text-xs">
              <div className="flex flex-col gap-1">
                <label className="text-slate-500 dark:text-slate-400 font-semibold">Tên trạm sạc</label>
                <div className="font-semibold text-slate-900 dark:text-white bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5 rounded-xl px-3 py-2">
                  {selectedStation.name}
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-slate-500 dark:text-slate-400 font-semibold">Chọn trụ sạc gặp sự cố</label>
                <CustomSelect
                  value={incidentChargerId}
                  onChange={setIncidentChargerId}
                  options={[
                    { value: '', label: 'Tất cả / Cả trạm sạc' },
                    ...(selectedStation.chargers || []).map((c) => ({
                      value: c.id,
                      label: `${c.name} (${c.maxPowerKw || 0}kW)`,
                    })),
                  ]}
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-slate-500 dark:text-slate-400 font-semibold">Mức độ nghiêm trọng <span className="text-danger">*</span></label>
                <CustomSelect
                  value={incidentSeverity}
                  onChange={setIncidentSeverity}
                  options={[
                    { value: 'critical', label: 'Nguy cấp (Critical)' },
                    { value: 'high', label: 'Cao (High)' },
                    { value: 'medium', label: 'Trung bình (Medium)' },
                    { value: 'low', label: 'Thấp (Low)' },
                  ]}
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-slate-500 dark:text-slate-400 font-semibold">Mô tả sự cố <span className="text-danger">*</span></label>
                <textarea 
                  required
                  rows={3}
                  value={incidentDescription}
                  onChange={(e) => setIncidentDescription(e.target.value)}
                  placeholder="Mô tả chi tiết tình trạng sự cố (Ví dụ: Trụ sạc không nhận thẻ QR, lỗi cổng kết nối CCS2...)"
                  className="ev-input w-full p-2.5 text-xs rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 text-slate-900 dark:text-white"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={isSubmittingIncident}
                onClick={() => setIsReportIncidentModalOpen(false)}
                className="px-3.5 py-1.5 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 border border-slate-200 dark:border-white/10 text-slate-800 dark:text-white text-xs font-semibold transition-colors rounded-xl"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={isSubmittingIncident}
                className="px-3.5 py-1.5 text-xs font-bold text-white shadow-md shadow-danger/20 rounded-xl transition-all flex items-center gap-1 bg-danger hover:bg-danger/90"
              >
                {isSubmittingIncident && (
                  <div className="w-3.5 h-3.5 rounded-full border border-white border-t-transparent animate-spin shrink-0" />
                )}
                Gửi báo cáo
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Xem Bảng Giá Modal */}
      {isPricingModalOpen && selectedStation && renderPortal((() => {
        const groupedRules = pricingRules.reduce((acc: Record<string, any[]>, rule: any) => {
          const conn = rule.connectorType || 'Other';
          if (!acc[conn]) acc[conn] = [];
          acc[conn].push(rule);
          return acc;
        }, {});

        return (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
            <div className="w-full max-w-lg rounded-2xl relative border shadow-2xl bg-white dark:bg-slate-950 border-slate-200 dark:border-white/10 text-slate-800 dark:text-slate-100 animate-scale-up overflow-hidden flex flex-col max-h-[85vh]">
              <div className="corner-marker cm-tl" />
              <div className="corner-marker cm-tr" />
              <div className="corner-marker cm-bl" />
              <div className="corner-marker cm-br" />

              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-white/10 bg-white/[0.01]">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-cyan/10 flex items-center justify-center">
                    <DollarSign className="w-4 h-4 text-cyan" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 dark:text-white text-sm uppercase tracking-wider leading-none">
                      {isRuleFormOpen ? (editingRule ? 'Cập nhật giá sạc' : 'Thêm giá sạc') : 'Bảng giá dịch vụ sạc'}
                    </h3>
                    <p className="text-[10px] mt-1 text-slate-500 dark:text-slate-400 font-medium truncate max-w-[200px]">
                      {selectedStation.name}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0 font-bold">
                  {!isRuleFormOpen && (
                    <button
                      onClick={handleOpenAddRule}
                      className="text-[10px] text-cyan hover:text-cyan/80 transition-colors duration-150 flex items-center gap-1 bg-cyan/10 border border-cyan/20 px-2.5 py-1 rounded-md"
                    >
                      <Plus className="w-3 h-3" /> Thêm quy tắc
                    </button>
                  )}
                  <button 
                    onClick={() => { setIsPricingModalOpen(false); setIsRuleFormOpen(false); }}
                    className="w-7 h-7 rounded-full bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-5 space-y-5">
                {isRuleFormOpen ? (
                  <form onSubmit={handleSaveRule} className="space-y-4 text-xs">
                    <div className="p-3.5 rounded-2xl bg-cyan/5 border border-cyan/15 text-[11px] text-cyan font-medium leading-relaxed">
                      {editingRule ? 'Chỉnh sửa quy tắc giá hiện tại của trạm sạc.' : 'Thiết lập quy tắc giá mới theo cổng sạc và khung giờ.'}
                    </div>

                    <div className="flex flex-col gap-1">
                      <label className="text-slate-500 dark:text-slate-400 font-semibold">Loại đầu sạc</label>
                      <CustomSelect
                        value={ruleConnectorType}
                        onChange={setRuleConnectorType}
                        options={[
                          { value: 'CCS', label: 'CCS (DC fast)' },
                          { value: 'CCS2', label: 'CCS2 (DC fast)' },
                          { value: 'CHAdeMO', label: 'CHAdeMO' },
                          { value: 'Type2', label: 'Type 2 (AC)' },
                          { value: 'GB/T', label: 'GB/T' },
                          { value: 'Other', label: 'Khác' },
                        ]}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="flex flex-col gap-1">
                        <label className="text-slate-500 dark:text-slate-400 font-semibold">Giờ bắt đầu</label>
                        <CustomSelect
                          value={ruleHourStart === '' ? '' : String(ruleHourStart)}
                          onChange={(val) => setRuleHourStart(val === '' ? '' : Number(val))}
                          options={[
                            { value: '', label: 'Không giới hạn (00:00)' },
                            ...Array.from({ length: 24 }, (_, i) => ({
                              value: String(i),
                              label: `${String(i).padStart(2, '0')}:00`,
                            })),
                          ]}
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-slate-500 dark:text-slate-400 font-semibold">Giờ kết thúc</label>
                        <CustomSelect
                          value={ruleHourEnd === '' ? '' : String(ruleHourEnd)}
                          onChange={(val) => setRuleHourEnd(val === '' ? '' : Number(val))}
                          options={[
                            { value: '', label: 'Không giới hạn (24:00)' },
                            ...Array.from({ length: 24 }, (_, i) => ({
                              value: String(i),
                              label: `${String(i).padStart(2, '0')}:00`,
                            })),
                          ]}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="flex flex-col gap-1">
                        <label className="text-slate-500 dark:text-slate-400 font-semibold">Giá sạc điện (VND/kWh)</label>
                        <input 
                          type="number"
                          required
                          min={0}
                          value={rulePricePerKwh}
                          onChange={(e) => setRulePricePerKwh(Number(e.target.value))}
                          className="ev-input w-full h-8 px-2.5 text-xs font-bold text-cyan"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-slate-500 dark:text-slate-400 font-semibold">Nhãn gói (Ví dụ: DC Peak)</label>
                        <input 
                          type="text"
                          value={ruleLabel}
                          onChange={(e) => setRuleLabel(e.target.value)}
                          placeholder="Nhãn phân biệt"
                          className="ev-input w-full h-8 px-2.5 text-xs"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="flex flex-col gap-1">
                        <label className="text-slate-500 dark:text-slate-400 font-semibold">Thời gian chờ miễn phí (Phút)</label>
                        <input 
                          type="number"
                          required
                          min={0}
                          value={ruleIdleGrace}
                          onChange={(e) => setRuleIdleGrace(Number(e.target.value))}
                          className="ev-input w-full h-8 px-2.5 text-xs"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-slate-500 dark:text-slate-400 font-semibold">Phí nhàn rỗi (VND/Phút)</label>
                        <input 
                          type="number"
                          required
                          min={0}
                          value={ruleIdleFee}
                          onChange={(e) => setRuleIdleFee(Number(e.target.value))}
                          className="ev-input w-full h-8 px-2.5 text-xs"
                        />
                      </div>
                    </div>

                    <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-white/10">
                      <button
                        type="button"
                        onClick={() => setIsRuleFormOpen(false)}
                        className="px-3.5 py-1.5 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 border border-slate-200 dark:border-white/10 text-slate-800 dark:text-white text-xs font-semibold rounded-xl transition-colors"
                      >
                        Hủy
                      </button>
                      <button
                        type="submit"
                        disabled={isSubmittingRule}
                        className="px-3.5 py-1.5 text-xs font-bold text-white shadow-md shadow-cyan/20 rounded-xl transition-all flex items-center gap-1"
                        style={{ background: 'var(--grad-cyan-lime)' }}
                      >
                        {isSubmittingRule && (
                          <div className="w-3 h-3 rounded-full border border-white border-t-transparent animate-spin shrink-0" />
                        )}
                        Lưu quy tắc
                      </button>
                    </div>
                  </form>
                ) : isLoadingPricing ? (
                  <div className="py-12 flex flex-col items-center justify-center gap-3">
                    <div className="w-8 h-8 rounded-full border-2 border-cyan border-t-transparent animate-spin" />
                    <p className="text-xs text-text-muted">Đang tải bảng giá...</p>
                  </div>
                ) : Object.keys(groupedRules).length > 0 ? (
                  Object.entries(groupedRules).map(([connector, rules]: [string, any]) => (
                    <div key={connector} className="space-y-2.5">
                      <div className="flex items-center gap-2">
                        <span className="badge badge-cyan text-[10px] font-bold tracking-wider uppercase px-2 py-0.5">
                          Cổng sạc: {connector}
                        </span>
                      </div>

                      <div className="overflow-hidden rounded-xl border border-slate-150 dark:border-white/5">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead>
                            <tr className="bg-slate-50 dark:bg-white/[0.02] border-b border-slate-150 dark:border-white/5">
                              <th className="px-3.5 py-2 font-semibold text-slate-500 dark:text-slate-400">Khung giờ</th>
                              <th className="px-3.5 py-2 font-semibold text-slate-500 dark:text-slate-400 text-right">Đơn giá điện</th>
                              <th className="px-3.5 py-2 font-semibold text-slate-500 dark:text-slate-400 text-right">Phí nhàn rỗi</th>
                              <th className="px-3.5 py-2 font-semibold text-slate-500 dark:text-slate-400">Tên gói / Nhãn</th>
                              <th className="px-3.5 py-2 font-semibold text-slate-500 dark:text-slate-400 text-center">Thao tác</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-150 dark:divide-white/5">
                            {rules.sort((a: any, b: any) => (a.hourStart ?? 0) - (b.hourStart ?? 0)).map((rule: any) => {
                              const timeStr = rule.hourStart !== null && rule.hourEnd !== null
                                ? `${String(rule.hourStart).padStart(2, '0')}:00 - ${String(rule.hourEnd).padStart(2, '0')}:00`
                                : 'Mặc định (Cả ngày)';
                              return (
                                <tr key={rule.id} className="hover:bg-slate-50/50 dark:hover:bg-white/[0.005] transition-colors">
                                  <td className="px-3.5 py-2.5 font-medium text-slate-900 dark:text-white">{timeStr}</td>
                                  <td className="px-3.5 py-2.5 text-right font-bold text-cyan">
                                    {rule.pricePerKwh?.toLocaleString()} ₫/kWh
                                  </td>
                                  <td className="px-3.5 py-2.5 text-right text-slate-600 dark:text-slate-300">
                                    {rule.idleFeePerMinute > 0 ? (
                                      <span>
                                        {rule.idleFeePerMinute.toLocaleString()} ₫/p
                                        <span className="text-[9px] text-slate-400 dark:text-slate-500 block">
                                          (Free {rule.idleGraceMinutes || 20}m)
                                        </span>
                                      </span>
                                    ) : (
                                      <span className="text-slate-400 dark:text-slate-500">Miễn phí</span>
                                    )}
                                  </td>
                                  <td className="px-3.5 py-2.5 text-slate-500 dark:text-slate-400 italic">
                                    {rule.label || '---'}
                                  </td>
                                  <td className="px-3.5 py-2.5 text-center">
                                    <div className="flex items-center justify-center gap-1.5">
                                      <button
                                        type="button"
                                        onClick={() => handleOpenEditRule(rule)}
                                        className="text-text-muted hover:text-cyan transition-colors duration-150 p-1 bg-white/5 hover:bg-white/10 rounded-md border border-white/5"
                                        title="Chỉnh sửa quy tắc giá"
                                      >
                                        <Edit className="w-3.5 h-3.5" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleDeactivateRule(rule.id)}
                                        className="text-text-muted hover:text-danger transition-colors duration-150 p-1 bg-white/5 hover:bg-white/10 rounded-md border border-white/5"
                                        title="Vô hiệu hóa quy tắc giá"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="space-y-4">
                    <div className="p-4 rounded-xl bg-amber-500/5 border border-amber-500/15 text-amber-500 leading-relaxed text-xs">
                      ⚠️ Trạm sạc này chưa được thiết lập bảng giá riêng (Custom Pricing Rules). Hệ thống đang áp dụng **Bảng giá mặc định** dưới đây:
                    </div>

                    <div className="space-y-4">
                      {/* Default Rates display */}
                      {[
                        {
                          connector: 'CCS / CCS2 / CHAdeMO (Sạc nhanh DC)',
                          rates: [
                            { time: 'Giờ cao điểm (09:00 - 12:00, 17:00 - 20:00)', price: 4500, label: 'DC Peak' },
                            { time: 'Giờ thấp điểm (22:00 - 06:00)', price: 2500, label: 'DC Off-Peak' },
                            { time: 'Giờ bình thường (Các giờ còn lại)', price: 3500, label: 'DC Normal' },
                          ]
                        },
                        {
                          connector: 'Type 2 (Sạc chậm AC)',
                          rates: [
                            { time: 'Giờ cao điểm (09:00 - 12:00, 17:00 - 20:00)', price: 4200, label: 'AC Peak' },
                            { time: 'Giờ thấp điểm (22:00 - 06:00)', price: 2300, label: 'AC Off-Peak' },
                            { time: 'Giờ bình thường (Các giờ còn lại)', price: 3200, label: 'AC Normal' },
                          ]
                        }
                      ].map((group) => (
                        <div key={group.connector} className="space-y-2">
                          <p className="font-bold text-slate-800 dark:text-slate-300 text-xs">{group.connector}</p>
                          <div className="overflow-hidden rounded-xl border border-slate-150 dark:border-white/5">
                            <table className="w-full text-left border-collapse text-xs">
                              <thead>
                                <tr className="bg-slate-50 dark:bg-white/[0.01] border-b border-slate-150 dark:border-white/5">
                                  <th className="px-3.5 py-1.5 font-semibold text-slate-500 dark:text-slate-400">Khung giờ</th>
                                  <th className="px-3.5 py-1.5 font-semibold text-slate-500 dark:text-slate-400 text-right">Giá điện</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-150 dark:divide-white/5">
                                {group.rates.map((r) => (
                                  <tr key={r.time}>
                                    <td className="px-3.5 py-2 text-slate-800 dark:text-slate-300">{r.time}</td>
                                    <td className="px-3.5 py-2 text-right font-bold text-cyan">{r.price.toLocaleString()} ₫/kWh</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ))}
                      
                      <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-white/[0.01] border border-slate-150 dark:border-white/5 space-y-1 text-xs">
                        <p className="font-bold text-slate-800 dark:text-slate-300">Phí nhàn rỗi mặc định (Idle Fee):</p>
                        <p className="text-slate-600 dark:text-slate-400">
                          • Miễn phí <strong>20 phút</strong> đầu tiên sau khi pin đầy.
                        </p>
                        <p className="text-slate-600 dark:text-slate-400">
                          • Thu phí <strong>1,000 ₫/phút</strong> cho các phút tiếp theo nếu tiếp tục chiếm dụng cổng sạc.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="p-4 border-t border-slate-100 dark:border-white/10 bg-slate-50 dark:bg-white/[0.005] flex justify-end shrink-0">
                <button
                  type="button"
                  onClick={() => { setIsPricingModalOpen(false); setIsRuleFormOpen(false); }}
                  className="px-4 py-2 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 border border-slate-200 dark:border-white/10 text-slate-800 dark:text-white text-xs font-bold transition-colors rounded-xl"
                >
                  Đóng
                </button>
              </div>
            </div>
          </div>
        );
      })())}
      {/* End of modals */}


    </div>
  );
}
