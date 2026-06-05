import 'package:equatable/equatable.dart';

class QueueEntryEntity extends Equatable {
  final int position;
  final String userId;
  final String? fullName;
  final String? email;
  final DateTime joinedAt;
  final bool isCurrentUser;

  const QueueEntryEntity({
    required this.position,
    required this.userId,
    this.fullName,
    this.email,
    required this.joinedAt,
    required this.isCurrentUser,
  });

  @override
  List<Object?> get props => [position, userId, fullName, email, joinedAt, isCurrentUser];
}

/// Domain entity representing real-time charger queues
class QueuePositionEntity extends Equatable {
  final int position;
  final int estimatedWaitMinutes; // position × 45
  final List<QueueEntryEntity> waitingList;

  const QueuePositionEntity({
    required this.position,
    required this.estimatedWaitMinutes,
    required this.waitingList,
  });

  @override
  List<Object?> get props => [position, estimatedWaitMinutes, waitingList];
}

