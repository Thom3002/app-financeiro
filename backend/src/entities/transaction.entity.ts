import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity('transactions')
export class Transaction {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  id: string;

  @Column({ type: 'date' })
  data: string;

  @Column({ type: 'varchar', length: 500 })
  titulo: string;

  @Column({ type: 'varchar', length: 1000 })
  descricao: string;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  valor: number;

  @Column({ type: 'varchar', length: 50 })
  banco: string;

  @Column({ type: 'varchar', length: 50, default: 'CHECKING' })
  account_type: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  categoria: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  subcategoria: string | null;

  @Column({ type: 'boolean', default: false })
  is_manual: boolean;

  @Column({ type: 'varchar', nullable: true })
  matched_rule_id: string | null;

  @Column({ type: 'varchar', nullable: true })
  import_id: string | null;

  @Column({ type: 'varchar', length: 20, default: 'MANUAL' })
  source: string;

  @Column({ type: 'varchar', nullable: true })
  pluggy_transaction_id: string | null;

  @Column({ type: 'varchar', nullable: true })
  pluggy_account_id: string | null;

  @Column({ type: 'varchar', nullable: true })
  pluggy_item_id: string | null;

  @Column({ type: 'varchar', nullable: true })
  payment_method: string | null;

  @Column({ type: 'boolean', default: false })
  ignorar_dashboard: boolean;

  @Column({ type: 'varchar', nullable: true })
  ignore_reason: string | null;

  @Column({ type: 'int', nullable: true })
  parcela_atual: number | null;

  @Column({ type: 'int', nullable: true })
  total_parcelas: number | null;

  @Column({ type: 'boolean', default: false })
  is_custo_fixo: boolean;

  @Column({ type: 'varchar', nullable: true })
  custo_fixo_grupo: string | null;

  @CreateDateColumn()
  created_at: Date;
}
