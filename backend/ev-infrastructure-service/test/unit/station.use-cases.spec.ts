import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { Station, StationStatus } from '../../src/domain/entities/station.aggregate';
import { Charger, ChargerStatus, ConnectorType } from '../../src/domain/entities/charger.aggregate';
import {
  InvalidStationDataException, DuplicateGeoLocationException,
  DuplicateExternalIdException, StationNotFoundException,
  ChargerNotFoundException, InvalidStatusTransitionException,
  StationNotActiveException,
} from '../../src/domain/exceptions/station.exceptions';
import {
  CreateStationUseCase, UpdateStationUseCase,
  ListStationsUseCase, GetStationUseCase,
  AddChargerUseCase, UpdateChargerStatusUseCase,
  GetChargersUseCase, GetNearbyStationsUseCase,
} from '../../src/application/use-cases/station.use-cases';
import {
  STATION_REPOSITORY,
} from '../../src/domain/repositories/station.repository.interface';
import { CHARGER_REPOSITORY } from '../../src/domain/repositories/charger.repository.interface';
import { EVENT_BUS } from '../../src/infrastructure/messaging/outbox/outbox-event-bus';
import { RedisAvailabilityCache } from '../../src/infrastructure/cache/redis-availability.cache';

// Mocks

const mockStationRepo = {
  findById:             jest.fn(),
  findByIdWithChargers: jest.fn(),
  findMany:             jest.fn(),
  existsByGeo:          jest.fn(),
  save:                 jest.fn(),
  findCityById:         jest.fn(),
  findAllCities:        jest.fn(),
};

const mockChargerRepo = {
  findById:             jest.fn(),
  findByStationId:      jest.fn(),
  existsByExternalId:   jest.fn(),
  countByStation:       jest.fn(),
  save:                 jest.fn(),
  updateStatus:         jest.fn(),
};

const mockEventBus = { publishAll: jest.fn() };

const mockDataSource = {
  transaction: jest.fn().mockImplementation((cb: (m: any) => any) => cb({})),
};

const mockCity = {
  id: 'city-uuid-1',
  cityName: 'TP.HCM',
  region: 'South',
  countryCode: 'VN',
};

// Helper factories

function makeStation(overrides?: any): Station {
  return Station.reconstitute({
    id:        'station-uuid-1',
    name:      'EV Station Alpha',
    address:   '123 Nguyễn Huệ',
    cityId:    'city-uuid-1',
    latitude:  10.7769,
    longitude: 106.7009,
    status:    StationStatus.ACTIVE,
    ownerId:   'owner-uuid-1',
    ownerName: 'Nguyen Van A',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  }, []);
}

function makeCharger(overrides?: any): Charger {
  return Charger.reconstitute({
    id:         'charger-uuid-1',
    stationId:  'station-uuid-1',
    name:       'CP-01',
    externalId: 'OCPP-001',
    maxPowerKw: 50,
    status:     ChargerStatus.AVAILABLE,
    connectors: [{ id: 'conn-1', chargingPointId: 'charger-uuid-1', connectorType: ConnectorType.CCS, maxPowerKw: 50 }],
    createdAt:  new Date(),
    updatedAt:  new Date(),
    ...overrides,
  });
}

// Domain Layer Tests

