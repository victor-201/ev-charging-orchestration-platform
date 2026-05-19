import 'package:dartz/dartz.dart';
import '../../../../core/errors/failures.dart';
import '../entities/station_entity.dart';
import '../repositories/i_station_repository.dart';

class SearchStationsUseCase {
  final IStationRepository repository;

  SearchStationsUseCase(this.repository);

  Future<Either<Failure, List<StationEntity>>> call(
    String keyword, {
    int limit = 8,
    String? connectorType,
  }) async {
    return await repository.searchStations(
      keyword,
      limit: limit,
      connectorType: connectorType,
    );
  }
}
