import 'package:dartz/dartz.dart';
import '../../../../core/errors/failures.dart';
import '../entities/station_entity.dart';
import '../repositories/i_station_repository.dart';

class GetStationsUseCase {
  final IStationRepository repository;

  GetStationsUseCase(this.repository);

  Future<Either<Failure, List<StationEntity>>> call({
    required double lat,
    required double lng,
    required double radiusKm,
    String? connectorType,
    String? status,
  }) async {
    return await repository.getStations(
      lat: lat,
      lng: lng,
      radiusKm: radiusKm,
      connectorType: connectorType,
      status: status,
    );
  }
}
