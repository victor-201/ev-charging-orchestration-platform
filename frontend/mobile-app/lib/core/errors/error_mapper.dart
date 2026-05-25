import 'package:dio/dio.dart';
import 'failures.dart';

/// Maps raw Dio network client exceptions to cohesive UI failures
class ErrorMapper {
  static Failure fromDioException(DioException e) {
    if (e.type == DioExceptionType.connectionError ||
        e.type == DioExceptionType.connectionTimeout ||
        e.type == DioExceptionType.sendTimeout ||
        e.type == DioExceptionType.receiveTimeout ||
        e.type == DioExceptionType.unknown) {
      return const NetworkFailure();
    }

    final statusCode = e.response?.statusCode;
    final data = e.response?.data;
    final message = _extractMessage(data);

    switch (statusCode) {
      case 400:
        final fieldErrors = _extractFieldErrors(data);
        return ValidationFailure(
          message ?? 'Dữ liệu đầu vào không hợp lệ',
          fieldErrors: fieldErrors,
        );
      case 401:
        return UnauthorizedFailure(message ?? 'Email hoặc mật khẩu không chính xác');
      case 403:
        if (data is Map<String, dynamic> && data['code'] == 'EMAIL_NOT_VERIFIED') {
          return EmailNotVerifiedFailure(message ?? 'Vui lòng xác thực email của bạn');
        }
        return PermissionFailure(message ?? 'Không có quyền truy cập');
      case 404:
        return NotFoundFailure(message ?? 'Không tìm thấy dữ liệu');
      case 409:
        return ConflictFailure(message ?? 'Dữ liệu đã tồn tại');
      case 422:
        if (message?.toLowerCase().contains('wallet') == true &&
            message?.toLowerCase().contains('closed') == true) {
          return const WalletClosedFailure();
        }
        return BusinessFailure(message ?? 'Lỗi nghiệp vụ');
      case 423:
        final lockedUntil = _extractLockedUntil(data);
        return AccountLockedFailure(
          message ?? 'Tài khoản bị khóa',
          lockedUntil: lockedUntil,
        );
      case 429:
        final retryAfter = _extractRetryAfter(e.response?.headers);
        return RateLimitFailure(
          message ?? 'Vượt giới hạn yêu cầu',
          retryAfterSeconds: retryAfter,
        );
      case 500:
      default:
        return ServerFailure(message ?? 'Lỗi máy chủ. Vui lòng thử lại sau.');
    }
  }

