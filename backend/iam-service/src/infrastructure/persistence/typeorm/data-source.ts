import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
dotenv.config();

import {
  UserOrmEntity, SessionOrmEntity, RoleOrmEntity, PermissionOrmEntity,
  RolePermissionOrmEntity, UserRoleOrmEntity, EmailVerificationTokenOrmEntity,
  PasswordResetTokenOrmEntity, OutboxOrmEntity,
} from './entities/auth.orm-entities';

export default new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: parseInt(process.env.DB_PORT ?? '5434'),
  username: process.env.DB_USER ?? 'ev_user',
  password: process.env.DB_PASSWORD ?? 'ev_secret',
  database: process.env.DB_NAME ?? 'ev_auth_db',
  entities: [
    UserOrmEntity, SessionOrmEntity, RoleOrmEntity, PermissionOrmEntity,
    RolePermissionOrmEntity, UserRoleOrmEntity, EmailVerificationTokenOrmEntity,
    PasswordResetTokenOrmEntity, OutboxOrmEntity,
  ],
  migrations: [__dirname + '/migrations/*.ts'],
  migrationsTransactionMode: 'each',
  synchronize: false,
  logging: true,
});
