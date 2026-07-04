import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager } from 'typeorm';
import {
  Transaction, TxType, TxMethod, TxStatus, TxRelatedType,
} from '../../../domain/entities/transaction.aggregate';
import { ITransactionRepository } from '../../../domain/repositories/transaction.repository.interface';
import { TransactionOrmEntity } from '../typeorm/entities/payment.orm-entities';

@Injectable()
export class TransactionRepository implements ITransactionRepository {
  constructor(
    @InjectRepository(TransactionOrmEntity)
    private readonly repo: Repository<TransactionOrmEntity>,
  ) {}

  async save(tx: Transaction, manager?: EntityManager): Promise<void> {
    const entity = this.toOrm(tx);
    if (manager) {
      await manager.save(TransactionOrmEntity, entity);
    } else {
      await this.repo.save(entity);
    }
  }

  async findById(id: string): Promise<Transaction | null> {
    const e = await this.repo.findOneBy({ id });
    return e ? this.toDomain(e) : null;
  }

  async findByReferenceCode(referenceCode: string): Promise<Transaction | null> {
    const e = await this.repo.findOneBy({ referenceCode });
    return e ? this.toDomain(e) : null;
  }

  async findByUserId(userId: string, limit = 20, offset = 0, type?: string, status?: string): Promise<Transaction[]> {
    const where: any = { userId };
    if (type)   where.type   = type.toLowerCase();
    if (status) where.status = status.toLowerCase();
    const entities = await this.repo.find({
      where,
      order: { createdAt: 'DESC' },
      take:  limit,
      skip:  offset,
    });
    return entities.map(this.toDomain.bind(this));
  }

  async countByUserId(userId: string, type?: string, status?: string): Promise<number> {
    const where: any = { userId };
    if (type)   where.type   = type.toLowerCase();
    if (status) where.status = status.toLowerCase();
    return this.repo.count({ where });
  }

  async findAll(limit = 20, offset = 0, type?: string, status?: string): Promise<Transaction[]> {
    const where: any = {};
    if (type)   where.type   = type.toLowerCase();
    if (status) where.status = status.toLowerCase();
    const entities = await this.repo.find({
      where,
      order: { createdAt: 'DESC' },
      take:  limit,
      skip:  offset,
    });
    return entities.map(this.toDomain.bind(this));
  }

  async countAll(type?: string, status?: string): Promise<number> {
    const where: any = {};
    if (type)   where.type   = type.toLowerCase();
    if (status) where.status = status.toLowerCase();
    return this.repo.count({ where });
  }

  async findPending(userId: string): Promise<Transaction[]> {
    const entities = await this.repo.findBy({ userId, status: 'pending' });
    return entities.map(this.toDomain.bind(this));
  }

  async findPendingBefore(cutoff: Date): Promise<Transaction[]> {
    const entities = await this.repo
      .createQueryBuilder('t')
      .where("t.status = 'pending'")
      .andWhere('t.created_at <= :cutoff', { cutoff })
      .getMany();
    return entities.map(this.toDomain.bind(this));
  }

  private toOrm(tx: Transaction): TransactionOrmEntity {
    const e       = new TransactionOrmEntity();
    e.id           = tx.id;
    e.userId       = tx.userId;
    e.type         = tx.type;
    e.amount       = tx.amount;
    e.currency     = tx.currency;
    e.method       = tx.method;
    e.relatedId    = tx.relatedId;
    e.relatedType  = tx.relatedType;
    e.status       = tx.status;
    e.externalId   = tx.externalId;
    e.referenceCode = tx.referenceCode;
    e.meta         = tx.meta;
    return e;
  }

  private toDomain(e: TransactionOrmEntity): Transaction {
    return Transaction.reconstitute({
      id:            e.id,
      userId:        e.userId,
      type:          e.type as TxType,
      amount:        Number(e.amount),
      currency:      e.currency,
      method:        e.method as TxMethod,
      relatedId:     e.relatedId,
      relatedType:   e.relatedType as TxRelatedType | null,
      status:        e.status as TxStatus,
      externalId:    e.externalId,
      referenceCode: e.referenceCode,
      meta:          e.meta,
      createdAt:     e.createdAt,
      updatedAt:     e.updatedAt,
    });
  }
}