describe('Station Aggregate', () => {
  const validProps = {
    name:      'VinFast Station Beta',
    cityId:    'city-uuid-1',
    latitude:  21.0285,
    longitude: 105.8542,
  };

  it('should create station with ACTIVE status and emit StationCreatedEvent', () => {
    const s = Station.create(validProps);
    expect(s.status).toBe(StationStatus.ACTIVE);
    expect(s.domainEvents).toHaveLength(1);
    expect(s.domainEvents[0].eventType).toBe('station.created');
  });

  it('should throw for name shorter than 2 chars', () => {
    expect(() => Station.create({ ...validProps, name: 'X' })).toThrow(InvalidStationDataException);
  });

  it('should throw for invalid latitude', () => {
    expect(() => Station.create({ ...validProps, latitude: 91 })).toThrow(InvalidStationDataException);
  });

  it('should throw for invalid longitude', () => {
    expect(() => Station.create({ ...validProps, longitude: -200 })).toThrow(InvalidStationDataException);
  });

  it('should normalize name (trim whitespace)', () => {
    const s = Station.create({ ...validProps, name: '  Station Beta  ' });
    expect(s.name).toBe('Station Beta');
  });

  it('should emit StationUpdatedEvent on update()', () => {
    const s = Station.create(validProps);
    s.clearDomainEvents();
    s.update({ name: 'New Name Station' });
    expect(s.name).toBe('New Name Station');
    const events = s.domainEvents;
    expect(events[0].eventType).toBe('station.updated');
  });

  it('should throw for update name too short', () => {
    const s = Station.create(validProps);
    expect(() => s.update({ name: 'X' })).toThrow(InvalidStationDataException);
  });

  it('should throw StationNotActiveException when adding charger to non-active station', () => {
    const s = Station.create(validProps);
    s.changeStatus(StationStatus.INACTIVE);
    const charger = Charger.create({
      stationId: s.id, name: 'CP-01', maxPowerKw: 50,
    });
    expect(() => s.addCharger(charger)).toThrow(StationNotActiveException);
  });

  it('should clear domain events', () => {
    const s = Station.create(validProps);
    s.clearDomainEvents();
    expect(s.domainEvents).toHaveLength(0);
  });
});

describe('Charger Aggregate', () => {
  const validProps = {
    stationId:  'station-uuid-1',
    name:       'CP-01',
    maxPowerKw: 50,
    connectors: [{ connectorType: ConnectorType.CCS }],
  };

  it('should create charger with AVAILABLE status and emit ChargerAddedEvent', () => {
    const c = Charger.create(validProps);
    expect(c.status).toBe(ChargerStatus.AVAILABLE);
    expect(c.domainEvents[0].eventType).toBe('charger.added');
  });

  it('should throw for maxPowerKw <= 0', () => {
    expect(() => Charger.create({ ...validProps, maxPowerKw: 0 })).toThrow();
    expect(() => Charger.create({ ...validProps, maxPowerKw: -5 })).toThrow();
  });

  it('should apply valid status FSM: AVAILABLE → IN_USE', () => {
    const c = Charger.create(validProps);
    c.clearDomainEvents();
    c.updateStatus(ChargerStatus.IN_USE);
    expect(c.status).toBe(ChargerStatus.IN_USE);
    expect(c.domainEvents[0].eventType).toBe('charger.status_changed');
  });

  it('should throw InvalidStatusTransitionException for invalid FSM transition', () => {
    const c = Charger.create(validProps); // AVAILABLE
    c.updateStatus(ChargerStatus.IN_USE);
    // IN_USE → RESERVED is not allowed
    expect(() => c.updateStatus(ChargerStatus.RESERVED)).toThrow(InvalidStatusTransitionException);
  });

  it('should allow FAULTED → OFFLINE', () => {
    const c = Charger.create(validProps);
    c.updateStatus(ChargerStatus.FAULTED);
    c.updateStatus(ChargerStatus.OFFLINE);
    expect(c.status).toBe(ChargerStatus.OFFLINE);
  });

  it('should allow OFFLINE → AVAILABLE (repaired)', () => {
    const c = Charger.create(validProps);
    c.updateStatus(ChargerStatus.OFFLINE);
    c.updateStatus(ChargerStatus.AVAILABLE);
    expect(c.status).toBe(ChargerStatus.AVAILABLE);
  });

  it('should throw for empty name', () => {
    expect(() => Charger.create({ ...validProps, name: '' })).toThrow();
  });
});

// CreateStationUseCase Tests

describe('CreateStationUseCase', () => {
  let useCase: CreateStationUseCase;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CreateStationUseCase,
        { provide: STATION_REPOSITORY, useValue: mockStationRepo },
        { provide: EVENT_BUS,          useValue: mockEventBus },
        { provide: DataSource,         useValue: mockDataSource },
      ],
    }).compile();
    useCase = module.get(CreateStationUseCase);
  });

  const dto = {
    name:      'Station Alpha',
    cityId:    'city-uuid-1',
    latitude:  10.7769,
    longitude: 106.7009,
  };

  it('should create station successfully', async () => {
    mockStationRepo.findCityById.mockResolvedValue(mockCity);
    mockStationRepo.existsByGeo.mockResolvedValue(false);
    mockStationRepo.save.mockResolvedValue(undefined);
    mockEventBus.publishAll.mockResolvedValue(undefined);

    const result = await useCase.execute(dto);

    expect(result.name).toBe('Station Alpha');
    expect(result.status).toBe(StationStatus.ACTIVE);
    expect(mockStationRepo.save).toHaveBeenCalled();
  });

  it('should throw CityNotFoundException if city not found', async () => {
    const { CityNotFoundException } = await import('../../src/domain/exceptions/station.exceptions');
    mockStationRepo.findCityById.mockResolvedValue(null);

    await expect(useCase.execute(dto)).rejects.toThrow(CityNotFoundException);
  });

  it('should throw DuplicateGeoLocationException for existing coordinates', async () => {
    mockStationRepo.findCityById.mockResolvedValue(mockCity);
    mockStationRepo.existsByGeo.mockResolvedValue(true);

    await expect(useCase.execute(dto)).rejects.toThrow(DuplicateGeoLocationException);
  });
});

