import 'package:equatable/equatable.dart';

/// Domain entity representing available charger reservation slots
class AvailabilitySlotEntity extends Equatable {
  final DateTime startTime;
  final DateTime endTime;
  final bool isAvailable;

  const AvailabilitySlotEntity({
    required this.startTime,
    required this.endTime,
    required this.isAvailable,
  });

  @override
  List<Object?> get props => [startTime, isAvailable];
}
