import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';

import { RegisterUseCase, LoginUseCase, RefreshTokenUseCase, LogoutUseCase, ChangePasswordUseCase } from '../../src/application/use-cases/auth.use-cases';
import { User, UserStatus } from '../../src/domain/entities/user.aggregate';
import { Session } from '../../src/domain/entities/session.aggregate';
import { UserAlreadyExistsException, InvalidCredentialsException, TokenExpiredException } from '../../src/domain/exceptions/auth.exceptions';
import { USER_REPOSITORY, SESSION_REPOSITORY, ROLE_REPOSITORY, EMAIL_VERIFICATION_REPOSITORY } from '../../src/domain/repositories/auth.repository.interface';
import { EVENT_BUS } from '../../src/infrastructure/messaging/outbox/outbox-event-bus';
import { RiskScoringService } from '../../src/domain/services/risk-scoring.service';

// Mocks

const mockUserRepo = {
  save: jest.fn(),
  findById: jest.fn(),
  findByEmail: jest.fn(),
  existsByEmail: jest.fn(),
};

const mockSessionRepo = {
  save:                  jest.fn(),
  findByTokenHash:       jest.fn(),
  findById:              jest.fn(),
  findActiveByUserId:    jest.fn().mockResolvedValue([]),  // LoginUseCase calls .filter() on this
  revokeById:            jest.fn(),
  revokeAllByUserId:     jest.fn(),
};

const mockRoleRepo = {
  findByName: jest.fn(),
  findById: jest.fn(),
  findAll: jest.fn(),
  findRolesByUserId: jest.fn(),
  assignRoleToUser: jest.fn(),
  revokeRoleFromUser: jest.fn(),
};

const mockEventBus = {
  publishAll: jest.fn(),
};

const mockEmailVerificationRepo = {
  save: jest.fn(),
  findByToken: jest.fn(),
  findByTokenHash: jest.fn(),
  deleteByUserId: jest.fn(),
  create: jest.fn(),
  markVerified: jest.fn(),
};

const mockDataSource = {
  transaction: jest.fn().mockImplementation((cb: (m: any) => any) => cb({})),
  query: jest.fn().mockResolvedValue([]),
};

const mockJwtService = {
  sign: jest.fn().mockReturnValue('mock.jwt.token'),
};

const mockConfig = {
  get: jest.fn().mockImplementation((key: string, def?: string) => {
    const map: Record<string, string> = {
      JWT_EXPIRES_IN_SECONDS: '900',
      REFRESH_TOKEN_TTL_DAYS: '7',
    };
    return map[key] ?? def;
  }),
};

// Helper

function makeUser(overrides?: Partial<any>) {
  return User.reconstitute({
    id: 'user-uuid-1',
    email: 'test@example.com',
    fullName: 'Test User',
    phone: null,
    dateOfBirth: new Date('1990-01-01'),
    passwordHash: bcrypt.hashSync('password123', 10),
    status: UserStatus.ACTIVE,
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });
}

// RegisterUseCase Tests

