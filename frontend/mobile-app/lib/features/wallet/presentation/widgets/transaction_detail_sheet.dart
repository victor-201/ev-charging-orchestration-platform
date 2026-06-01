import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../domain/entities/wallet_entity.dart';
import '../../../../core/design_system/theme/app_colors.dart';
import '../../../../core/design_system/theme/app_layout.dart';
import '../../../../core/design_system/theme/app_typography.dart';
import '../../../../core/design_system/widgets/ev_button.dart';
import '../../../../core/design_system/widgets/ev_toast.dart';
import '../../../../core/utils/vnd_formatter.dart';
import '../../../../core/utils/date_utils.dart' as ev_date;

class TransactionDetailSheet extends StatelessWidget {
  final TransactionEntity tx;

  const TransactionDetailSheet({super.key, required this.tx});

  static Future<void> show(BuildContext context, {required TransactionEntity tx}) {
    return showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => TransactionDetailSheet(tx: tx),
    );
  }

  void _copyToClipboard(BuildContext context, String text, String label) {
    Clipboard.setData(ClipboardData(text: text));
    EVToast.show(context, message: 'Đã sao chép $label!');
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final isCredit = tx.isCredit;
    final amountColor = isCredit ? AppColors.chargerAvailable : AppColors.error;
    final sign = isCredit ? '+' : '-';

    // ── Translate type ──
    String displayType = 'Giao dịch';
    IconData typeIcon = Icons.payment;
    if (tx.type == 'TOPUP') {
      displayType = 'Nạp tiền vào ví';
      typeIcon = Icons.add_circle_outline_rounded;
    } else if (tx.type == 'PAYMENT') {
      displayType = 'Thanh toán dịch vụ';
      typeIcon = Icons.remove_circle_outline_rounded;
    } else if (tx.type == 'REFUND') {
      displayType = 'Hoàn tiền giao dịch';
      typeIcon = Icons.settings_backup_restore_rounded;
    }

    return ClipRRect(
      borderRadius: const BorderRadius.vertical(top: Radius.circular(AppRadius.card)),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 20, sigmaY: 20),
        child: Container(
          decoration: BoxDecoration(
            color: isDark ? AppColors.cardDark : AppColors.cardLight,
            borderRadius: const BorderRadius.vertical(top: Radius.circular(AppRadius.card)),
            border: Border(
              top: BorderSide(
                color: isDark ? AppColors.cardBorderDark : AppColors.cardBorderLight,
                width: 1.5,
              ),
            ),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: isDark ? 0.4 : 0.08),
                blurRadius: 24,
                offset: const Offset(0, -6),
              )
            ],
          ),
          padding: AppLayout.paddingForBottomSheet(context),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // Drag handle bar
              Center(
                child: Container(
                  width: 40,
                  height: 4,
                  decoration: BoxDecoration(
                    color: isDark ? Colors.white30 : Colors.black12,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
          const SizedBox(height: 24),

          // Header Title
          Text(
            'Chi tiết giao dịch',
            style: AppTypography.headingMd,
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 20),

          // Amount display card
          Container(
            padding: const EdgeInsets.symmetric(vertical: 20, horizontal: 16),
            decoration: BoxDecoration(
              color: amountColor.withValues(alpha: 0.08),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: amountColor.withValues(alpha: 0.2)),
            ),
            child: Column(
              children: [
                Text(
                  '$sign${VndFormatter.format(tx.amount)}',
                  style: AppTypography.displayMd.copyWith(
                    color: amountColor,
                    fontWeight: FontWeight.w800,
                  ),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 6),
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(typeIcon, size: 16, color: AppColors.textMuted),
                    const SizedBox(width: 6),
                    Text(
                      displayType,
                      style: AppTypography.bodyMd.copyWith(
                        color: AppColors.textMuted,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),

          // General details list
          _buildInfoSection(context, isDark),
          const SizedBox(height: 24),

          // Action Button
          EVButton(
            label: 'Đóng',
            variant: EVButtonVariant.secondary,
            onPressed: () => Navigator.pop(context),
          ),
        ],
      ),
    ),
  ),
);
}

  Widget _buildInfoSection(BuildContext context, bool isDark) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: isDark ? Colors.black26 : Colors.grey[50],
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: isDark ? Colors.white.withValues(alpha: 0.05) : Colors.grey[200]!,
        ),
      ),
      child: Column(
        children: [
          _buildRow('Mã giao dịch', tx.id, isCopyable: true, onCopy: () => _copyToClipboard(context, tx.id, 'mã giao dịch')),
          _buildDivider(isDark),
          _buildRow('Thời gian', ev_date.DateUtils.formatDateTime(tx.createdAt)),
          _buildDivider(isDark),
          _buildRow('Phương thức', _translateMethod(tx.method)),
          _buildDivider(isDark),
          _buildRow('Trạng thái', 'Thành công', valueColor: AppColors.chargerAvailable, fontWeight: FontWeight.bold),
          
          // Render dynamic meta-based info if present
          if (tx.meta != null && tx.meta!.isNotEmpty) ...[
            _buildDivider(isDark),
            ..._buildMetaRows(context, isDark),
          ] else if (tx.description != null && tx.description!.isNotEmpty) ...[
            _buildDivider(isDark),
            _buildRow('Nội dung', tx.description!),
          ],
        ],
      ),
    );
  }

  List<Widget> _buildMetaRows(BuildContext context, bool isDark) {
    final meta = tx.meta!;
    final reason = meta['reason']?.toString();
    final List<Widget> rows = [];

    // Translate reason
    String description = '';
    if (reason == 'booking_cancelled') {
      description = 'Hoàn trả 100% cọc do hủy lịch đặt trước';
    } else if (reason == 'no_show_partial_refund') {
      description = 'Hoàn trả 80% cọc do không đến sạc (phạt 20%)';
    } else if (reason == 'deposit_overpaid') {
      description = 'Hoàn tiền thừa sau sạc (tiền cọc > phí thực tế)';
    } else if (reason == 'deposit_underpaid') {
      description = 'Thanh toán thêm phí sạc (tiền cọc < phí thực tế)';
    } else if (reason == 'partial_payment') {
      description = 'Thanh toán một phần phí sạc (ví thiếu số dư)';
    } else if (reason == 'idle_fee') {
      description = 'Phí đỗ xe quá giờ (sau khi sạc đầy)';
    } else if (meta['orderInfo'] != null) {
      description = meta['orderInfo'].toString();
    }

    if (description.isNotEmpty) {
      rows.add(_buildRow('Nội dung', description, fontWeight: FontWeight.w600));
    }

    // Original Transaction ID
    final originalTxId = meta['originalTxId']?.toString();
    if (originalTxId != null) {
      if (rows.isNotEmpty) rows.add(_buildDivider(isDark));
      rows.add(_buildRow(
        'Giao dịch gốc',
        originalTxId,
        isCopyable: true,
        onCopy: () => _copyToClipboard(context, originalTxId, 'mã giao dịch gốc'),
      ));
    }

    // Penalty amount
    final penaltyAmt = meta['penaltyAmount'];
    if (penaltyAmt != null) {
      final double? parsedPenalty = double.tryParse(penaltyAmt.toString());
      if (parsedPenalty != null && parsedPenalty > 0) {
        if (rows.isNotEmpty) rows.add(_buildDivider(isDark));
        rows.add(_buildRow(
          'Tiền phạt vi phạm',
          VndFormatter.format(parsedPenalty),
          valueColor: AppColors.error,
          fontWeight: FontWeight.bold,
        ));
      }
    }

    // Idle minutes & stats
    final idleMinutes = meta['chargeableIdleMinutes'];
    if (idleMinutes != null) {
      if (rows.isNotEmpty) rows.add(_buildDivider(isDark));
      rows.add(_buildRow('Thời gian đỗ quá giờ', '$idleMinutes phút'));
    }

    final idleFeeRate = meta['idleFeePerMinuteVnd'];
    if (idleFeeRate != null) {
      final double? parsedRate = double.tryParse(idleFeeRate.toString());
      if (parsedRate != null) {
        if (rows.isNotEmpty) rows.add(_buildDivider(isDark));
        rows.add(_buildRow('Đơn giá đỗ quá giờ', '${VndFormatter.format(parsedRate)}/phút'));
      }
    }

    // Arrears amount
    final arrearsAmt = meta['arrearsAmount'];
    if (arrearsAmt != null) {
      final double? parsedArrears = double.tryParse(arrearsAmt.toString());
      if (parsedArrears != null && parsedArrears > 0) {
        if (rows.isNotEmpty) rows.add(_buildDivider(isDark));
        rows.add(_buildRow(
          'Tiền nợ còn lại',
          VndFormatter.format(parsedArrears),
          valueColor: AppColors.error,
          fontWeight: FontWeight.bold,
        ));
      }
    }

    // Booking ID / Session ID fallback
    final bookingId = meta['bookingId']?.toString() ?? (tx.relatedType == 'booking' ? tx.relatedId : null);
    if (bookingId != null) {
      if (rows.isNotEmpty) rows.add(_buildDivider(isDark));
      rows.add(_buildRow(
        'Mã đặt lịch (Booking)',
        bookingId,
        isCopyable: true,
        onCopy: () => _copyToClipboard(context, bookingId, 'mã đặt lịch'),
      ));
    }

    final sessionId = tx.relatedType == 'charging_session' ? tx.relatedId : null;
    if (sessionId != null) {
      if (rows.isNotEmpty) rows.add(_buildDivider(isDark));
      rows.add(_buildRow(
        'Mã phiên sạc (Session)',
        sessionId,
        isCopyable: true,
        onCopy: () => _copyToClipboard(context, sessionId, 'mã phiên sạc'),
      ));
    }

    return rows;
  }

  Widget _buildRow(
    String label,
    String value, {
    Color? valueColor,
    FontWeight? fontWeight,
    bool isCopyable = false,
    VoidCallback? onCopy,
  }) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Text(label, style: AppTypography.bodyMd.copyWith(color: AppColors.textMuted)),
          const SizedBox(width: 16),
          Flexible(
            child: Row(
              mainAxisSize: MainAxisSize.min,
              mainAxisAlignment: MainAxisAlignment.end,
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                if (!isCopyable)
                  Flexible(
                    child: Text(
                      value,
                      style: AppTypography.bodyMd.copyWith(
                        color: valueColor,
                        fontWeight: fontWeight ?? FontWeight.w500,
                      ),
                      textAlign: TextAlign.end,
                    ),
                  )
                else if (onCopy != null)
                  GestureDetector(
                    onTap: onCopy,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                      decoration: BoxDecoration(
                        color: AppColors.primary.withValues(alpha: 0.1),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: const Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(
                            Icons.copy_rounded,
                            size: 14,
                            color: AppColors.primary,
                          ),
                          SizedBox(width: 6),
                          Text(
                            'Sao chép',
                            style: TextStyle(
                              fontSize: 12,
                              color: AppColors.primary,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildDivider(bool isDark) {
    return Divider(
      height: 12,
      color: isDark ? Colors.white10 : Colors.grey[200],
    );
  }

  String _translateMethod(String method) {
    switch (method.toLowerCase()) {
      case 'wallet':        return 'Ví điện tử EVolt';
      case 'bank_transfer': return 'Chuyển khoản VNPay';
      case 'cash':          return 'Tiền mặt';
      default:              return method;
    }
  }
}
