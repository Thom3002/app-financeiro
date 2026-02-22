import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity('import_logs')
export class ImportLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 50 })
  banco: string;

  @Column({ type: 'varchar', length: 255 })
  filename: string;

  @Column({ type: 'int', default: 0 })
  total: number;

  @Column({ type: 'int', default: 0 })
  novas: number;

  @Column({ type: 'int', default: 0 })
  duplicadas: number;

  @Column({ type: 'int', default: 0 })
  invalidas: number;

  @CreateDateColumn()
  created_at: Date;
}
