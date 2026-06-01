import 'package:equatable/equatable.dart';

class WalletEntity extends Equatable {
  final String id;
  final double balance; // VND
  final bool hasArrears;
  final double? arrearsAmount;
  final int totalTransactionsCount;
  final double totalTopUpAmount;

  const WalletEntity({
    required this.id,
    required this.balance,
    required this.hasArrears,
    this.arrearsAmount,
    this.totalTransactionsCount = 0,
    this.totalTopUpAmount = 0.0,
  });

  @override
  List<Object?> get props => [id, balance, hasArrears, totalTransactionsCount, totalTopUpAmount];
}

class TransactionEntity extends Equatable {
  final String id;
  final String type; // TOPUP | PAYMENT | REFUND | PENALTY
  final double amount;
  final String status; // PENDING | COMPLETED | FAILED | REFUNDED
  final DateTime createdAt;
  final String? description;
  final String? sessionId;
  final String method;
  final String? relatedId;
  final String? relatedType;
  final String? referenceCode;
  final Map<String, dynamic>? meta;

  const TransactionEntity({
    required this.id,
    required this.type,
    required this.amount,
    required this.status,
    required this.createdAt,
    this.description,
    this.sessionId,
    this.method = 'wallet',
    this.relatedId,
    this.relatedType,
    this.referenceCode,
    this.meta,
  });

  bool get isCredit =>
      type == 'TOPUP' || type == 'REFUND';

  @override
  List<Object?> get props => [
        id,
        type,
        amount,
        status,
        method,
        relatedId,
        relatedType,
        referenceCode,
      ];
}

class TopUpResultEntity extends Equatable {
  final String transactionId;
  final String vnpayUrl;
  final String status;

  const TopUpResultEntity({
    required this.transactionId,
    required this.vnpayUrl,
    required this.status,
  });

  @override
  List<Object?> get props => [transactionId, vnpayUrl];
}
