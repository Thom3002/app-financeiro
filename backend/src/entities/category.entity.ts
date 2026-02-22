import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';

@Entity('categories')
export class Category {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100 })
  nome: string;

  @Column({ type: 'varchar', nullable: true })
  parent_id: string;

  @ManyToOne(() => Category, (cat) => cat.children, {
    nullable: true,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'parent_id' })
  parent: Category;

  @OneToMany(() => Category, (cat) => cat.parent)
  children: Category[];

  @Column({ type: 'varchar', length: 20, nullable: true })
  cor: string;

  @Column({ type: 'varchar', length: 10, nullable: true })
  icone: string;

  @CreateDateColumn()
  created_at: Date;
}
