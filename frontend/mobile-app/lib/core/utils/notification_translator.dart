import 'dart:ui' as ui;

class NotificationTranslator {
  static bool get _isVietnamese {
    final locale = ui.PlatformDispatcher.instance.locale;
    return locale.languageCode == 'vi';
  }

  static String translateTitle(String type, String defaultTitle) {
    // English locale → return original English title from server
    if (!_isVietnamese) return defaultTitle;

    switch (type) {
      case 'booking_confirmed':
      case 'booking.confirmed':
        return 'Lịch sạc được xác nhận';
      case 'booking_no_show':
      case 'booking.no_show':
        return 'Lịch sạc bị hủy do quá giờ hẹn';
      case 'booking.expired':
      case 'booking_expired':
        return 'Lịch sạc đã hết hạn thanh toán';
      case 'charging_started':
      case 'session.started':
        return 'Bắt đầu sạc';
      case 'charging_completed':
      case 'session.completed':
        return 'Sạc hoàn tất';
      case 'payment_success':
      case 'payment.completed':
        return 'Thanh toán thành công';
      case 'payment.failed':
        return 'Thanh toán thất bại';
      case 'booking.reminder.upcoming':
        return 'Sắp đến giờ sạc xe';
      case 'booking.reminder.payment_expiry':
        return 'Sắp hết hạn thanh toán';
      case 'booking.created':
        return 'Đặt lịch thành công';
      case 'booking.cancelled':
        return 'Lịch sạc đã hủy';
      case 'session.telemetry_push':
      case 'session.telemetry':
        return 'Cập nhật sạc';
      case 'idle_fee_started':
      case 'billing.idle_fee_charged':
        return 'Phí chiếm dụng trụ sạc';
      case 'billing.extra_charge':
        return 'Trừ thêm từ ví';
      case 'billing.refund_issued':
        return 'Hoàn tiền vào ví';
      case 'charger.fault':
      case 'charger_fault':
        return 'Sự cố trạm sạc';
      case 'queue.updated':
      case 'queue_updated':
        return 'Cập nhật hàng chờ';
      case 'wallet.arrears.created':
      case 'arrears_created':
        return 'Công nợ chưa thanh toán';
      case 'wallet.arrears.cleared':
        return 'Công nợ đã thanh toán';
      case 'charger.queue.ready':
        return 'Trụ sạc đã sẵn sàng';
      default:
        final lower = defaultTitle.toLowerCase();
        if (lower.contains('created')) return 'Đặt lịch thành công';
        if (lower.contains('confirmed')) return 'Lịch sạc được xác nhận';
        if (lower.contains('cancelled')) return 'Lịch sạc đã hủy';
        if (lower.contains('expired')) return 'Lịch sạc đã hết hạn thanh toán';
        if (lower.contains('no-show') || lower.contains('no show')) return 'Lịch sạc bị hủy do quá giờ hẹn';
        if (lower.contains('successful') || lower.contains('completed')) return 'Thanh toán thành công';
        if (lower.contains('failed')) return 'Thanh toán thất bại';
        if (lower.contains('started')) return 'Bắt đầu sạc';
        if (lower.contains('fault') || lower.contains('error')) return 'Sự cố trạm sạc';
        if (lower.contains('queue') || lower.contains('position')) return 'Cập nhật hàng chờ';
        if (lower.contains('idle') || lower.contains('occupancy')) return 'Phí chiếm dụng trụ sạc';
        if (lower.contains('refund')) return 'Hoàn tiền vào ví';
        if (lower.contains('upcoming') || lower.contains('reminder')) {
          return 'Sắp đến giờ sạc xe';
        }
        return defaultTitle;
    }
  }

