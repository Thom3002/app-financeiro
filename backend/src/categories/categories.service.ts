import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { Category } from '../entities/category.entity';
import { Transaction } from '../entities/transaction.entity';
import { ClassificationRule } from '../entities/classification-rule.entity';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(Category)
    private readonly catRepo: Repository<Category>,
    @InjectRepository(Transaction)
    private readonly txRepo: Repository<Transaction>,
    @InjectRepository(ClassificationRule)
    private readonly ruleRepo: Repository<ClassificationRule>,
  ) {}

  /**
   * Sincroniza qualquer categoria ou subcategoria presente em transações ou regras
   * para a tabela de categorias caso ainda não esteja cadastrada.
   */
  async syncOrphanCategories(): Promise<void> {
    try {
      const txCats = await this.txRepo
        .createQueryBuilder('tx')
        .select('DISTINCT tx.categoria AS categoria, tx.subcategoria AS subcategoria')
        .where("tx.categoria IS NOT NULL AND TRIM(tx.categoria) != '' AND tx.categoria != 'Não classificado'")
        .getRawMany();

      const ruleCats = await this.ruleRepo
        .createQueryBuilder('rule')
        .select('DISTINCT rule.categoria AS categoria, rule.subcategoria AS subcategoria')
        .where("rule.categoria IS NOT NULL AND TRIM(rule.categoria) != '' AND rule.categoria != 'Não classificado'")
        .getRawMany();

      const allPairs = [...txCats, ...ruleCats];

      for (const pair of allPairs) {
        if (pair.categoria && pair.categoria.trim()) {
          await this.ensureExists(pair.categoria.trim(), pair.subcategoria ? pair.subcategoria.trim() : null);
        }
      }
    } catch (e) {
      // Ignora pequenos erros de sincronização concorrente
    }
  }

  async findAll() {
    await this.syncOrphanCategories();
    const categories = await this.catRepo.find({
      where: { parent_id: IsNull() },
      relations: ['children'],
      order: { nome: 'ASC' },
    });
    return categories;
  }

  async findAllFlat() {
    await this.syncOrphanCategories();
    return this.catRepo.find({
      relations: ['children'],
      order: { nome: 'ASC' },
    });
  }

  findOne(id: string) {
    return this.catRepo.findOne({
      where: { id },
      relations: ['children'],
    });
  }

  create(data: { nome: string; parent_id?: string; cor?: string; icone?: string; ignorar_dashboard?: boolean }) {
    const cat = this.catRepo.create(data);
    return this.catRepo.save(cat);
  }

  async update(id: string, data: Partial<Category>) {
    const oldCat = await this.catRepo.findOneBy({ id });
    await this.catRepo.update(id, data);
    const updated = await this.catRepo.findOneBy({ id });

    // Se o nome da categoria/subcategoria mudou, atualiza em cascata todas as transações e regras
    if (oldCat && updated && oldCat.nome !== updated.nome) {
      if (oldCat.parent_id) {
        await this.txRepo
          .createQueryBuilder()
          .update(Transaction)
          .set({ subcategoria: updated.nome })
          .where('subcategoria = :oldName', { oldName: oldCat.nome })
          .execute();

        await this.ruleRepo
          .createQueryBuilder()
          .update(ClassificationRule)
          .set({ subcategoria: updated.nome })
          .where('subcategoria = :oldName', { oldName: oldCat.nome })
          .execute();
      } else {
        await this.txRepo
          .createQueryBuilder()
          .update(Transaction)
          .set({ categoria: updated.nome })
          .where('categoria = :oldName', { oldName: oldCat.nome })
          .execute();

        await this.ruleRepo
          .createQueryBuilder()
          .update(ClassificationRule)
          .set({ categoria: updated.nome })
          .where('categoria = :oldName', { oldName: oldCat.nome })
          .execute();
      }
    }
    return updated;
  }

  async remove(id: string) {
    const cat = await this.catRepo.findOne({
      where: { id },
      relations: ['children'],
    });
    if (!cat) return null;

    // Collect all names to null out (parent + children)
    const namesToNull = [cat.nome];
    if (cat.children && cat.children.length > 0) {
      cat.children.forEach((c) => namesToNull.push(c.nome));
    }

    // Null out transactions referencing this category (or its children)
    for (const nome of namesToNull) {
      // Null categoria on transactions that match
      await this.txRepo
        .createQueryBuilder()
        .update(Transaction)
        .set({ categoria: null, subcategoria: null, matched_rule_id: null })
        .where('categoria = :nome', { nome })
        .execute();

      // Also null subcategoria only (when only subcategory is deleted)
      await this.txRepo
        .createQueryBuilder()
        .update(Transaction)
        .set({ subcategoria: null })
        .where('subcategoria = :nome', { nome })
        .execute();

      // Null rules referencing this category
      await this.ruleRepo
        .createQueryBuilder()
        .update(ClassificationRule)
        .set({ categoria: 'Não classificado', subcategoria: null })
        .where('categoria = :nome', { nome })
        .execute();

      // Null subcategoria on rules
      await this.ruleRepo
        .createQueryBuilder()
        .update(ClassificationRule)
        .set({ subcategoria: null })
        .where('subcategoria = :nome', { nome })
        .execute();
    }

    await this.catRepo.remove(cat);
    return cat;
  }

  /**
   * Ensures a category (and optionally subcategory) exists in the DB.
   * Creates them if they don't exist yet. Used by Rules/Classification services
   * when a new category name is introduced via a rule.
   */
  async ensureExists(
    categoriaNome: string,
    subcategoriaNome?: string | null,
  ): Promise<void> {
    if (!categoriaNome || categoriaNome === 'Não classificado') return;

    // Find or create the parent category
    let parent = await this.catRepo.findOne({
      where: { nome: categoriaNome, parent_id: IsNull() },
    });

    if (!parent) {
      parent = await this.catRepo.save(
        this.catRepo.create({
          nome: categoriaNome,
          cor: '#6366f1',
        }),
      );
    }

    // Find or create subcategory if provided
    if (subcategoriaNome) {
      const existing = await this.catRepo.findOne({
        where: { nome: subcategoriaNome, parent_id: parent.id },
      });
      if (!existing) {
        await this.catRepo.save(
          this.catRepo.create({
            nome: subcategoriaNome,
            parent_id: parent.id,
            cor: parent.cor || '#94a3b8',
          }),
        );
      }
    }
  }
}
