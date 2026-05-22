import 'package:equatable/equatable.dart';

/// Domain entity representing real-time charger queues
class QueuePositionEntity extends Equatable {
  final int position;
  final int estimatedWaitMinutes; // position × 45

  const QueuePositionEntity({
    required this.position,
    required this.estimatedWaitMinutes,
  });

  @override
  List<Object?> get props => [position];
}
