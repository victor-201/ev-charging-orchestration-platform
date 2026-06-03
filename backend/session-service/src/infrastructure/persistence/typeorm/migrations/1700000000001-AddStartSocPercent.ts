import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddStartSocPercent1700000000001 implements MigrationInterface {
  name = 'AddStartSocPercent1700000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE charging_sessions
        ADD COLUMN start_soc_percent SMALLINT;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE charging_sessions
        DROP COLUMN start_soc_percent;
    `);
  }
}