  static String translateBody(String type, String defaultBody, Map<String, dynamic> data) {
    // English locale → return original English body from server
    if (!_isVietnamese) return defaultBody;

    final bookingId = data['bookingId'] ?? data['booking_id'] ?? '';
    final shortBookingId = bookingId.length > 8 ? bookingId.substring(0, 8) : bookingId;

    switch (type) {
      case 'booking_confirmed':
      case 'booking.confirmed':
        final stationName = data['stationName'] ?? 'trạm sạc';
        return 'Lịch sạc #$shortBookingId tại $stationName đã được xác nhận!';
      case 'booking_no_show':
      case 'booking.no_show':
        return 'Lịch sạc #$shortBookingId đã bị hủy do không đến đúng giờ. Trụ sạc đã được giải phóng.';
      case 'booking.expired':
      case 'booking_expired':
        return 'Đặt lịch #$shortBookingId đã tự động hủy do không hoàn tất thanh toán cọc trong 5 phút.';
      case 'session.telemetry_push':
      case 'session.telemetry': {
        final power = data['powerKw']?.toStringAsFixed(1) ?? '--';
        final soc = data['socPercent']?.toString() ?? '--';
        final temp = data['temperatureC']?.toStringAsFixed(1);
        var body = 'Công suất: $power kW · SOC: $soc%';
        if (temp != null) body += ' · Nhiệt độ: $temp°C';
        return body;
      }
      case 'charging_started':
      case 'session.started':
        return 'Phiên sạc của bạn đã bắt đầu thành công. Theo dõi thông số telemetry trực tiếp trên app.';
      case 'charging_completed':
      case 'session.completed':
        final kwh = data['kwhConsumed'] ?? '--';
        final dur = data['durationMinutes'] ?? data['durationMin'] ?? '--';
        return 'Bạn đã sạc thành công $kwh kWh trong $dur phút. Cảm ơn bạn!';
      case 'payment_success':
      case 'payment.completed':
        final amount = data['amount'] ?? '';
        return 'Thanh toán tiền cọc $amount VND thành công.';
      case 'payment.failed':
        final reason = data['reason'] ?? '';
        return 'Thanh toán thất bại.${reason.isNotEmpty ? " Lý do: $reason." : ""} Vui lòng nạp tiền ví và đặt lại.';
      case 'booking.reminder.payment_expiry':
        return 'Lịch sạc của bạn sẽ bị hủy sau 1 phút nếu không hoàn tất thanh toán cọc sạc.';
      case 'booking.reminder.upcoming': {
        // Parse from data.customBody if available
        if (data['customBody'] != null) {
          final custom = data['customBody'] as String;
          if (custom.contains('starts in')) {
            final match = RegExp(r'starts in (\d+) minutes').firstMatch(custom);
            final mins = match?.group(1) ?? '';
            return 'Còn $mins phút nữa là đến giờ sạc xe (lịch #$shortBookingId). Hãy đến đúng giờ!';
          }
          if (custom.contains('grace period') || custom.contains('check-in')) {
            final match = RegExp(r'have\s+(\d+)\s+minutes').firstMatch(custom);
            final mins = match?.group(1) ?? 'vài';
            return 'Đã quá giờ! Bạn còn $mins phút để đến quét mã trước khi lịch bị tự động hủy do vắng mặt.';
          }
        }
        // Parse from the body itself (backend sends body as part of FCM data)
        if (defaultBody.contains('starts in')) {
          final match = RegExp(r'starts in (\d+) minutes').firstMatch(defaultBody);
          final mins = match?.group(1) ?? '';
          return 'Còn $mins phút nữa là đến giờ sạc xe (lịch #$shortBookingId). Hãy đến đúng giờ!';
        }
        if (defaultBody.contains('grace period') || defaultBody.contains('check-in') || defaultBody.contains('You have')) {
          final match = RegExp(r'have\s+(\d+)\s+minutes').firstMatch(defaultBody);
          final mins = match?.group(1) ?? 'vài';
          return 'Đã quá giờ! Bạn còn $mins phút để đến quét mã trước khi lịch bị tự động hủy do vắng mặt.';
        }
        return 'Lịch sạc #$shortBookingId của bạn đã đến. Hãy chuẩn bị đến đúng giờ!';
      }
      case 'booking.created':
        return 'Lịch sạc #$shortBookingId đã được tạo thành công. Vui lòng hoàn tất đặt cọc trong 5 phút để xác nhận.';
      case 'booking.cancelled':
        final reason = data['reason'] ?? '';
        return 'Lịch sạc #$shortBookingId đã bị hủy.${reason.isNotEmpty ? " Lý do: $reason" : ""}';
      case 'idle_fee_started':
      case 'billing.idle_fee_charged':
        return 'Xe của bạn đã sạc đầy pin. Vui lòng rút súng sạc để tránh phát sinh phí chiếm dụng trụ sạc.';
      case 'billing.extra_charge':
        final extra = data['extraAmountVnd'] ?? '';
        return 'Đã trừ thêm $extra VND từ ví cho chi phí sạc thực tế.';
      case 'billing.refund_issued':
        final refund = data['refundAmountVnd'] ?? '';
        return 'Đã hoàn $refund VND tiền cọc thừa về ví của bạn.';
      case 'charger.fault':
      case 'charger_fault':
        final errCode = data['errorCode'] ?? '';
        return 'Trạm sạc đang gặp sự cố${errCode.isNotEmpty ? " (mã: $errCode)" : ""}. Nhân viên đang xử lý.';
      case 'queue.updated':
      case 'queue_updated':
        final position = data['position'] ?? '';
        final waitMin = data['estimatedWaitMinutes'] ?? '';
        final status = data['status'] as String? ?? '';
        if (status == 'called') {
          return 'Đến lượt bạn! Vui lòng di chuyển đến trạm sạc ngay.';
        }
        return 'Vị trí hiện tại của bạn trong hàng chờ: #$position. Thời gian chờ ước tính: $waitMin phút.';
      case 'wallet.arrears.created':
      case 'arrears_created': {
        final amount = data['totalOutstanding'] ?? data['arrearsAmount'] ?? '';
        return 'Bạn đang có công nợ $amount VND. Vui lòng thanh toán để tiếp tục sử dụng dịch vụ.';
      }
      case 'wallet.arrears.cleared': {
        final amount = data['clearedAmount'] ?? '';
        return 'Công nợ $amount VND đã được thanh toán. Bạn có thể tiếp tục đặt lịch và sạc xe.';
      }
      case 'charger.queue.ready': {
        final stationName = data['stationName'] as String? ?? '';
        final chargerName = data['chargerName'] as String? ?? '';
        final chargerClean = chargerName.replaceAll(RegExp(r'^(trụ sạc|trụ)\s+', caseSensitive: false), '');
        final stationClean = stationName.replaceAll(RegExp(r'^trạm\s+', caseSensitive: false), '');
        final chargerStr = chargerClean.isNotEmpty ? 'Trụ $chargerClean' : 'Trụ sạc';
        final stationStr = stationClean.isNotEmpty ? ' của trạm $stationClean' : '';
        return '$chargerStr$stationStr đã sẵn sàng, bạn có muốn tiếp tục đặt lịch không?';
      }
      default:
        var body = defaultBody;
        if (body.toLowerCase().contains('no-show') || body.toLowerCase().contains('no show')) {
          return 'Đơn đặt chỗ của bạn đã bị hủy do bạn không đến đúng giờ hẹn. Chỗ sạc đã được giải phóng cho khách hàng khác.';
        }
        if (body.toLowerCase().contains('expired') && (body.toLowerCase().contains('deposit') || body.toLowerCase().contains('unpaid'))) {
          return 'Đơn đặt chỗ của bạn đã tự động hủy do không thanh toán tiền đặt cọc trong 5 phút. Vui lòng kiểm tra số dư ví và đặt lại.';
        }
        if (body.contains('Booking #')) {
          body = body.replaceAll('Booking #', 'Đặt lịch #');
        }
        if (body.contains('has been created')) {
          body = body.replaceAll('has been created', 'đã được tạo thành công');
        }
        if (body.contains('has been confirmed')) {
          body = body.replaceAll('has been confirmed', 'đã được xác nhận');
        }
        if (body.contains('has been cancelled')) {
          body = body.replaceAll('has been cancelled', 'đã bị hủy');
        }
        if (body.contains('starts in')) {
          final match = RegExp(r'starts in (\d+) minutes').firstMatch(body);
          final mins = match?.group(1) ?? '';
          body = 'Còn $mins phút nữa là đến giờ đặt lịch sạc xe của bạn. Hãy đến đúng giờ!';
        }
        if (body.contains('grace period') || body.contains('check-in')) {
          final match = RegExp(r'have\s+(\d+)\s+minutes').firstMatch(body);
          final mins = match?.group(1) ?? 'N';
          body = 'Đã quá giờ sạc xe! Bạn còn $mins phút để đến quét mã trước khi lịch bị tự động hủy do vắng mặt.';
        }
        if (body.contains('Your turn') || body.contains("It's your turn")) {
          body = 'Đến lượt bạn! Vui lòng di chuyển đến trạm sạc ngay.';
        }
        if (body.contains('is now ready') || body.contains('continue booking')) {
          final stationName = data['stationName'] ?? '';
          final chargerName = data['chargerName'] ?? '';
          final chargerClean = chargerName.replaceAll(RegExp(r'^(trụ sạc|trụ)\s+', caseSensitive: false), '');
          final stationClean = stationName.replaceAll(RegExp(r'^trạm\s+', caseSensitive: false), '');
          final chargerStr = chargerClean.isNotEmpty ? 'Trụ $chargerClean' : 'Trụ sạc';
          final stationStr = stationClean.isNotEmpty ? ' của trạm $stationClean' : '';
          body = '$chargerStr$stationStr đã sẵn sàng, bạn có muốn tiếp tục đặt lịch không?';
        }
        if (body.contains('position in queue') || body.contains('Estimated wait')) {
          final pos = data['position'] ?? '';
          final wait = data['estimatedWaitMinutes'] ?? '';
          body = 'Vị trí hiện tại của bạn trong hàng chờ: #$pos. Thời gian chờ ước tính: $wait phút.';
        }
        if (body.contains('Occupancy fee') || body.contains('idle fee') || body.contains('Idle Fee')) {
          body = 'Xe của bạn đã sạc đầy pin. Vui lòng rút súng sạc để tránh phát sinh phí chiếm dụng trụ sạc.';
        }
        if (body.contains('charged') && body.contains('VND') && (body.contains('extra') || body.contains('total'))) {
          body = 'Đã trừ thêm chi phí từ ví cho phiên sạc thực tế.';
        }
        if (body.contains('Refund') || body.contains('refund')) {
          body = 'Đã hoàn tiền cọc thừa về ví của bạn.';
        }
        return body;
    }
  }
}