describe('RegisterUseCase', () => {
  let useCase: RegisterUseCase;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RegisterUseCase,
        { provide: USER_REPOSITORY, useValue: mockUserRepo },
        { provide: ROLE_REPOSITORY, useValue: mockRoleRepo },
        { provide: EMAIL_VERIFICATION_REPOSITORY, useValue: mockEmailVerificationRepo },
        { provide: EVENT_BUS, useValue: mockEventBus },
        { provide: DataSource, useValue: mockDataSource },
      ],
    }).compile();
    useCase = module.get(RegisterUseCase);
  });

  it('should register a new user successfully', async () => {
    mockUserRepo.findByEmail.mockResolvedValue(null);
    mockUserRepo.save.mockResolvedValue(undefined);
    mockRoleRepo.findByName.mockResolvedValue({ id: 'role-1', name: 'user', permissions: [] });
    mockRoleRepo.assignRoleToUser.mockResolvedValue(undefined);
    mockEventBus.publishAll.mockResolvedValue(undefined);

    const result = await useCase.execute({
      email: 'newuser@example.com',
      password: 'password123',
      fullName: 'New User',
      dateOfBirth: new Date('1990-05-15'),
    });

    expect(result.email).toBe('newuser@example.com');
    expect(result.fullName).toBe('New User');
    expect(mockUserRepo.save).toHaveBeenCalled();
  });

  it('should throw UserAlreadyExistsException if email is taken', async () => {
    const user = makeUser({ email: 'existing@example.com', emailVerified: true });
    mockUserRepo.findByEmail.mockResolvedValue(user);

    await expect(
      useCase.execute({
        email: 'existing@example.com',
        password: 'password123',
        fullName: 'Existing',
        dateOfBirth: new Date('1990-01-01'),
      }),
    ).rejects.toThrow(UserAlreadyExistsException);
  });

  it('should throw if user is under 18 years old', async () => {
    mockUserRepo.findByEmail.mockResolvedValue(null);

    await expect(
      useCase.execute({
        email: 'young@example.com',
        password: 'password123',
        fullName: 'Young User',
        dateOfBirth: new Date(), // today — under 18
      }),
    ).rejects.toThrow();
  });
});

// LoginUseCase Tests

describe('LoginUseCase', () => {
  let useCase: LoginUseCase;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LoginUseCase,
        RiskScoringService,  // Pure domain service — no deps
        { provide: USER_REPOSITORY,    useValue: mockUserRepo },
        { provide: SESSION_REPOSITORY, useValue: mockSessionRepo },
        { provide: ROLE_REPOSITORY,    useValue: mockRoleRepo },
        { provide: EMAIL_VERIFICATION_REPOSITORY, useValue: mockEmailVerificationRepo },
        { provide: EVENT_BUS,          useValue: mockEventBus },
        { provide: JwtService,         useValue: mockJwtService },
        { provide: ConfigService,      useValue: mockConfig },
        { provide: DataSource,         useValue: mockDataSource },
        // Redis mock - rate limiting is required but can be stubbed
        { provide: 'REDIS_CLIENT', useValue: {
          incr:    jest.fn().mockResolvedValue(1),
          expire:  jest.fn().mockResolvedValue(1),
          get:     jest.fn().mockResolvedValue(null),
          set:     jest.fn().mockResolvedValue('OK'),
          del:     jest.fn().mockResolvedValue(1),
        }},
      ],
    }).compile();
    useCase = module.get(LoginUseCase);
  });

  it('should return token pair on valid credentials', async () => {
    const user = makeUser();
    mockUserRepo.findByEmail.mockResolvedValue(user);
    mockRoleRepo.findRolesByUserId.mockResolvedValue([{ name: 'user', permissions: [] }]);
    mockSessionRepo.save.mockResolvedValue(undefined);

    const result = await useCase.execute({ email: 'test@example.com', password: 'password123' });

    expect(result.accessToken).toBe('mock.jwt.token');
    expect(result.refreshToken).toBeDefined();
    expect(result.sessionId).toBeDefined();
  });

  it('should throw InvalidCredentialsException for wrong email', async () => {
    mockUserRepo.findByEmail.mockResolvedValue(null);

    await expect(
      useCase.execute({ email: 'notfound@example.com', password: 'password123' }),
    ).rejects.toThrow(InvalidCredentialsException);
  });

  it('should throw InvalidCredentialsException for wrong password', async () => {
    const user = makeUser();
    mockUserRepo.findByEmail.mockResolvedValue(user);

    await expect(
      useCase.execute({ email: 'test@example.com', password: 'wrongpassword' }),
    ).rejects.toThrow(InvalidCredentialsException);
  });

  it('should throw UserInactiveException for suspended user', async () => {
    const user = makeUser({ status: UserStatus.SUSPENDED });
    mockUserRepo.findByEmail.mockResolvedValue(user);

    await expect(
      useCase.execute({ email: 'test@example.com', password: 'password123' }),
    ).rejects.toThrow(); // UserInactiveException
  });
});

