/**
 * VietnamTranslator – Server-side Vietnamese translation map for FCM notification.title/body.
 *
 * WHY: FCM `notification` object (title/body) is displayed by the OS directly when
 * the app is in background or killed state. These bypass client-side code entirely.
 * So we must send Vietnamese text in the notification layer itself.
 *
 * The original English strings are still sent inside `data.title` and `data.body`
 * for use by the Flutter app when it processes notifications in foreground.
 */

export interface ViTranslationMap {
  title?: string;
  body?: (payload: any) => string;
}

export const VI_NOTIFICATION_TEMPLATES: Record<string, ViTranslationMap> = {
  'booking.created': {
    title: 'Đặt lịch thành công',
    body: (p) =>
      `Lịch sạc #${String(p.bookingId ?? '').slice(0, 8)} đã được tạo. Vui lòng hoàn tất đặt cọc trong 5 phút để xác nhận.`,
  },
  'booking.confirmed': {
    title: 'Lịch sạc được xác nhận',
    body: (p) =>
      `Lịch sạc #${String(p.bookingId ?? '').slice(0, 8)}${p.stationName ? ` tại ${p.stationName}` : ''} đã được xác nhận!`,
  },
  'booking.cancelled': {
    title: 'Lịch sạc đã hủy',
    body: (p) =>
      `Lịch sạc #${String(p.bookingId ?? '').slice(0, 8)} đã bị hủy.${p.reason ? ` Lý do: ${p.reason}` : ''}`,
  },
  'booking.expired': {
    title: 'Lịch sạc đã hết hạn',
    body: () =>
      'Đặt lịch đã tự động hủy do không hoàn tất thanh toán cọc trong 5 phút. Vui lòng kiểm tra số dư ví và đặt lại.',
  },
  'booking.no_show': {
    title: 'Lịch sạc bị hủy do vắng mặt',
    body: () =>
      'Lịch sạc đã bị hủy do không đến đúng giờ hẹn. Trụ sạc đã được giải phóng.',
  },
  'booking.reminder.upcoming': {
    title: 'Sắp đến giờ sạc xe',
    body: (p) => {
      if (p.customBody) {
        const custom = p.customBody as string;
        if (custom.includes('starts in')) {
          const parts = custom.split('starts in');
          const mins = parts[1]?.replace(/minutes\.?.*$/, '').trim() ?? '';
          const short = String(p.bookingId ?? '').slice(0, 8);
          return `Còn ${mins} phút nữa là đến giờ sạc xe của bạn (lịch #${short}). Hãy đến đúng giờ!`;
        }
        if (custom.includes('grace period') || custom.includes('check-in')) {
          const match = /have\s+(\d+)\s+minutes/.exec(custom);
          const mins = match?.[1] ?? 'vài';
          return `Đã quá giờ! Bạn còn ${mins} phút để đến quét mã trước khi lịch bị tự động hủy do vắng mặt.`;
        }
      }
      if (p.startTime) {
        const now = Date.now();
        const start = new Date(p.startTime).getTime();
        const diffMin = Math.round((start - now) / 60000);
        if (diffMin > 0) {
          const short = String(p.bookingId ?? '').slice(0, 8);
          return `Còn ${diffMin} phút nữa là đến giờ sạc xe (lịch #${short}). Hãy đến đúng giờ!`;
        }
      }
      return `Lịch sạc #${String(p.bookingId ?? '').slice(0, 8)} của bạn đã đến. Hãy chuẩn bị đến đúng giờ!`;
    },
  },
  'booking.reminder.payment_expiry': {
    title: 'Sắp hết hạn thanh toán',
    body: () =>
      'Lịch sạc của bạn sẽ bị hủy sau 1 phút nếu không hoàn tất thanh toán cọc. Vui lòng thanh toán ngay!',
  },
  'payment.completed': {
    title: 'Thanh toán thành công',
    body: (p) =>
      `Thanh toán ${Number(p.amount ?? 0).toLocaleString('vi-VN')} VND thành công.`,
  },
  'payment.failed': {
    title: 'Thanh toán thất bại',
    body: (p) =>
      `Thanh toán thất bại.${p.reason ? ` Lý do: ${p.reason}.` : ''} Vui lòng nạp tiền ví và thử lại.`,
  },
  'session.started': {
    title: 'Bắt đầu sạc',
    body: () =>
      'Phiên sạc của bạn đã bắt đầu thành công. Theo dõi thông số sạc trực tiếp trên ứng dụng.',
  },
  'session.telemetry_push': {
    title: 'Cập nhật sạc',
    body: (p) => {
      const power = p.powerKw != null ? `${Number(p.powerKw).toFixed(1)} kW` : '--';
      const soc   = p.socPercent != null ? `${p.socPercent}%` : '--';
      let body = `Công suất: ${power} · SoC: ${soc}`;
      if (p.temperatureC != null) body += ` · Nhiệt độ: ${Number(p.temperatureC).toFixed(1)}°C`;
      return body;
    },
  },
  'session.completed': {
    title: 'Sạc hoàn tất',
    body: (p) =>
      `Bạn đã sạc thành công ${Number(p.kwhConsumed ?? 0).toFixed(2)} kWh trong ${Math.round(p.durationMinutes ?? 0)} phút. Cảm ơn bạn!`,
  },
  'queue.updated': {
    title: 'Cập nhật hàng chờ',
    body: (p) =>
      p.status === 'called'
        ? 'Đến lượt bạn! Vui lòng di chuyển đến trạm sạc ngay.'
        : `Vị trí của bạn trong hàng chờ: #${p.position}. Thời gian chờ ước tính: ${p.estimatedWaitMinutes} phút.`,
  },
  'charger.queue.ready': {
    title: 'Trụ sạc đã sẵn sàng!',
    body: (p) => {
      const chargerClean = p.chargerName ? p.chargerName.replace(/^(trụ sạc|trụ)\s+/i, '') : '';
      const stationClean = p.stationName ? p.stationName.replace(/^trạm\s+/i, '') : '';
      const chargerStr = chargerClean ? `Trụ ${chargerClean}` : 'Trụ sạc';
      const stationStr = stationClean ? ` của trạm ${stationClean}` : '';
      return `${chargerStr}${stationStr} đã sẵn sàng, bạn có muốn tiếp tục đặt lịch không?`;
    },
  },
  'billing.idle_fee_charged': {
    title: 'Phí chiếm dụng trụ sạc',
    body: () =>
      'Xe của bạn đã sạc đầy pin. Vui lòng rút súng sạc để tránh phát sinh thêm phí chiếm dụng trụ sạc.',
  },
  'billing.extra_charge': {
    title: 'Trừ thêm từ ví',
    body: (p) =>
      `Chi phí phiên sạc là ${Number(p.totalFeeVnd ?? 0).toLocaleString('vi-VN')} VND. Đã trừ thêm ${Number(p.extraAmountVnd ?? 0).toLocaleString('vi-VN')} VND từ ví của bạn.`,
  },
  'billing.refund_issued': {
    title: 'Hoàn tiền vào ví',
    body: (p) =>
      `Đã hoàn ${Number(p.refundAmountVnd ?? 0).toLocaleString('vi-VN')} VND tiền cọc thừa về ví của bạn.`,
  },
  'wallet.arrears.created': {
    title: 'Công nợ chưa thanh toán',
    body: (p) =>
      `Bạn đang có công nợ ${Number(p.totalOutstanding ?? p.arrearsAmount ?? 0).toLocaleString('vi-VN')} VND. Vui lòng thanh toán để tiếp tục sử dụng dịch vụ.`,
  },
  'wallet.arrears.cleared': {
    title: 'Công nợ đã thanh toán',
    body: (p) =>
      `Công nợ ${Number(p.clearedAmount ?? 0).toLocaleString('vi-VN')} VND đã được thanh toán xong. Bạn có thể tiếp tục đặt lịch và sạc xe.`,
  },
};

/**
 * Translate an English notification title/body to Vietnamese.
 * Falls back to the provided English string if no translation is found.
 */
export function translateToVietnamese(
  type: string,
  englishTitle: string,
  englishBody: string,
  payload: any,
): { title: string; body: string } {
  const tpl = VI_NOTIFICATION_TEMPLATES[type];

  const viTitle = tpl?.title ?? englishTitle;
  const viBody  = tpl?.body ? tpl.body(payload) : englishBody;

  return { title: viTitle, body: viBody };
}
