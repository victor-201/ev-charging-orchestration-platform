import 'package:equatable/equatable.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../../domain/entities/wallet_entity.dart';
import '../../domain/repositories/i_wallet_repository.dart';

/// Wallet Management Business Logic Component (BLoC)
///
/// Coordinates all states and operations related to user wallets, including balance checks,
/// top-up gateway redirections, transaction log paginations, and arrears payments.
part 'wallet_event.dart';
part 'wallet_state.dart';

class WalletBloc extends Bloc<WalletEvent, WalletState> {
  final IWalletRepository _repository;

  WalletBloc({required IWalletRepository repository})
      : _repository = repository,
        super(const WalletInitial()) {
    on<WalletLoad>(_onLoad);
    on<WalletTopUpInitiate>(_onTopUp);
    on<WalletLoadTransactions>(_onLoadTransactions);
    on<WalletPayArrears>(_onPayArrears);
    on<WalletPayArrearsVNPayInitiate>(_onPayArrearsVNPay);
  }

  /// Full reload: fetches wallet balance (including DB stats) + first page of transactions.
  /// `WalletLoad` no longer accepts a type filter — stats must always reflect ALL data,
  /// so we load all transactions for page 1 with no type filter here.
  Future<void> _onLoad(
      WalletLoad event, Emitter<WalletState> emit) async {
    emit(const WalletLoading());
    final balanceResult = await _repository.getBalance();
    final txResult =
        await _repository.getTransactions(page: 1, limit: 20);

    balanceResult.fold(
      (f) => emit(WalletError(message: f.message)),
      (wallet) {
        txResult.fold(
          (f) => emit(WalletLoaded(wallet: wallet, transactions: const [])),
          (txs) => emit(WalletLoaded(
            wallet: wallet,
            transactions: txs,
            hasMorePages: txs.length == 20,
          )),
        );
      },
    );
  }

  /// Partial reload: only refetches the transaction list (filter or pagination).
  /// Emits [WalletTransactionsLoading] first — the wallet card, stats boxes, and
  /// filter pills stay visible so the user experience is smooth.
  Future<void> _onLoadTransactions(
      WalletLoadTransactions event, Emitter<WalletState> emit) async {
    final current = state;

    // Determine the wallet object to preserve
    WalletEntity? currentWallet;
    List<TransactionEntity> currentTxs = const [];
    if (current is WalletLoaded) {
      currentWallet = current.wallet;
      currentTxs = current.transactions;
    } else if (current is WalletTransactionsLoading) {
      currentWallet = current.wallet;
      currentTxs = current.transactions;
    }

    if (currentWallet == null) return; // Safety guard — WalletLoad must go first.

    // For page 1 (filter change), clear old items in the loading state.
    // For page > 1 (infinite scroll), keep existing items visible.
    final loadingTxs = event.page == 1 ? const <TransactionEntity>[] : currentTxs;
    emit(WalletTransactionsLoading(wallet: currentWallet, transactions: loadingTxs));

    final result = await _repository.getTransactions(
        page: event.page, limit: 20, type: event.type);

    result.fold(
      (f) {
        // Restore to WalletLoaded with current data on error, don't show full error screen
        emit(WalletLoaded(
          wallet: currentWallet!,
          transactions: currentTxs,
          hasMorePages: false,
        ));
      },
      (txs) {
        final merged = event.page == 1
            ? txs
            : [...currentTxs, ...txs];
        emit(WalletLoaded(
          wallet: currentWallet!,
          transactions: merged,
          hasMorePages: txs.length == 20,
        ));
      },
    );
  }

  Future<void> _onTopUp(
      WalletTopUpInitiate event, Emitter<WalletState> emit) async {
    emit(const WalletLoading());
    final result = await _repository.topUp(event.amount);
    result.fold(
      (f) => emit(WalletError(message: f.message)),
      (topUp) => emit(WalletTopUpInitiated(
        vnpayUrl: topUp.vnpayUrl,
        transactionId: topUp.transactionId,
      )),
    );
  }

  Future<void> _onPayArrears(
      WalletPayArrears event, Emitter<WalletState> emit) async {
    emit(const WalletLoading());
    final result = await _repository.payArrears();
    result.fold(
      (f) => emit(WalletError(message: f.message)),
      (_) => add(const WalletLoad()),
    );
  }

  Future<void> _onPayArrearsVNPay(
      WalletPayArrearsVNPayInitiate event, Emitter<WalletState> emit) async {
    emit(const WalletLoading());
    final result = await _repository.payArrearsVNPay();
    result.fold(
      (f) => emit(WalletError(message: f.message)),
      (topUp) => emit(WalletTopUpInitiated(
        vnpayUrl: topUp.vnpayUrl,
        transactionId: topUp.transactionId,
      )),
    );
  }
}