// RefreshTokenUseCase Tests

describe('RefreshTokenUseCase', () => {
  let useCase: RefreshTokenUseCase;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RefreshTokenUseCase,
        { provide: SESSION_REPOSITORY, useValue: mockSessionRepo },
        { provide: USER_REPOSITORY, useValue: mockUserRepo },
        { provide: ROLE_REPOSITORY, useValue: mockRoleRepo },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfig },
        { provide: DataSource, useValue: mockDataSource },
      ],
    }).compile();
    useCase = module.get(RefreshTokenUseCase);
  });

  it('should rotate refresh token and return new token pair', async () => {
    const rawToken = 'valid-raw-token-64chars';
    const session = Session.reconstitute({
      id: 'session-1',
      userId: 'user-uuid-1',
      refreshTokenHash: 'hashed',
      deviceFingerprint: null,
      ipAddress: null,
      userAgent: null,
      expiresAt: new Date(Date.now() + 86400000),
      revokedAt: null,
      createdAt: new Date(),
    });
    const user = makeUser();

    mockSessionRepo.findByTokenHash.mockResolvedValue(session);
    mockSessionRepo.revokeById.mockResolvedValue(undefined);
    mockSessionRepo.save.mockResolvedValue(undefined);
    mockUserRepo.findById.mockResolvedValue(user);
    mockRoleRepo.findRolesByUserId.mockResolvedValue([]);
    mockJwtService.sign.mockReturnValue('new.jwt.token');

    const result = await useCase.execute(rawToken);

    expect(result.accessToken).toBe('new.jwt.token');
    expect(result.refreshToken).toBeDefined();
    expect(mockSessionRepo.revokeById).toHaveBeenCalledWith('session-1');
    expect(mockSessionRepo.save).toHaveBeenCalled();
  });

  it('should throw TokenExpiredException for invalid token', async () => {
    mockSessionRepo.findByTokenHash.mockResolvedValue(null);

    await expect(useCase.execute('invalid-token')).rejects.toThrow(TokenExpiredException);
  });

  it('should throw for revoked session', async () => {
    const session = Session.reconstitute({
      id: 'session-1',
      userId: 'user-uuid-1',
      refreshTokenHash: 'hashed',
      deviceFingerprint: null,
      ipAddress: null,
      userAgent: null,
      expiresAt: new Date(Date.now() + 86400000),
      revokedAt: new Date(), // REVOKED
      createdAt: new Date(),
    });
    mockSessionRepo.findByTokenHash.mockResolvedValue(session);

    await expect(useCase.execute('any-token')).rejects.toThrow();
  });
});

// LogoutUseCase Tests

describe('LogoutUseCase', () => {
  let useCase: LogoutUseCase;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LogoutUseCase,
        { provide: SESSION_REPOSITORY, useValue: mockSessionRepo },
      ],
    }).compile();
    useCase = module.get(LogoutUseCase);
  });

  it('should revoke all sessions when no sessionId provided', async () => {
    mockSessionRepo.revokeAllByUserId.mockResolvedValue(undefined);

    await useCase.execute('user-uuid-1');

    expect(mockSessionRepo.revokeAllByUserId).toHaveBeenCalledWith('user-uuid-1');
    expect(mockSessionRepo.revokeById).not.toHaveBeenCalled();
  });

  it('should revoke specific session when sessionId provided', async () => {
    mockSessionRepo.revokeById.mockResolvedValue(undefined);

    await useCase.execute('user-uuid-1', 'session-42');

    expect(mockSessionRepo.revokeById).toHaveBeenCalledWith('session-42');
    expect(mockSessionRepo.revokeAllByUserId).not.toHaveBeenCalled();
  });
});
