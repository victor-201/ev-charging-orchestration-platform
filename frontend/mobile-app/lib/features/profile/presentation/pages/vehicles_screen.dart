import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../bloc/profile_bloc.dart';
import '../../domain/entities/profile_entity.dart';
import '../../../../core/design_system/theme/app_colors.dart';
import '../../../../core/design_system/theme/app_typography.dart';
import '../../../../core/design_system/widgets/ev_button.dart';
import '../../../../core/design_system/widgets/liquid_glass_scaffold.dart';
import '../../../../core/design_system/widgets/liquid_glass_card.dart';
import '../../../../core/design_system/widgets/ev_header.dart';
import '../../../../core/design_system/widgets/ev_toast.dart';
import 'vehicle_audit_log_screen.dart';

/// Vehicles Registration and Management Screen
///
/// Renders the customer's registered electric vehicles (EVs), allows new vehicle onboarding,
/// configures primary vehicle defaults, and establishes AutoCharge MAC identifiers.
class VehiclesScreen extends StatefulWidget {
  const VehiclesScreen({super.key});
  @override State<VehiclesScreen> createState() => _VehiclesScreenState();
}

class _VehiclesScreenState extends State<VehiclesScreen> {
  @override
  void initState() {
    super.initState();
    context.read<ProfileBloc>().add(const VehicleLoad());
  }

  @override
  Widget build(BuildContext context) {
    return LiquidGlassScaffold(
      extendBodyBehindAppBar: true,
      appBar: EVHeader(
        title: 'Phương tiện của tôi',
        showBackButton: true,
        onBackTapped: () => Navigator.pop(context),
        action: IconButton(
          icon: const Icon(Icons.add_circle_outline),
          onPressed: () => _showAddVehicleDialog(context),
          padding: EdgeInsets.zero,
          constraints: const BoxConstraints(),
        ),
      ),
      child: SafeArea(
        bottom: false,
        child: BlocConsumer<ProfileBloc, ProfileState>(
          listener: (context, state) {
            if (state is ProfileError) EVToast.show(context, message: state.message, isError: true);
            if (state is ProfileSuccess) EVToast.show(context, message: state.message, isError: false);
          },
          builder: (context, state) {
            if (state is ProfileLoading) return const Center(child: CircularProgressIndicator());
            final vehicles = state is ProfileLoaded ? state.vehicles : <VehicleEntity>[];
            if (vehicles.isEmpty) {
              return Center(child: Column(mainAxisSize: MainAxisSize.min, children: [
                const Icon(Icons.electric_car_outlined, size: 72, color: AppColors.grey400),
                const SizedBox(height: AppSpacing.lg),
                Text('Chưa có phương tiện', style: AppTypography.headingMd.copyWith(color: AppColors.grey600)),
                const SizedBox(height: AppSpacing.xl),
                EVButton(label: 'Thêm phương tiện', icon: Icons.add, onPressed: () => _showAddVehicleDialog(context)),
              ]));
            }
            return ListView.separated(
              padding: AppLayout.paddingWithHeaderAndNavbar(context),
              itemCount: vehicles.length,
              separatorBuilder: (_, __) => const SizedBox(height: AppSpacing.sm),
              itemBuilder: (_, i) => _VehicleCard(
                vehicle: vehicles[i],
                onSetPrimary: () => context.read<ProfileBloc>().add(VehicleSetPrimary(id: vehicles[i].id)),
                onDelete: () => _confirmDelete(context, vehicles[i]),
                onAutoCharge: () => _showAutoChargeDialog(context, vehicles[i]),
                onHistory: () {
                  Navigator.push(
                    context,
                    MaterialPageRoute(
                      builder: (_) => VehicleAuditLogScreen(
                        vehicleId: vehicles[i].id,
                        plateNumber: vehicles[i].plateNumber,
                      ),
                    ),
                  );
                },
              ),
            );
          },
        ),
      ),
    );
  }

