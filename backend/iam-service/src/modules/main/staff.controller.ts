import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query,
  HttpCode, HttpStatus, ParseUUIDPipe, NotFoundException, BadRequestException,
  UseGuards,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import {
  StaffProfileOrmEntity,
  AttendanceOrmEntity,
  UsersCacheOrmEntity,
} from '../../infrastructure/persistence/typeorm/entities/user.orm-entities';
import { UserOrmEntity } from '../../infrastructure/persistence/typeorm/entities/auth.orm-entities';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { RolesGuard }   from '../../shared/guards/roles.guard';
import { Roles } from '../../shared/decorators/roles.decorator';
import { CurrentUser } from '../../shared/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../shared/guards/jwt-auth.guard';
import { ListStaffQueryDto, ListAttendanceQueryDto } from './dto/user-query.dto';
import { CreateStaffDto, UpdateStaffDto, CheckInDto, CheckOutDto } from './dto/staff.dto';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class StaffController {
  constructor(
    @InjectRepository(StaffProfileOrmEntity)
    private readonly staffRepo: Repository<StaffProfileOrmEntity>,
    @InjectRepository(AttendanceOrmEntity)
    private readonly attendanceRepo: Repository<AttendanceOrmEntity>,
    @InjectRepository(UsersCacheOrmEntity)
    private readonly usersCacheRepo: Repository<UsersCacheOrmEntity>,
    @InjectRepository(UserOrmEntity)
    private readonly userRepo: Repository<UserOrmEntity>,
  ) {}

  /**
   * GET /api/v1/users
   * Admin/Staff only: List all users from the users cache read-model.
   */
  @Get('users')
  @Roles('admin', 'staff')
  async listUsers(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('search') search?: string,
    @Query('debt') debt?: string,
    @Query('role') role?: string,
    @Query('ids') ids?: string,
  ) {
    try {
      // 1. Fetch all master users and their first role name in one single query
      const masterUsers: Array<{
        userId: string;
        email: string;
        fullName: string;
        phone: string | null;
        status: string;
        emailVerified: boolean;
        roleName: string | null;
      }> = await this.userRepo.query(`
        SELECT 
          u.id AS "userId", 
          u.email, 
          u.full_name AS "fullName", 
          u.phone, 
          u.status, 
          u.email_verified AS "emailVerified",
          r.name AS "roleName"
        FROM users u
        LEFT JOIN (
          SELECT DISTINCT ON (user_id) user_id, role_id FROM user_roles ORDER BY user_id, assigned_at DESC
        ) ur ON u.id = ur.user_id
        LEFT JOIN roles r ON ur.role_id = r.id
      `);

      // 2. Fetch all cache records
      const cacheRecords = await this.usersCacheRepo.find();
      const cacheMap = new Map(cacheRecords.map(c => [c.userId, c]));

      const toSave: UsersCacheOrmEntity[] = [];

      for (const mu of masterUsers) {
        const roleName = mu.roleName || 'user';
        const cached = cacheMap.get(mu.userId);

        if (!cached) {
          const newCache = this.usersCacheRepo.create({
            userId: mu.userId,
            email: mu.email,
            fullName: mu.fullName,
            phone: mu.phone,
            roleName: roleName,
            status: mu.status,
            emailVerified: mu.emailVerified,
            hasOutstandingDebt: false,
            arrearsAmount: 0,
            syncedAt: new Date()
          });
          toSave.push(newCache);
        } else {
          const needsUpdate = 
            cached.roleName !== roleName ||
            cached.status !== mu.status ||
            cached.fullName !== mu.fullName ||
            cached.phone !== mu.phone ||
            cached.emailVerified !== mu.emailVerified;

          if (needsUpdate) {
            cached.roleName = roleName;
            cached.status = mu.status;
            cached.fullName = mu.fullName;
            cached.phone = mu.phone;
            cached.emailVerified = mu.emailVerified;
            cached.syncedAt = new Date();
            toSave.push(cached);
          }
        }
      }

      if (toSave.length > 0) {
        await this.usersCacheRepo.save(toSave);
      }
    } catch (err) {
      console.warn('Failed to sync users cache with master table on-the-fly:', err);
    }

    const limitNum = ids ? 1000 : (limit ? parseInt(limit, 10) : 20);
    const offsetNum = offset ? parseInt(offset, 10) : 0;

    const query = this.usersCacheRepo.createQueryBuilder('uc');

    if (ids) {
      const idList = ids.split(',').map(id => id.trim()).filter(id => id.length > 0);
      if (idList.length > 0) {
        query.andWhere('uc.userId IN (:...idList)', { idList });
      }
    } else {
      // 1. Role Filter (default to 'user' if not specified)
      const targetRole = role !== undefined ? role : 'user';
      if (targetRole !== 'all') {
        query.andWhere('uc.roleName = :role', { role: targetRole });
      }

      // 2. Search Filter (name, email, phone)
      if (search) {
        query.andWhere(
          '(LOWER(uc.fullName) LIKE LOWER(:search) OR LOWER(uc.email) LIKE LOWER(:search) OR uc.phone LIKE :search)',
          { search: `%${search}%` }
        );
      }

      // 3. Debt Filter
      if (debt === 'debt') {
        query.andWhere('uc.hasOutstandingDebt = :hasDebt', { hasDebt: true });
      } else if (debt === 'nodebt') {
        query.andWhere('uc.hasOutstandingDebt = :hasDebt', { hasDebt: false });
      }
    }

    query
      .orderBy('uc.fullName', 'ASC')
      .take(limitNum)
      .skip(offsetNum);

    const [items, total] = await query.getManyAndCount();
    return { items, total };
  }

  /**
   * GET /api/v1/staff
   * Admin/Staff only: List staff profiles.
   */
  @Get('staff')
  @Roles('admin', 'staff')
  async listStaff(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListStaffQueryDto,
  ) {
    const qb = this.staffRepo.createQueryBuilder('staff');
    qb.leftJoinAndMapOne('staff.User', UserOrmEntity, 'user', 'staff.userId = user.id');

    const isStaff = user.role === 'staff' || user.roles?.includes('staff');
    const isAdmin = user.role === 'admin' || user.roles?.includes('admin');

    if (isStaff && !isAdmin) {
      qb.andWhere('staff.userId = :currentUserId', { currentUserId: user.id });
    } else {
      if (query.position) {
        qb.andWhere('staff.position = :position', { position: query.position.toLowerCase() });
      }
      if (query.shift) {
        qb.andWhere('staff.shift = :shift', { shift: query.shift.toLowerCase() });
      }
    }

    qb.take(query.limit ?? 20)
      .skip(query.offset ?? 0)
      .orderBy('staff.createdAt', 'DESC');

    const [items, total] = await qb.getManyAndCount();
    return {
      items: items.map(s => ({
        ...s,
        status: s.isActive ? 'ACTIVE' : 'INACTIVE',
      })),
      total,
    };
  }

  /**
   * POST /api/v1/staff
   * Admin only: Create a new staff profile.
   */
  @Post('staff')
  @Roles('admin')
  @HttpCode(HttpStatus.CREATED)
  async createStaff(@Body() dto: CreateStaffDto) {
    if (!dto.userId) {
      throw new BadRequestException('userId is required');
    }
    const existing = await this.staffRepo.findOne({ where: { userId: dto.userId } });
    if (existing) {
      throw new BadRequestException('Staff profile already exists for this user');
    }

    const staff = this.staffRepo.create({
      id: uuidv4(),
      userId: dto.userId,
      position: dto.position ? dto.position.toLowerCase() : 'operator',
      shift: dto.shift ? dto.shift.toLowerCase() : 'morning',
      notes: dto.notes ?? null,
      stationId: dto.stationId ?? '00000000-0000-0000-0000-000000000000',
      stationName: 'EV Station',
      isActive: true,
      hireDate: new Date(),
    });

    return this.staffRepo.save(staff);
  }

  /**
   * PATCH /api/v1/staff/:id
   * Admin only: Update a staff profile.
   */
  @Patch('staff/:id')
  @Roles('admin')
  async updateStaff(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStaffDto,
  ) {
    const staff = await this.staffRepo.findOne({ where: { id } });
    if (!staff) {
      throw new NotFoundException('Staff profile not found');
    }

    if (dto.position) staff.position = dto.position.toLowerCase();
    if (dto.shift) staff.shift = dto.shift.toLowerCase();
    if (dto.status) {
      staff.isActive = (dto.status === 'ACTIVE');
    }

    return this.staffRepo.save(staff);
  }

  /**
   * DELETE /api/v1/staff/:id
   * Admin only: Delete a staff profile.
   */
  @Delete('staff/:id')
  @Roles('admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteStaff(@Param('id', ParseUUIDPipe) id: string) {
    const staff = await this.staffRepo.findOne({ where: { id } });
    if (!staff) {
      throw new NotFoundException('Staff profile not found');
    }
    await this.staffRepo.remove(staff);
  }

  /**
   * POST /api/v1/attendance/check-in
   * Staff only: Attendance check-in.
   */
  @Post('attendance/check-in')
  @Roles('staff', 'admin')
  @HttpCode(HttpStatus.CREATED)
  async checkIn(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CheckInDto,
  ) {
    const staff = await this.staffRepo.findOne({ where: { userId: user.id } });
    if (!staff) {
      throw new NotFoundException('Staff profile not found for the current user');
    }

    const todayStr = new Date().toISOString().split('T')[0];
    const today = new Date(todayStr);

    let attendance = await this.attendanceRepo.findOne({
      where: { staffId: staff.id, workDate: today },
    });

    if (!attendance) {
      attendance = this.attendanceRepo.create({
        id: uuidv4(),
        staffId: staff.id,
        workDate: today,
        checkIn: new Date(),
        checkOut: null,
        status: 'present',
        notes: `Checked in (Lat: ${dto.latitude}, Lng: ${dto.longitude})`,
      });
    } else {
      attendance.checkIn = new Date();
      attendance.status = 'present';
    }

    return this.attendanceRepo.save(attendance);
  }

  /**
   * POST /api/v1/attendance/check-out
   * Staff only: Attendance check-out.
   */
  @Post('attendance/check-out')
  @Roles('staff', 'admin')
  @HttpCode(HttpStatus.OK)
  async checkOut(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CheckOutDto,
  ) {
    const staff = await this.staffRepo.findOne({ where: { userId: user.id } });
    if (!staff) {
      throw new NotFoundException('Staff profile not found for the current user');
    }

    const todayStr = new Date().toISOString().split('T')[0];
    const today = new Date(todayStr);

    let attendance = await this.attendanceRepo.findOne({
      where: { staffId: staff.id, workDate: today },
    });

    if (!attendance) {
      attendance = this.attendanceRepo.create({
        id: uuidv4(),
        staffId: staff.id,
        workDate: today,
        checkIn: null,
        checkOut: new Date(),
        status: 'present',
        notes: `Checked out directly (Lat: ${dto.latitude}, Lng: ${dto.longitude})`,
      });
    } else {
      attendance.checkOut = new Date();
    }

    return this.attendanceRepo.save(attendance);
  }

  @Get('attendance')
  @Roles('admin', 'staff')
  async listAttendance(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListAttendanceQueryDto,
  ) {
    const qb = this.attendanceRepo.createQueryBuilder('att');
    qb.innerJoinAndMapOne('att.staff', StaffProfileOrmEntity, 'staff', 'att.staffId = staff.id');
    qb.leftJoinAndMapOne('att.User', UserOrmEntity, 'user', 'staff.userId = user.id');

    const isStaff = user.role === 'staff' || user.roles?.includes('staff');
    const isAdmin = user.role === 'admin' || user.roles?.includes('admin');

    if (isStaff && !isAdmin) {
      qb.andWhere('staff.userId = :currentUserId', { currentUserId: user.id });
    } else {
      if (query.userId) {
        qb.andWhere('staff.userId = :userId', { userId: query.userId });
      }
      if (query.stationId) {
        qb.andWhere('staff.stationId = :stationId', { stationId: query.stationId });
      }
    }

    if (query.fromDate) {
      qb.andWhere('att.workDate >= :fromDate', { fromDate: new Date(query.fromDate) });
    }

    if (query.toDate) {
      qb.andWhere('att.workDate <= :toDate', { toDate: new Date(query.toDate) });
    }

    qb.take(query.limit ?? 20)
      .skip(query.offset ?? 0)
      .orderBy('att.workDate', 'DESC');

    const [items, total] = await qb.getManyAndCount();
    return {
      items: items.map((att: any) => {
        const match = /Lat:\s*([-\d.]+),\s*Lng:\s*([-\d.]+)/.exec(att.notes || '');
        const latitude = match ? parseFloat(match[1]) : 10.8231;
        const longitude = match ? parseFloat(match[2]) : 106.6297;

        return {
          id: att.id,
          userId: att.staff?.userId ?? att.staffId,
          stationId: att.staff?.stationId,
          checkInTime: att.checkIn,
          checkOutTime: att.checkOut,
          latitude,
          longitude,
          status: att.status,
          notes: att.notes,
          createdAt: att.createdAt,
          User: att.User,
        };
      }),
      total,
    };
  }
}
