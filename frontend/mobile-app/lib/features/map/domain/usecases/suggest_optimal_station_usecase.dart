import 'package:dartz/dartz.dart';
import '../../../../core/errors/failures.dart';
import '../entities/station_entity.dart';
import '../repositories/i_station_repository.dart';

class SuggestOptimalStationUseCase {
  final IStationRepository repository;

  SuggestOptimalStationUseCase(this.repository);

  Future<Either<Failure, StationEntity>> call({
    required double lat,
    required double lng,
    String? connectorType,
    String? preference,
  }) async {
    return await repository.suggestOptimalStation(
      lat: lat,
      lng: lng,
      connectorType: connectorType,
      preference: preference,
    );
  }
}
