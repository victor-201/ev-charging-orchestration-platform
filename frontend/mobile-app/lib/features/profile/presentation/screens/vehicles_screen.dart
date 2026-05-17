import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../bloc/profile_bloc.dart';
import '../../domain/entities/profile_entity.dart';
import '../../../../core/design_system/app_colors.dart';
import '../../../../core/design_system/app_theme.dart';
import '../../../../core/design_system/app_typography.dart';
import '../../../../core/design_system/ev_button.dart';

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
    return Scaffold(
      appBar: AppBar(
        title: const Text('Phương tiện của tôi'),
        actions: [
          IconButton(
            icon: const Icon(Icons.add_circle_outline),
            onPressed: () => _showAddVehicleDialog(context),
          ),
        ],
      ),
      body: BlocConsumer<ProfileBloc, ProfileState>(
        listener: (context, state) {
          if (state is ProfileError) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(state.message), backgroundColor: AppColors.error));
          if (state is ProfileSuccess) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(state.message), backgroundColor: AppColors.chargerAvailable));
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
            padding: const EdgeInsets.all(AppSpacing.lg),
            itemCount: vehicles.length,
            separatorBuilder: (_, __) => const SizedBox(height: AppSpacing.sm),
            itemBuilder: (_, i) => _VehicleCard(
              vehicle: vehicles[i],
              onSetPrimary: () => context.read<ProfileBloc>().add(VehicleSetPrimary(id: vehicles[i].id)),
              onDelete: () => _confirmDelete(context, vehicles[i]),
              onAutoCharge: () => _showAutoChargeDialog(context, vehicles[i]),
            ),
          );
        },
      ),
    );
  }

  void _showAddVehicleDialog(BuildContext context) {
    final plateCtrl  = TextEditingController();
    final modelCtrl  = TextEditingController();
    final brandCtrl  = TextEditingController();
    final battCtrl   = TextEditingController();
    String connector = 'CCS';

    showModalBottomSheet(
      context: context, isScrollControlled: true,
      builder: (_) => StatefulBuilder(
        builder: (ctx, setModalState) => Padding(
          padding: EdgeInsets.only(
            left: AppSpacing.lg, right: AppSpacing.lg, top: AppSpacing.lg,
            bottom: MediaQuery.of(context).viewInsets.bottom + AppSpacing.lg,
          ),
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('Thêm phương tiện', style: AppTypography.headingMd),
            const SizedBox(height: AppSpacing.lg),
            TextField(controller: plateCtrl, decoration: const InputDecoration(labelText: 'Biển số xe')),
            const SizedBox(height: AppSpacing.sm),
            TextField(controller: brandCtrl, decoration: const InputDecoration(labelText: 'Hãng xe')),
            const SizedBox(height: AppSpacing.sm),
            TextField(controller: modelCtrl, decoration: const InputDecoration(labelText: 'Mẫu xe')),
            const SizedBox(height: AppSpacing.sm),
            DropdownButtonFormField<String>(
              initialValue: connector,
              decoration: const InputDecoration(labelText: 'Đầu sạc'),
              items: ['CCS', 'CHAdeMO', 'Type2', 'GB/T', 'Other']
                  .map((c) => DropdownMenuItem(value: c, child: Text(c))).toList(),
              onChanged: (v) => setModalState(() => connector = v ?? 'CCS'),
            ),
            const SizedBox(height: AppSpacing.sm),
            TextField(controller: battCtrl, decoration: const InputDecoration(labelText: 'Dung lượng pin (kWh)'), keyboardType: TextInputType.number),
            const SizedBox(height: AppSpacing.xl),
            EVButton(
              label: 'Thêm phương tiện',
              onPressed: () {
                final kwh = double.tryParse(battCtrl.text) ?? 0;
                if (plateCtrl.text.isEmpty || modelCtrl.text.isEmpty) return;
                Navigator.pop(context);
                context.read<ProfileBloc>().add(VehicleAdd(
                  plateNumber: plateCtrl.text, model: modelCtrl.text,
                  brand: brandCtrl.text, connectorType: connector, batteryCapacityKwh: kwh,
                ));
              },
            ),
          ]),
        ),
      ),
    );
  }

  void _confirmDelete(BuildContext context, VehicleEntity v) {
    showDialog(context: context, builder: (_) => AlertDialog(
      title: const Text('Xoá phương tiện?'),
      content: Text('Xoá ${v.plateNumber}?'),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: const Text('Không')),
        TextButton(
          onPressed: () { Navigator.pop(context); context.read<ProfileBloc>().add(VehicleDelete(id: v.id)); },
          child: Text('Xoá', style: TextStyle(color: AppColors.error)),
        ),
      ],
    ));
  }

  void _showAutoChargeDialog(BuildContext context, VehicleEntity v) {
    final ctrl = TextEditingController(text: v.macAddress ?? '');
    showDialog(context: context, builder: (_) => AlertDialog(
      title: const Text('Cấu hình AutoCharge'),
      content: TextField(controller: ctrl, decoration: const InputDecoration(labelText: 'MAC Address', hintText: 'XX:XX:XX:XX:XX:XX')),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: const Text('Huỷ')),
        TextButton(
          onPressed: () { Navigator.pop(context); context.read<ProfileBloc>().add(VehicleSetAutoCharge(id: v.id, macAddress: ctrl.text)); },
          child: const Text('Lưu'),
        ),
      ],
    ));
  }
}

class _VehicleCard extends StatelessWidget {
  final VehicleEntity vehicle;
  final VoidCallback onSetPrimary, onDelete, onAutoCharge;
  const _VehicleCard({required this.vehicle, required this.onSetPrimary, required this.onDelete, required this.onAutoCharge});

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
      Text('${vehicle.brand} ${vehicle.model} · ${vehicle.connectorType} · ${vehicle.batteryCapacityKwh}kWh',
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
        const Spacer(),
        IconButton(icon: const Icon(Icons.delete_outline, color: AppColors.error), onPressed: onDelete),
      ]),
    ]),
  );
}