  void _showAddVehicleDialog(BuildContext context) {
    final plateCtrl = TextEditingController();
    final modelCtrl = TextEditingController(); // modelName
    final brandCtrl = TextEditingController();
    final battCtrl  = TextEditingController();
    final colorCtrl = TextEditingController();
    int year = DateTime.now().year;

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (sheetContext) => StatefulBuilder(
        builder: (ctx, setModalState) => Container(
          margin: const EdgeInsets.all(AppSpacing.md),
          child: LiquidGlassCard(
            padding: EdgeInsets.only(
              left: AppSpacing.lg,
              right: AppSpacing.lg,
              top: AppSpacing.lg,
              bottom: MediaQuery.of(ctx).viewInsets.bottom > 0
                  ? (MediaQuery.of(ctx).viewInsets.bottom + AppSpacing.lg)
                  : (AppLayout.bottomPadding(ctx) + AppSpacing.lg),
            ),
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Thêm phương tiện', style: AppTypography.headingMd),
                  const SizedBox(height: AppSpacing.lg),
                  TextField(controller: plateCtrl, decoration: const InputDecoration(labelText: 'Biển số xe')),
                  const SizedBox(height: AppSpacing.sm),
                  TextField(controller: brandCtrl, decoration: const InputDecoration(labelText: 'Hãng xe (VD: VinFast)')),
                  const SizedBox(height: AppSpacing.sm),
                  // modelName — API field (not "model")
                  TextField(controller: modelCtrl, decoration: const InputDecoration(labelText: 'Mẫu xe (VD: VF8)')),
                  const SizedBox(height: AppSpacing.sm),
                  Row(
                    children: [
                      Expanded(
                        child: DropdownButtonFormField<int>(
                          initialValue: year,
                          decoration: const InputDecoration(labelText: 'Năm sản xuất'),
                          items: List.generate(15, (i) => DateTime.now().year - i)
                              .map((y) => DropdownMenuItem(value: y, child: Text('$y')))
                              .toList(),
                          onChanged: (v) => setModalState(() => year = v ?? DateTime.now().year),
                        ),
                      ),
                      const SizedBox(width: AppSpacing.sm),
                      Expanded(
                        child: TextField(controller: colorCtrl, decoration: const InputDecoration(labelText: 'Màu xe')),
                      ),
                    ],
                  ),
                  const SizedBox(height: AppSpacing.sm),
                  TextField(
                    controller: battCtrl,
                    decoration: const InputDecoration(labelText: 'Dung lượng pin (kWh)'),
                    keyboardType: TextInputType.number,
                  ),
                  const SizedBox(height: AppSpacing.xl),
                  EVButton(
                    label: 'Thêm phương tiện',
                    onPressed: () {
                      final kwh = double.tryParse(battCtrl.text) ?? 0;
                      if (plateCtrl.text.isEmpty || modelCtrl.text.isEmpty || brandCtrl.text.isEmpty) return;
                      Navigator.pop(sheetContext);
                      context.read<ProfileBloc>().add(VehicleAdd(
                        plateNumber: plateCtrl.text,
                        modelName: modelCtrl.text,
                        brand: brandCtrl.text,
                        year: year,
                        color: colorCtrl.text.isNotEmpty ? colorCtrl.text : 'Khác',
                        batteryCapacityKwh: kwh,
                      ));
                    },
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  void _confirmDelete(BuildContext context, VehicleEntity v) {
    showDialog(context: context, builder: (dialogContext) => AlertDialog(
      title: const Text('Xoá phương tiện?'),
      content: Text('Xoá ${v.plateNumber}?'),
      actions: [
        TextButton(onPressed: () => Navigator.pop(dialogContext), child: const Text('Không')),
        TextButton(
          onPressed: () { Navigator.pop(dialogContext); context.read<ProfileBloc>().add(VehicleDelete(id: v.id)); },
          child: Text('Xoá', style: TextStyle(color: AppColors.error)),
        ),
      ],
    ));
  }

  void _showAutoChargeDialog(BuildContext context, VehicleEntity v) {
    final macCtrl = TextEditingController(text: v.macAddress ?? '');
    final vinCtrl = TextEditingController(text: v.vinNumber ?? '');
    bool autochargeEnabled = v.autochargeEnabled;

    final macRegex = RegExp(r'^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$');
    final vinRegex = RegExp(r'^[A-HJ-NPR-Z0-9]{17}$');

    showDialog(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (ctx, setDialogState) {
          final macText = macCtrl.text.trim();
          final vinText = vinCtrl.text.trim();

          // Validation logic
          final isMacValid = macText.isEmpty || macRegex.hasMatch(macText);
          final isVinValid = vinText.isEmpty || (vinText.length == 17 && vinRegex.hasMatch(vinText));
          
          // Must have MAC address if AutoCharge is enabled
          final isFormValid = isMacValid && isVinValid && (!autochargeEnabled || macText.isNotEmpty);

          return AlertDialog(
            title: const Row(
              children: [
                Icon(Icons.bolt, color: AppColors.cyan),
                SizedBox(width: 8),
                Text('Cấu hình AutoCharge'),
              ],
            ),
            content: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Tính năng AutoCharge cho phép tự động nhận diện xe và sạc ngay khi cắm cáp mà không cần quét mã QR.',
                    style: AppTypography.caption.copyWith(color: AppColors.textMuted),
                  ),
                  const SizedBox(height: 16),
                  
                  TextField(
                    controller: macCtrl,
                    textCapitalization: TextCapitalization.characters,
                    decoration: InputDecoration(
                      labelText: 'Địa chỉ MAC đầu sạc',
                      hintText: 'AA:BB:CC:DD:EE:FF',
                      errorText: isMacValid ? null : 'Định dạng MAC không hợp lệ (ví dụ: AA:BB:CC:DD:EE:FF)',
                      prefixIcon: const Icon(Icons.settings_ethernet),
                    ),
                    onChanged: (val) {
                      setDialogState(() {
                        final upper = val.toUpperCase();
                        if (upper != val) {
                          macCtrl.text = upper;
                          macCtrl.selection = TextSelection.fromPosition(TextPosition(offset: upper.length));
                        }
                      });
                    },
                  ),
                  const SizedBox(height: 12),
                  
                  TextField(
                    controller: vinCtrl,
                    textCapitalization: TextCapitalization.characters,
                    maxLength: 17,
                    decoration: InputDecoration(
                      labelText: 'Mã số khung (VIN)',
                      hintText: '17 ký tự chữ và số',
                      counterText: '${vinText.length}/17',
                      errorText: isVinValid ? null : 'VIN không hợp lệ (Đúng 17 ký tự, bỏ qua I, O, Q)',
                      prefixIcon: const Icon(Icons.fingerprint),
                    ),
                    onChanged: (val) {
                      setDialogState(() {
                        final upper = val.toUpperCase();
                        if (upper != val) {
                          vinCtrl.text = upper;
                          vinCtrl.selection = TextSelection.fromPosition(TextPosition(offset: upper.length));
                        }
                      });
                    },
                  ),
                  const SizedBox(height: 8),
                  
                  SwitchListTile(
                    contentPadding: EdgeInsets.zero,
                    title: const Text('Kích hoạt AutoCharge', style: TextStyle(fontWeight: FontWeight.bold)),
                    subtitle: Text(
                      'Tự động sạc và thanh toán hóa đơn khi cắm cáp.',
                      style: AppTypography.caption.copyWith(color: AppColors.textMuted, fontSize: 11),
                    ),
                    value: autochargeEnabled,
                    activeThumbColor: AppColors.cyan,
                    onChanged: (val) {
                      setDialogState(() {
                        autochargeEnabled = val;
                      });
                    },
                  ),
                ],
              ),
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(dialogContext),
                child: const Text('Huỷ', style: TextStyle(color: AppColors.textMuted)),
              ),
              ElevatedButton(
                onPressed: isFormValid
                    ? () {
                        Navigator.pop(dialogContext);
                        context.read<ProfileBloc>().add(VehicleSetAutoCharge(
                          vehicleId: v.id,
                          macAddress: macText.isNotEmpty ? macText : null,
                          vinNumber: vinText.isNotEmpty ? vinText : null,
                          autochargeEnabled: autochargeEnabled,
                        ));
                      }
                    : null,
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.cyan,
                  disabledBackgroundColor: AppColors.textMuted.withValues(alpha: 0.3),
                ),
                child: const Text('Lưu cấu hình', style: TextStyle(color: Colors.white)),
              ),
            ],
          );
        },
      ),
    );
  }
}

