import 'package:equatable/equatable.dart';

export 'availability_slot_entity.dart';
export 'queue_position_entity.dart';

/// Domain entity representing reservation records
class BookingEntity extends Equatable {
  final String id;
  final String chargerId;
  final String stationId;
  final String connectorType;
  final DateTime startTime;
  final DateTime endTime;
  final String status; // PENDING_PAYMENT | CONFIRMED | COMPLETED | CANCELLED | EXPIRED | NO_SHOW
  final double depositAmount;
  final String? qrToken;
  final double? penaltyAmount; // 20% khi NO_SHOW
  final double? refundAmount;  // 80% khi NO_SHOW, 100% khi CANCELLED

  const BookingEntity({
    required this.id,
    required this.chargerId,
    required this.stationId,
    required this.connectorType,
    required this.startTime,
    required this.endTime,
    required this.status,
    required this.depositAmount,
    this.qrToken,
    this.penaltyAmount,
    this.refundAmount,
  });

  bool get isConfirmed => status == 'CONFIRMED';
  bool get isPendingPayment => status == 'PENDING_PAYMENT';
  bool get isCancellable =>
      status == 'CONFIRMED' || status == 'PENDING_PAYMENT';

  @override
  List<Object?> get props => [id, status, startTime, endTime];
}

class PaymentResultEntity extends Equatable {
  final String method; // 'wallet' or 'gateway'
  final String transactionId;
  final String? paymentUrl;
  final String status;

  const PaymentResultEntity({
    required this.method,
    required this.transactionId,
    this.paymentUrl,
    required this.status,
  });

  @override
  List<Object?> get props => [method, transactionId, paymentUrl, status];
}