  static String? _translateMessage(String? msg) {
    if (msg == null) return null;
    final lowerMsg = msg.toLowerCase();

    // Auth & Identity (iam-service)
    if (lowerMsg.contains('invalid email or password') || lowerMsg.contains('invalid credentials')) {
      return 'Email hoặc mật khẩu không chính xác';
    }
    if (lowerMsg.contains('user account is inactive or suspended') || lowerMsg.contains('user_inactive')) {
      return 'Tài khoản người dùng đã bị khóa hoặc tạm ngưng';
    }
    if (lowerMsg.contains('token has expired or been revoked') || lowerMsg.contains('token_expired')) {
      return 'Phiên làm việc đã hết hạn hoặc bị thu hồi';
    }
    if (lowerMsg.contains('invalid verification code')) {
      return 'Mã xác thực không hợp lệ';
    }
    if (lowerMsg.contains('session not found')) {
      return 'Không tìm thấy phiên làm việc';
    }
    if (lowerMsg.contains('insufficient permissions') || lowerMsg.contains('unauthorized')) {
      return 'Không có quyền thực hiện thao tác này';
    }
    if (lowerMsg.contains('must be at least 18 years old')) {
      return 'Người dùng phải từ 18 tuổi trở lên';
    }
    if (lowerMsg.contains('mfa verification required') || lowerMsg.contains('mfa_required')) {
      return 'Yêu cầu xác thực hai lớp (MFA)';
    }
    if (lowerMsg.contains('invalid mfa token')) {
      return 'Mã xác thực hai lớp không hợp lệ';
    }
    if (lowerMsg.contains('mfa is not enabled for this account')) {
      return 'Tài khoản này chưa bật xác thực hai lớp';
    }
    if (lowerMsg.contains('too many login attempts') || lowerMsg.contains('rate_limit_exceeded')) {
      return 'Quá nhiều lần thử đăng nhập. Vui lòng thử lại sau.';
    }
    if (lowerMsg.contains('email address is not verified') || lowerMsg.contains('email_not_verified')) {
      return 'Địa chỉ email chưa được xác thực';
    }
    if (lowerMsg.contains('user already exists') || lowerMsg.contains('user_already_exists')) {
      return 'Tài khoản email này đã được đăng ký trước đó';
    }

    // Profiles & Vehicles
    if (lowerMsg.contains('user profile not found')) {
      return 'Không tìm thấy thông tin hồ sơ người dùng';
    }
    if (lowerMsg.contains('vehicle not found')) {
      return 'Không tìm thấy phương tiện';
    }
    if (lowerMsg.contains('license plate') && lowerMsg.contains('already registered')) {
      return 'Biển số xe này đã được đăng ký trước đó';
    }
    if (lowerMsg.contains('vehicle does not belong to this user')) {
      return 'Phương tiện không thuộc về tài khoản này';
    }
    if (lowerMsg.contains('maximum') && lowerMsg.contains('vehicles allowed')) {
      return 'Đã vượt quá số lượng phương tiện tối đa được đăng ký';
    }
    if (lowerMsg.contains('vehicle model not found or invalid')) {
      return 'Mẫu xe không hợp lệ hoặc không được hỗ trợ';
    }

    // Billing & Wallet (billing-service)
    if (lowerMsg.contains('insufficient balance')) {
      return 'Số dư tài khoản không đủ để thực hiện giao dịch';
    }
    if (lowerMsg.contains('wallet is closed') || lowerMsg.contains('wallet_closed')) {
      return 'Ví điện tử đã bị đóng vĩnh viễn';
    }
    if (lowerMsg.contains('wallet is not active')) {
      return 'Ví điện tử chưa được kích hoạt hoặc đang bị khóa';
    }
    if (lowerMsg.contains('wallet not found')) {
      return 'Không tìm thấy ví. Vui lòng tạo ví trước khi tiếp tục.';
    }
    if (lowerMsg.contains('transaction not found')) {
      return 'Không tìm thấy giao dịch';
    }
    if (lowerMsg.contains('invalid payment signature')) {
      return 'Chữ ký thanh toán không hợp lệ';
    }
    if (lowerMsg.contains('arrear not found')) {
      return 'Không tìm thấy công nợ cần thanh toán';
    }
    if (lowerMsg.contains('plan not found')) {
      return 'Không tìm thấy gói dịch vụ';
    }

    // Bookings & Queue & Session (session-service)
    if (lowerMsg.contains('booking conflict') || lowerMsg.contains('already booked')) {
      return 'Cổng sạc đã được đặt lịch bởi người khác trong khoảng thời gian này';
    }
    if (lowerMsg.contains('cannot create a booking in the past')) {
      return 'Không thể đặt lịch ở thời điểm quá khứ';
    }
    if (lowerMsg.contains('charger') && lowerMsg.contains('does not exist')) {
      return 'Trạm sạc hoặc cổng sạc không tồn tại';
    }
    if (lowerMsg.contains('charger') && lowerMsg.contains('is offline')) {
      return 'Cổng sạc hiện đang ngoại tuyến (offline)';
    }
    if (lowerMsg.contains('starttime and endtime must be date objects')) {
      return 'Thời gian bắt đầu và kết thúc không hợp lệ';
    }
    if (lowerMsg.contains('end_time must be after start_time')) {
      return 'Thời gian kết thúc phải sau thời gian bắt đầu';
    }
    if (lowerMsg.contains('minimum booking duration is 15 minutes')) {
      return 'Thời gian sạc tối thiểu phải từ 15 phút trở lên';
    }
    if (lowerMsg.contains('maximum booking duration is 4 hours')) {
      return 'Thời gian sạc tối đa không quá 4 giờ';
    }
    if (lowerMsg.contains('invalid or expired qr code')) {
      return 'Mã QR không hợp lệ hoặc đã hết hạn';
    }
    if (lowerMsg.contains('qr code does not match this booking')) {
      return 'Mã QR không khớp với lịch đặt chỗ này';
    }
    if (lowerMsg.contains('qr code does not belong to the current account')) {
      return 'Mã QR không thuộc về tài khoản hiện tại';
    }
    if (lowerMsg.contains('no active session for this charger')) {
      return 'Không có phiên sạc nào đang hoạt động trên cổng sạc này';
    }
    if (lowerMsg.contains('you do not have permission to stop this session')) {
      return 'Bạn không có quyền dừng phiên sạc này';
    }
    if (lowerMsg.contains('pricing api http')) {
      return 'Lỗi hệ thống tính toán giá sạc';
    }

    // Default translations for specific status messages
    if (lowerMsg == 'unauthorized') return 'Tài khoản không có quyền truy cập';
    if (lowerMsg == 'forbidden') return 'Yêu cầu bị từ chối truy cập';
    if (lowerMsg == 'not found') return 'Không tìm thấy dữ liệu yêu cầu';
    if (lowerMsg == 'bad request') return 'Yêu cầu không hợp lệ';
    if (lowerMsg == 'internal server error') return 'Lỗi hệ thống từ máy chủ. Vui lòng thử lại sau.';

    return msg;
  }

  static String? _extractMessage(dynamic data) {
    if (data is Map<String, dynamic>) {
      final msg = data['message']?.toString() ?? data['error']?.toString();
      return _translateMessage(msg);
    }
    return null;
  }

  static Map<String, String>? _extractFieldErrors(dynamic data) {
    if (data is Map<String, dynamic> && data['errors'] is Map) {
      return (data['errors'] as Map<String, dynamic>)
          .map((k, v) => MapEntry(k, v.toString()));
    }
    return null;
  }

  static DateTime? _extractLockedUntil(dynamic data) {
    if (data is Map<String, dynamic> && data['lockedUntil'] != null) {
      return DateTime.tryParse(data['lockedUntil'].toString());
    }
    return null;
  }

  static int? _extractRetryAfter(Headers? headers) {
    final value = headers?.value('Retry-After');
    return value != null ? int.tryParse(value) : null;
  }
}