class _VehicleCard extends StatelessWidget {
  final VehicleEntity vehicle;
  final VoidCallback onSetPrimary, onDelete, onAutoCharge, onHistory;
  const _VehicleCard({required this.vehicle, required this.onSetPrimary, required this.onDelete, required this.onAutoCharge, required this.onHistory});

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(AppSpacing.lg),
    decoration: BoxDecoration(
      color: Theme.of(context).cardColor,
      borderRadius: BorderRadius.circular(AppRadius.md),
      border: Border.all(color: vehicle.isPrimary ? AppColors.primary : AppColors.outlineLight),
      boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.04), blurRadius: 8)],
    ),
    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Row(children: [
        Icon(Icons.electric_car_outlined, color: vehicle.isPrimary ? AppColors.primary : AppColors.grey600),
        const SizedBox(width: AppSpacing.sm),
        Expanded(child: Text(vehicle.plateNumber, style: AppTypography.headingMd)),
        if (vehicle.isPrimary)
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
            decoration: BoxDecoration(color: AppColors.primary.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(AppRadius.full)),
            child: Text('Chính', style: AppTypography.caption.copyWith(color: AppColors.primary, fontWeight: FontWeight.w600)),
          ),
      ]),
      const SizedBox(height: 4),
      Text('${vehicle.brand} ${vehicle.modelName} · ${vehicle.year} · ${vehicle.color} · ${vehicle.batteryCapacityKwh}kWh',
          style: AppTypography.caption.copyWith(color: AppColors.grey600)),
      if (vehicle.macAddress != null) ...[
        const SizedBox(height: 4),
        Text('AutoCharge: ${vehicle.macAddress}', style: AppTypography.caption.copyWith(color: AppColors.secondary)),
      ],
      const SizedBox(height: AppSpacing.md),
      Row(children: [
        if (!vehicle.isPrimary)
          TextButton.icon(onPressed: onSetPrimary, icon: const Icon(Icons.star_outline, size: 16), label: const Text('Đặt chính')),
        TextButton.icon(onPressed: onAutoCharge, icon: const Icon(Icons.wifi_outlined, size: 16), label: const Text('AutoCharge')),
        const SizedBox(width: AppSpacing.sm),
        IconButton(icon: const Icon(Icons.history_outlined, size: 20), onPressed: onHistory, tooltip: 'Lịch sử hoạt động xe'),
        const Spacer(),
        IconButton(icon: const Icon(Icons.delete_outline, color: AppColors.error), onPressed: onDelete),
      ]),
    ]),
  );
}
