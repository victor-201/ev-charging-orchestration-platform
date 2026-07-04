import {
  Controller, Post, Get, Delete, Patch, Body, Req, HttpCode, HttpStatus,
  UseGuards, UnauthorizedException, BadRequestException, ForbiddenException,
  HttpException, Param, ParseUUIDPipe, Logger, Query,
} from '@nestjs/common';
import { Request } from 'express';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UsersCacheOrmEntity, UserProfileOrmEntity } from '../../infrastructure/persistence/typeorm/entities/user.orm-entities';
import {
  RegisterUseCase, LoginUseCase, RefreshTokenUseCase, LogoutUseCase,
  ChangePasswordUseCase, AssignRoleUseCase, RevokeRoleUseCase,
  GetUserSessionsUseCase, SetupMfaUseCase, VerifyMfaUseCase, DisableMfaUseCase,
  VerifyEmailUseCase, ResendVerificationEmailUseCase,
  RegisterCommand, LoginCommand,
} from '../../application/use-cases/auth.use-cases';
import {
  RegisterDto, LoginDto, RefreshTokenDto, ChangePasswordDto,
  AssignRoleDto, RevokeRoleDto, VerifyMfaDto, DisableMfaDto,
  VerifyEmailDto, ResendVerificationDto,
} from '../../application/dtos/auth.dto';
import {
  UserAlreadyExistsException, InvalidCredentialsException,
  UserInactiveException, TokenExpiredException, RoleNotFoundException,
  DomainException, AccountLockedException, MfaRequiredException,
  InvalidMfaTokenException, MfaNotEnabledException, RateLimitExceededException,
  EmailNotVerifiedException,
  InvalidVerificationCodeException,
  DomainException as AuthDomainException, // alias to avoid naming conflict if any
} from '../../domain/exceptions/auth.exceptions';
import { JwtAuthGuard, AuthenticatedUser } from '../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../shared/guards/roles.guard';
import { Roles } from '../../shared/decorators/roles.decorator';
import { CurrentUser } from '../../shared/decorators/current-user.decorator';

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    @InjectRepository(UsersCacheOrmEntity)
    private readonly usersCacheRepo: Repository<UsersCacheOrmEntity>,
    @InjectRepository(UserProfileOrmEntity)
    private readonly profileRepo: Repository<UserProfileOrmEntity>,
    private readonly registerUC: RegisterUseCase,
    private readonly loginUC: LoginUseCase,
    private readonly refreshUC: RefreshTokenUseCase,
    private readonly logoutUC: LogoutUseCase,
    private readonly changePasswordUC: ChangePasswordUseCase,
    private readonly assignRoleUC: AssignRoleUseCase,
    private readonly revokeRoleUC: RevokeRoleUseCase,
    private readonly getSessionsUC: GetUserSessionsUseCase,
    private readonly setupMfaUC: SetupMfaUseCase,
    private readonly verifyMfaUC: VerifyMfaUseCase,
    private readonly disableMfaUC: DisableMfaUseCase,
    private readonly verifyEmailUC: VerifyEmailUseCase,
    private readonly resendVerifUC: ResendVerificationEmailUseCase,
  ) {}


  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() dto: RegisterDto) {
    const cmd: RegisterCommand = {
      email: dto.email,
      password: dto.password,
      fullName: dto.fullName,
      phone: dto.phone,
      dateOfBirth: new Date(dto.dateOfBirth),
    };
    try {
      return await this.registerUC.execute(cmd);
    } catch (e) {
      if (e instanceof UserAlreadyExistsException) throw new BadRequestException(e.message);
      if (e instanceof DomainException) throw new BadRequestException(e.message);
      throw e;
    }
  }


  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto, @Req() req: Request) {
    const cmd: LoginCommand = {
      email: dto.email,
      password: dto.password,
      mfaToken: dto.mfaToken,
      ipAddress: (req.headers['x-forwarded-for'] as string)?.split(',')[0] ?? req.ip,
      userAgent: req.headers['user-agent'],
      deviceFingerprint: req.headers['x-device-fingerprint'] as string,
    };
    try {
      const result = await this.loginUC.execute(cmd);
      if (result.userId) {
        const [cache, profile] = await Promise.all([
          this.usersCacheRepo.findOne({ where: { userId: result.userId } }),
          this.profileRepo.findOne({ where: { userId: result.userId } }),
        ]);
        return {
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
          expiresIn: result.expiresIn,
          sessionId: result.sessionId,
          user: {
            id: result.userId,
            email: dto.email,
            fullName: cache?.fullName ?? '',
            phone: cache?.phone ?? null,
            role: cache?.roleName ?? 'user',
            mfaEnabled: cache?.emailVerified ?? false,
            hasArrears: cache?.hasOutstandingDebt ?? false,
            arrearsAmount: Number(cache?.arrearsAmount ?? 0),
            avatarUrl: profile?.avatarUrl ?? null,
          }
        };
      }
      return result;
    } catch (e) {
      if (e instanceof RateLimitExceededException) throw new HttpException(e.message, HttpStatus.TOO_MANY_REQUESTS);
      if (e instanceof AccountLockedException) throw new ForbiddenException(e.message);
      if (e instanceof MfaRequiredException) throw new ForbiddenException({ code: 'MFA_REQUIRED', message: e.message });
      if (e instanceof InvalidMfaTokenException) throw new UnauthorizedException(e.message);
      if (e instanceof InvalidCredentialsException) throw new UnauthorizedException(e.message);
      if (e instanceof UserInactiveException) throw new ForbiddenException(e.message);
      if (e instanceof EmailNotVerifiedException) throw new ForbiddenException({ code: 'EMAIL_NOT_VERIFIED', message: e.message });
      throw e;
    }
  }


  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() dto: RefreshTokenDto) {
    try {
      return await this.refreshUC.execute(dto.refreshToken);
    } catch (e) {
      if (e instanceof TokenExpiredException) throw new UnauthorizedException(e.message);
      if (e instanceof InvalidCredentialsException) throw new UnauthorizedException(e.message);
      throw e;
    }
  }


  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  async logout(
    @CurrentUser() user: AuthenticatedUser,
    @Body('sessionId') sessionId?: string,
  ) {
    await this.logoutUC.execute(user.id, sessionId);
  }


  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser() user: AuthenticatedUser) {
    const [cache, profile] = await Promise.all([
      this.usersCacheRepo.findOne({ where: { userId: user.id } }),
      this.profileRepo.findOne({ where: { userId: user.id } }),
    ]);
    return {
      id: user.id,
      email: user.email,
      fullName: cache?.fullName ?? '',
      phone: cache?.phone ?? null,
      role: cache?.roleName ?? (user.roles[0] ?? 'user'),
      roles: user.roles,
      mfaEnabled: user.roles.includes('admin') ? false : cache?.emailVerified ?? false,
      hasArrears: cache?.hasOutstandingDebt ?? false,
      arrearsAmount: Number(cache?.arrearsAmount ?? 0),
      avatarUrl: profile?.avatarUrl ?? null,
    };
  }


  @Patch('change-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  async changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangePasswordDto,
  ) {
    try {
      await this.changePasswordUC.execute(user.id, dto.currentPassword, dto.newPassword);
    } catch (e) {
      if (e instanceof InvalidCredentialsException) throw new BadRequestException(e.message);
      throw e;
    }
  }


  @Get('sessions')
  @UseGuards(JwtAuthGuard)
  async getSessions(@CurrentUser() user: AuthenticatedUser) {
    return this.getSessionsUC.execute(user.id);
  }


  @Delete('sessions/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  async revokeSession(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) sessionId: string,
  ) {
    await this.logoutUC.execute(user.id, sessionId);
  }


  @Delete('sessions')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  async revokeAllSessions(@CurrentUser() user: AuthenticatedUser) {
    await this.logoutUC.execute(user.id);
  }


  @Post('roles/assign')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async assignRole(
    @CurrentUser() admin: AuthenticatedUser,
    @Body() dto: AssignRoleDto,
  ) {
    try {
      await this.assignRoleUC.execute(
        dto.userId,
        dto.roleName,
        admin.id,
        dto.expiresAt ? new Date(dto.expiresAt) : undefined,
      );
    } catch (e) {
      if (e instanceof RoleNotFoundException) throw new BadRequestException(e.message);
      throw e;
    }
  }


  @Post('roles/revoke')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async revokeRole(@Body() dto: RevokeRoleDto) {
    try {
      await this.revokeRoleUC.execute(dto.userId, dto.roleName);
    } catch (e) {
      if (e instanceof RoleNotFoundException) throw new BadRequestException(e.message);
      throw e;
    }
  }


  @Post('mfa/setup')
  @UseGuards(JwtAuthGuard)
  async setupMfa(@CurrentUser() user: AuthenticatedUser) {
    return this.setupMfaUC.execute(user.id);
  }

  @Post('mfa/verify')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async verifyMfa(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: VerifyMfaDto,
  ) {
    try {
      return await this.verifyMfaUC.execute(user.id, dto.token);
    } catch (e) {
      if (e instanceof InvalidMfaTokenException) throw new BadRequestException(e.message);
      throw e;
    }
  }

  @Post('mfa/disable')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  async disableMfa(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: DisableMfaDto,
  ) {
    try {
      await this.disableMfaUC.execute(user.id, dto.password);
    } catch (e) {
      if (e instanceof InvalidCredentialsException) throw new BadRequestException(e.message);
      if (e instanceof MfaNotEnabledException) throw new BadRequestException(e.message);
      throw e;
    }
  }

  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  async verifyEmail(@Body() dto: VerifyEmailDto, @Req() req: Request) {
    if (!dto.token && !dto.code) throw new BadRequestException('Must provide either a token or a 6-digit code');
    try {
      const input = dto.token ? { token: dto.token } : { code: dto.code! };
      const result = await this.verifyEmailUC.execute(input, {
        ipAddress: (req.headers['x-forwarded-for'] as string)?.split(',')[0] ?? req.ip,
        userAgent: req.headers['user-agent'],
        deviceFingerprint: req.headers['x-device-fingerprint'] as string,
      });
      return { 
        message: 'Email verified successfully', 
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        expiresIn: result.expiresIn,
        sessionId: result.sessionId
      };
    } catch (e) {
      if (e instanceof InvalidVerificationCodeException) throw new BadRequestException(e.message);
      if (e instanceof TokenExpiredException) throw new BadRequestException('Token has expired or is invalid');
      throw e;
    }
  }

  @Post('resend-verification')
  @HttpCode(HttpStatus.NO_CONTENT)
  async resendVerification(@Body() dto: ResendVerificationDto) {
    // Return 204 regardless of email existence to prevent account enumeration.
    await this.resendVerifUC.execute(dto.email);
  }
}
