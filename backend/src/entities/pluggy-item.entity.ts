import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity('pluggy_items')
export class PluggyItem {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  id: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  connector_name: string | null;

  @Column({ type: 'varchar', length: 50, default: 'UPDATED' })
  status: string;

  @Column({ type: 'varchar', nullable: true })
  last_synced_at: string | null;

  @CreateDateColumn()
  created_at: Date;
}