// AddChargerUseCase Tests

describe('AddChargerUseCase', () => {
  let useCase: AddChargerUseCase;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AddChargerUseCase,
        { provide: STATION_REPOSITORY, useValue: mockStationRepo },
        { provide: CHARGER_REPOSITORY, useValue: mockChargerRepo },
        { provide: EVENT_BUS,          useValue: mockEventBus },
        { provide: DataSource,         useValue: mockDataSource },
      ],
    }).compile();
    useCase = module.get(AddChargerUseCase);
  });

  const dto = {
    name:       'CP-01',
    externalId: 'OCPP-001',
    maxPowerKw: 50,
    connectors: [{ connectorType: ConnectorType.CCS }],
  };

  it('should add charger successfully', async () => {
    mockStationRepo.findById.mockResolvedValue(makeStation());
    mockChargerRepo.existsByExternalId.mockResolvedValue(false);
    mockChargerRepo.save.mockResolvedValue(undefined);
    mockEventBus.publishAll.mockResolvedValue(undefined);

    const result = await useCase.execute('station-uuid-1', dto);

    expect(result.name).toBe('CP-01');
    expect(result.status).toBe(ChargerStatus.AVAILABLE);
    expect(mockChargerRepo.save).toHaveBeenCalled();
  });

  it('should throw StationNotFoundException if station not found', async () => {
    mockStationRepo.findById.mockResolvedValue(null);

    await expect(useCase.execute('nonexistent', dto)).rejects.toThrow(StationNotFoundException);
  });

  it('should throw DuplicateExternalIdException for existing OCPP id', async () => {
    mockStationRepo.findById.mockResolvedValue(makeStation());
    mockChargerRepo.existsByExternalId.mockResolvedValue(true);

    await expect(useCase.execute('station-uuid-1', dto)).rejects.toThrow(DuplicateExternalIdException);
  });

  it('should reject if maxPowerKw <= 0', async () => {
    mockStationRepo.findById.mockResolvedValue(makeStation());
    mockChargerRepo.existsByExternalId.mockResolvedValue(false);

    await expect(
      useCase.execute('station-uuid-1', { ...dto, maxPowerKw: 0 }),
    ).rejects.toThrow();
  });
});

// UpdateChargerStatusUseCase Tests

describe('UpdateChargerStatusUseCase', () => {
  let useCase: UpdateChargerStatusUseCase;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UpdateChargerStatusUseCase,
        { provide: CHARGER_REPOSITORY, useValue: mockChargerRepo },
        { provide: EVENT_BUS,          useValue: mockEventBus },
        { provide: DataSource,         useValue: mockDataSource },
      ],
    }).compile();
    useCase = module.get(UpdateChargerStatusUseCase);
  });

  it('should update status available → in_use', async () => {
    mockChargerRepo.findById.mockResolvedValue(makeCharger({ status: ChargerStatus.AVAILABLE }));
    mockChargerRepo.updateStatus.mockResolvedValue(undefined);
    mockEventBus.publishAll.mockResolvedValue(undefined);

    const result = await useCase.execute('charger-uuid-1', { status: ChargerStatus.IN_USE });

    expect(result.status).toBe(ChargerStatus.IN_USE);
    expect(mockChargerRepo.updateStatus).toHaveBeenCalled();
  });

  it('should throw ChargerNotFoundException if charger not found', async () => {
    mockChargerRepo.findById.mockResolvedValue(null);

    await expect(
      useCase.execute('nonexistent', { status: ChargerStatus.IN_USE }),
    ).rejects.toThrow(ChargerNotFoundException);
  });

  it('should throw InvalidStatusTransitionException for invalid FSM transition', async () => {
    // in_use cannot go to reserved
    mockChargerRepo.findById.mockResolvedValue(makeCharger({ status: ChargerStatus.IN_USE }));

    await expect(
      useCase.execute('charger-uuid-1', { status: ChargerStatus.RESERVED }),
    ).rejects.toThrow(InvalidStatusTransitionException);
  });
});

