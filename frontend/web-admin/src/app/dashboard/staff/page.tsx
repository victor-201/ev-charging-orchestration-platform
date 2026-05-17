'use client';

import { useQuery } from '@tanstack/react-query';
import apiClient from '@/services/api-client';
import { motion } from 'framer-motion';
import { Users, UserPlus, MapPin, Clock } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

type Staff = {
  userId: string;
  position: string;
  shift: string;
  status: string;
  User?: { email: string; fullName: string };
};

type Attendance = {
  id: string;
  userId: string;
  stationId?: string;
  checkInTime: string;
  checkOutTime?: string;
  latitude: number;
  longitude: number;
  User?: { fullName: string };
};

export default function StaffPage() {
  const [tab, setTab] = useState<'staff' | 'attendance'>('staff');
  const { t } = useTranslation(['dashboard', 'common']);

  const { data: staffList, isLoading: loadingStaff } = useQuery<Staff[]>({
    queryKey: ['staff'],
    queryFn: async () => (await apiClient.get('/staff')).data,
  });

  const { data: attendanceList, isLoading: loadingAtt } = useQuery<Attendance[]>({
    queryKey: ['attendance'],
    queryFn: async () => (await apiClient.get('/attendance', { params: { limit: 50 } })).data,
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-h2 font-bold text-white">{t('dashboard:staff.title')}</h1>
          <p className="text-text-muted text-sm mt-1">{t('dashboard:staff.subtitle')}</p>
        </div>
        <button className="btn-primary flex items-center gap-2 h-9 px-4 text-sm">
          <UserPlus className="w-4 h-4" /> {t('dashboard:staff.add_staff')}
        </button>
      </div>

      <div className="flex gap-1 p-1 bg-white/5 rounded-xl w-fit">
        <button
          onClick={() => setTab('staff')}
          className={`px-5 py-2 rounded-lg text-sm font-medium transition-all duration-180 flex items-center gap-2 ${
            tab === 'staff' ? 'bg-cyan/20 text-cyan border border-cyan/25' : 'text-text-muted hover:text-white'
          }`}
        >
          <Users className="w-4 h-4" /> {t('dashboard:staff.tab_staff')}
        </button>
        <button
          onClick={() => setTab('attendance')}
          className={`px-5 py-2 rounded-lg text-sm font-medium transition-all duration-180 flex items-center gap-2 ${
            tab === 'attendance' ? 'bg-lime/20 text-lime border border-lime/25' : 'text-text-muted hover:text-white'
          }`}
        >
          <MapPin className="w-4 h-4" /> {t('dashboard:staff.tab_attendance')}
        </button>
      </div>

      <div className="glass overflow-hidden">
        {tab === 'staff' ? (
          <div className="overflow-x-auto">
            <table className="ev-table">
              <thead>
                <tr>
                  <th>{t('dashboard:staff.table_staff.employee')}</th>
                  <th>{t('dashboard:staff.table_staff.position')}</th>
                  <th>{t('dashboard:staff.table_staff.shift')}</th>
                  <th>{t('dashboard:staff.table_staff.status')}</th>
                  <th>{t('dashboard:staff.table_staff.action')}</th>
                </tr>
              </thead>
              <tbody>
                {loadingStaff ? (
                   <tr><td colSpan={5} className="text-center py-8 text-text-muted">{t('common:common.loading')}</td></tr>
                ) : staffList?.map((s) => (
                  <motion.tr key={s.userId} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                    <td>
                      <p className="text-white font-medium">{s.User?.fullName || t('dashboard:staff.not_updated')}</p>
                      <p className="text-xs text-text-muted">{s.User?.email}</p>
                    </td>
                    <td>
                      <span className="badge badge-info">{t(`dashboard:data.staff.POSITION_${s.position}`)}</span>
                    </td>
                    <td><span className="badge badge-muted">{t(`dashboard:data.staff.SHIFT_${s.shift}`)}</span></td>
                    <td>
                      <span className={`badge ${s.status === 'ACTIVE' ? 'badge-success' : 'badge-danger'}`}>
                        {t(`dashboard:data.status.${s.status}`)}
                      </span>
                    </td>
                    <td>
                      <button className="text-cyan text-xs font-medium hover:underline">{t('common:common.edit')}</button>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="ev-table">
              <thead>
                <tr>
                  <th>{t('dashboard:staff.table_att.employee')}</th>
                  <th>{t('dashboard:staff.table_att.station')}</th>
                  <th>{t('dashboard:staff.table_att.checkin')}</th>
                  <th>{t('dashboard:staff.table_att.checkout')}</th>
                  <th>{t('dashboard:staff.table_att.gps')}</th>
                </tr>
              </thead>
              <tbody>
                {loadingAtt ? (
                   <tr><td colSpan={5} className="text-center py-8 text-text-muted">{t('common:common.loading')}</td></tr>
                ) : attendanceList?.map((a) => (
                  <motion.tr key={a.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                    <td className="text-white font-medium">{a.User?.fullName || a.userId.slice(0,8)}</td>
                    <td className="font-mono text-xs">{a.stationId ? a.stationId.slice(0,8) : '—'}</td>
                    <td>
                      <div className="flex items-center gap-1.5 text-xs">
                        <Clock className="w-3.5 h-3.5 text-success" />
                        {new Date(a.checkInTime).toLocaleTimeString()}
                      </div>
                      <p className="text-[10px] text-text-muted mt-0.5">{new Date(a.checkInTime).toLocaleDateString()}</p>
                    </td>
                    <td>
                      {a.checkOutTime ? (
                        <div className="flex items-center gap-1.5 text-xs text-text-muted">
                          <Clock className="w-3.5 h-3.5" />
                          {new Date(a.checkOutTime).toLocaleTimeString()}
                        </div>
                      ) : (
                        <span className="badge badge-warning">{t('dashboard:staff.on_shift')}</span>
                      )}
                    </td>
                    <td className="font-mono text-xs text-text-muted">
                      {a.latitude.toFixed(4)}, {a.longitude.toFixed(4)}
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
