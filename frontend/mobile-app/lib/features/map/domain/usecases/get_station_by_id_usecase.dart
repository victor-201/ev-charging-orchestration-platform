import 'package:dartz/dartz.dart';
import '../../../../core/errors/failures.dart';
import '../entities/station_entity.dart';
import '../repositories/i_station_repository.dart';

class GetStationByIdUseCase {
  final IStationRepository repository;

  GetStationByIdUseCase(this.repository);

  Future<Either<Failure, StationEntity>> call(String id) async {
    return await repository.getStationById(id);
  }
}
