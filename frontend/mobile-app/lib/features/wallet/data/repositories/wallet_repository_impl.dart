import 'package:dartz/dartz.dart';
import 'package:dio/dio.dart';
import '../../domain/entities/wallet_entity.dart';
import '../../domain/repositories/i_wallet_repository.dart';
import '../../../../core/constants/api_paths.dart';
import '../../../../core/errors/error_mapper.dart';
import '../../../../core/errors/failures.dart';
import '../../../../core/network/dio_client.dart';

class WalletRepositoryImpl implements IWalletRepository {
  final DioClient _client;

  WalletRepositoryImpl({required DioClient client}) : _client = client;

  @override
  Future<Either<Failure, WalletEntity>> getBalance() async {
    try {
      final response = await _client.get(ApiPaths.walletBalance);
      // API [74]: GET /wallet/balance → { walletId, balance, currency, hasArrears, arrearsAmount, totalTransactionsCount, totalTopUpAmount }
      final raw = response.data;
      final data = raw is Map<String, dynamic> ? raw : <String, dynamic>{};
      return Right(WalletEntity(
        id: (data['walletId'] ?? data['id'])?.toString() ?? '',
        // PostgreSQL NUMERIC may arrive as String — parse safely
        balance: _parseNum(data['balance']) ?? 0,
        hasArrears: data['hasArrears'] == true,
        arrearsAmount: _parseNum(data['arrearsAmount']),
        totalTransactionsCount: _parseNum(data['totalTransactionsCount'])?.toInt() ?? 0,
        totalTopUpAmount: _parseNum(data['totalTopUpAmount']) ?? 0.0,
      ));
    } on DioException catch (e) {
      return Left(ErrorMapper.fromDioException(e));
    }
  }

  @override
  Future<Either<Failure, TopUpResultEntity>> topUp(double amount) async {
    try {
      final response = await _client.post(
        ApiPaths.walletTopup,
        data: {
          'amount': amount,
        },
        withIdempotency: true,
      );
      final data = response.data as Map<String, dynamic>? ?? {};
      return Right(TopUpResultEntity(
        transactionId: data['transactionId']?.toString() ?? '',
        vnpayUrl: data['paymentUrl']?.toString() ?? '',
        status: data['status']?.toString() ?? 'PENDING',
      ));
    } on DioException catch (e) {
      return Left(ErrorMapper.fromDioException(e));
    }
  }

  @override
  Future<Either<Failure, TransactionEntity>> walletPay(
      String transactionId) async {
    try {
      final response = await _client.post(
        ApiPaths.walletPay,
        data: {'transactionId': transactionId},
        withIdempotency: true,
      );
      // API [76]: POST /wallet/pay → { success, newBalance } (flat)
      final raw = response.data;
      final data = raw is Map<String, dynamic> ? raw : <String, dynamic>{};
      return Right(TransactionEntity(
        id: transactionId,
        type: 'PAYMENT',
        amount: _parseNum(data['newBalance']) ?? 0,
        status: data['success'] == true ? 'COMPLETED' : 'FAILED',
        createdAt: DateTime.now(),
      ));
    } on DioException catch (e) {
      return Left(ErrorMapper.fromDioException(e));
    }
  }

  @override
  Future<Either<Failure, List<TransactionEntity>>> getTransactions({
    int page = 1,
    int limit = 20,
    String? type,
  }) async {
    try {
      // API [77]: GET /transactions?limit=&offset=&type= (offset-based, returns flat array)
      final offset = (page - 1) * limit;
      final response = await _client.get(
        ApiPaths.transactions,
        queryParameters: {
          'limit': limit,
          'offset': offset,
          if (type != null && type != 'ALL') 'type': type,
        },
      );
      final raw = response.data;
      final List<dynamic> list = raw is List
          ? raw
          : (raw is Map
              ? ((raw['data'] ?? raw['items'] ?? <dynamic>[]) as List<dynamic>)
              : <dynamic>[]);
      return Right(list
          .map((e) => _parseTransaction(e as Map<String, dynamic>))
          .toList());
    } on DioException catch (e) {
      return Left(ErrorMapper.fromDioException(e));
    }
  }

  @override
  Future<Either<Failure, void>> payArrears() async {
    try {
      await _client.post(
        ApiPaths.walletPayArrears,
        withIdempotency: true,
      );
      return const Right(null);
    } on DioException catch (e) {
      return Left(ErrorMapper.fromDioException(e));
    }
  }

  @override
  Future<Either<Failure, TopUpResultEntity>> payArrearsVNPay() async {
    try {
      final response = await _client.post(
        ApiPaths.walletPayArrearsVNPay,
        withIdempotency: true,
      );
      final data = response.data as Map<String, dynamic>? ?? {};
      return Right(TopUpResultEntity(
        transactionId: data['transactionId']?.toString() ?? '',
        vnpayUrl: data['paymentUrl']?.toString() ?? '',
        status: 'PENDING',
      ));
    } on DioException catch (e) {
      return Left(ErrorMapper.fromDioException(e));
    }
  }

  @override
  Future<Either<Failure, SessionPaymentResultEntity>> sessionPay({
    required double amount,
    required String sessionId,
  }) async {
    try {
      final response = await _client.post(
        ApiPaths.paymentsPay,
        data: {
          'amount': amount,
          'currency': 'VND',
          'description': 'Thanh toán phiên sạc',
          'metadata': {'sessionId': sessionId},
        },
        withIdempotency: true,
      );
      final data = response.data as Map<String, dynamic>? ?? {};
      return Right(SessionPaymentResultEntity(
        method: data['method']?.toString() ?? 'gateway',
        transactionId: data['transactionId']?.toString() ?? '',
        paymentUrl: data['paymentUrl']?.toString(),
        balanceAfter: data['balanceAfter'] != null
            ? double.tryParse(data['balanceAfter'].toString())
            : null,
        status: data['status']?.toString() ?? 'PENDING',
      ));
    } on DioException catch (e) {
      return Left(ErrorMapper.fromDioException(e));
    }
  }

  TransactionEntity _parseTransaction(Map<String, dynamic> data) {
    final rawMeta = data['meta'] ?? data['_meta'];
    final Map<String, dynamic>? parsedMeta = rawMeta is Map<String, dynamic>
        ? rawMeta
        : null;

    return TransactionEntity(
      id: data['id']?.toString() ?? '',
      type: (data['type']?.toString() ?? 'payment').toUpperCase(),
      amount: _parseNum(data['amount']) ?? 0,
      status: (data['status']?.toString() ?? data['_status']?.toString() ?? 'PENDING').toUpperCase(),
      createdAt: data['createdAt'] != null
          ? DateTime.parse(data['createdAt'].toString())
          : DateTime.now(),
      description: (data['description'] ?? data['referenceId'])?.toString(),
      sessionId: data['sessionId']?.toString(),
      method: (data['method']?.toString() ?? 'wallet'),
      relatedId: (data['relatedId'] ?? data['_relatedId'])?.toString(),
      relatedType: (data['relatedType'] ?? data['_relatedType'])?.toString(),
      referenceCode: (data['referenceCode'] ?? data['_referenceCode'])?.toString(),
      meta: parsedMeta,
    );
  }

  /// Safely converts a value that may be a [num] or a [String] to [double].
  /// PostgreSQL NUMERIC/DECIMAL columns are serialised as Strings in JSON
  /// to avoid floating-point precision loss.
  double? _parseNum(dynamic value) {
    if (value == null) return null;
    if (value is num) return value.toDouble();
    return double.tryParse(value.toString());
  }
}