// ListStationsUseCase Tests

describe('ListStationsUseCase', () => {
  let useCase: ListStationsUseCase;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ListStationsUseCase,
        { provide: STATION_REPOSITORY, useValue: mockStationRepo },
      ],
    }).compile();
    useCase = module.get(ListStationsUseCase);
  });

  it('should return paginated results', async () => {
    mockStationRepo.findMany.mockResolvedValue({
      items: [makeStation()],
      total: 1,
      limit: 20,
      offset: 0,
    });

    const result = await useCase.execute({});

    expect(result.total).toBe(1);
    expect(result.items).toHaveLength(1);
  });

  it('should pass cityId filter to repo', async () => {
    mockStationRepo.findMany.mockResolvedValue({ items: [], total: 0, limit: 20, offset: 0 });

    await useCase.execute({ cityId: 'city-uuid-1' });

    expect(mockStationRepo.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ cityId: 'city-uuid-1' }),
    );
  });

  it('should use default limit 20 and offset 0', async () => {
    mockStationRepo.findMany.mockResolvedValue({ items: [], total: 0, limit: 20, offset: 0 });

    await useCase.execute({});

    expect(mockStationRepo.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 20, offset: 0 }),
    );
  });
});

describe('UpdateStationUseCase', () => {
  let useCase: UpdateStationUseCase;
  const mockRedisCache = {
    invalidateCharger: jest.fn(),
    invalidateStation: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UpdateStationUseCase,
        { provide: STATION_REPOSITORY, useValue: mockStationRepo },
        { provide: CHARGER_REPOSITORY, useValue: mockChargerRepo },
        { provide: EVENT_BUS,          useValue: mockEventBus },
        { provide: RedisAvailabilityCache, useValue: mockRedisCache },
        { provide: DataSource,         useValue: mockDataSource },
      ],
    }).compile();
    useCase = module.get(UpdateStationUseCase);
  });

  it('should update station status and invalidate cache', async () => {
    const station = makeStation();
    const charger = makeCharger();
    mockStationRepo.findById.mockResolvedValue(station);
    mockStationRepo.save.mockResolvedValue(undefined);
    mockEventBus.publishAll.mockResolvedValue(undefined);
    mockChargerRepo.findByStationId.mockResolvedValue([charger]);

    const result = await useCase.execute(station.id, { status: StationStatus.CLOSED });

    expect(result.status).toBe(StationStatus.CLOSED);
    expect(mockStationRepo.save).toHaveBeenCalled();
    expect(mockRedisCache.invalidateCharger).toHaveBeenCalledWith(charger.id);
    expect(mockRedisCache.invalidateStation).toHaveBeenCalledWith(station.id);
  });

  it('should throw StationNotFoundException if station not found', async () => {
    mockStationRepo.findById.mockResolvedValue(null);

    await expect(
      useCase.execute('nonexistent', { name: 'New Name' }),
    ).rejects.toThrow(StationNotFoundException);
  });
});

describe('GetNearbyStationsUseCase', () => {
  let useCase: GetNearbyStationsUseCase;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GetNearbyStationsUseCase,
        { provide: STATION_REPOSITORY, useValue: mockStationRepo },
      ],
    }).compile();
    useCase = module.get(GetNearbyStationsUseCase);
  });

  it('should search nearby stations and pass ids list', async () => {
    mockStationRepo.findMany.mockResolvedValue({
      items: [makeStation()],
      total: 1,
      limit: 20,
      offset: 0,
    });

    const result = await useCase.execute(10.7769, 106.7009, 10, 20, undefined, ['station-uuid-1']);

    expect(result).toHaveLength(1);
    expect(mockStationRepo.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        nearLat: 10.7769,
        nearLng: 106.7009,
        ids: ['station-uuid-1'],
      }),
    );
  });
});

