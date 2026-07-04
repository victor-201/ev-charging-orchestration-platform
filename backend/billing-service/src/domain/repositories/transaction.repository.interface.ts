import { EntityManager } from 'typeorm';
import { Transaction } from '../entities/transaction.aggregate';

export interface TransactionFilter {
  userId?: string;
  status?: string;
  type?: string;
  limit?: number;
  offset?: number;
}

export interface ITransactionRepository {
  save(tx: Transaction, manager?: EntityManager): Promise<void>;
  findById(id: string): Promise<Transaction | null>;
  findByReferenceCode(referenceCode: string): Promise<Transaction | null>;
  findByUserId(userId: string, limit?: number, offset?: number, type?: string, status?: string): Promise<Transaction[]>;
  countByUserId(userId: string, type?: string, status?: string): Promise<number>;
  findAll(limit?: number, offset?: number, type?: string, status?: string): Promise<Transaction[]>;
  countAll(type?: string, status?: string): Promise<number>;
  findPending(userId: string): Promise<Transaction[]>;
  /** Find PENDING transactions created before cutoff (for auto-cancel) */
  findPendingBefore(cutoff: Date): Promise<Transaction[]>;
}


export const TRANSACTION_REPOSITORY = Symbol('TRANSACTION_REPOSITORY');
