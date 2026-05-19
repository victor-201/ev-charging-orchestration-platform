import 'package:dartz/dartz.dart';
import '../../../../core/errors/failures.dart';
import '../entities/station_entity.dart';
import '../repositories/i_station_repository.dart';

class GetChargerPricingUseCase {
  final IStationRepository repository;

  GetChargerPricingUseCase(this.repository);

  Future<Either<Failure, PricingEntity>> call({
    required String stationId,
    required String chargerId,
    required String connectorType,
    required DateTime startTime,
    required DateTime endTime,
  }) async {
    return await repository.getChargerPricing(
      stationId: stationId,
      chargerId: chargerId,
      connectorType: connectorType,
      startTime: startTime,
      endTime: endTime,
    );
  }
}
