import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity('classification_rules')
export class ClassificationRule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 500 })
  regex: string;

  @Column({ type: 'varchar', length: 50, default: 'ambos' })
  campo_alvo: string; // 'titulo' | 'descricao' | 'ambos'

  @Column({ type: 'varchar', length: 50, default: 'qualquer' })
  banco_escopo: string; // 'qualquer' | 'C6' | etc.

  @Column({ type: 'varchar', length: 50, default: 'qualquer' })
  sinal_escopo: string; // 'qualquer' | 'entrada' | 'saida'

  @Column({ type: 'varchar', length: 100 })
  categoria: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  subcategoria: string | null;

  @Column({ type: 'int', default: 100 })
  priority: number;

  @Column({ type: 'boolean', default: true })
  enabled: boolean;

  @Column({ type: 'boolean', default: false })
  overwrite_manual: boolean;

  @CreateDateColumn()
  created_at: Date;
}
