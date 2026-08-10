import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Transaction } from '../entities/transaction.entity';
import { PluggyItem } from '../entities/pluggy-item.entity';
import { ClassifierService } from '../services/classifier.service';
import { Category } from '../entities/category.entity';

import { Setting } from '../entities/setting.entity';

@Injectable()
export class PluggyService implements OnModuleInit {
  private readonly logger = new Logger(PluggyService.name);
  private cachedApiKey: string | null = null;
  private apiKeyExpiresAt = 0;

  constructor(
    @InjectRepository(Transaction)
    private readonly txRepo: Repository<Transaction>,
    @InjectRepository(PluggyItem)
    private readonly itemRepo: Repository<PluggyItem>,
    @InjectRepository(Category)
    private readonly catRepo: Repository<Category>,
    @InjectRepository(Setting)
    private readonly settingRepo: Repository<Setting>,
    private readonly classifierService: ClassifierService,
  ) {}

  async onModuleInit() {
    try {
      // Normalizar transações do Pluggy com valor positivo em contas de cartão/débito
      await this.txRepo.query(
        `UPDATE transactions SET valor = -ABS(valor) WHERE source = 'PLUGGY' AND (account_type = 'CREDIT' OR payment_method = 'DEBIT') AND valor > 0 AND (categoria IS NULL OR categoria NOT IN ('Fatura', 'Pagamento de Fatura'));`
      );
      this.logger.log('[PluggyService] Sinais de valores de transações normalizados no banco com sucesso.');
    } catch (e) {
      this.logger.error(`[PluggyService] Erro ao normalizar valores das transações: ${(e as Error).message}`);
    }
  }

  async getCredentialsConfig(): Promise<{ hasCredentials: boolean; clientId: string | null; clientSecret: string | null }> {
    let clientIdSetting = await this.settingRepo.findOneBy({ key: 'pluggy_client_id' });
    let clientSecretSetting = await this.settingRepo.findOneBy({ key: 'pluggy_client_secret' });

    const clientId = clientIdSetting?.value || process.env.PLUGGY_CLIENT_ID || null;
    const clientSecret = clientSecretSetting?.value || process.env.PLUGGY_CLIENT_SECRET || null;

    return {
      hasCredentials: Boolean(clientId && clientSecret),
      clientId,
      clientSecret,
    };
  }

  async saveCredentials(clientId: string, clientSecret: string): Promise<{ success: boolean }> {
    let idSetting = await this.settingRepo.findOneBy({ key: 'pluggy_client_id' });
    if (!idSetting) idSetting = this.settingRepo.create({ key: 'pluggy_client_id' });
    idSetting.value = clientId.trim();
    await this.settingRepo.save(idSetting);

    let secretSetting = await this.settingRepo.findOneBy({ key: 'pluggy_client_secret' });
    if (!secretSetting) secretSetting = this.settingRepo.create({ key: 'pluggy_client_secret' });
    secretSetting.value = clientSecret.trim();
    await this.settingRepo.save(secretSetting);

    // Resetar cache de API key para forçar reautenticação
    this.cachedApiKey = null;
    this.apiKeyExpiresAt = 0;

    return { success: true };
  }

  private async getApiKey(): Promise<string> {
    const creds = await this.getCredentialsConfig();
    let clientSecretSetting = await this.settingRepo.findOneBy({ key: 'pluggy_client_secret' });
    const clientSecret = clientSecretSetting?.value || process.env.PLUGGY_CLIENT_SECRET;

    if (!creds.clientId || !clientSecret) {
      throw new Error(
        'Credenciais do Pluggy (Client ID e Client Secret) não estão configuradas no app nem no .env. Cadastre-as nas Configurações.',
      );
    }

    // Usar API key estática da .env se fornecida e válida, ou reutilizar o cache se não expirado
    if (process.env.PLUGGY_API_KEY && process.env.PLUGGY_API_KEY.length > 50) {
      return process.env.PLUGGY_API_KEY;
    }

    const now = Date.now();
    if (this.cachedApiKey && now < this.apiKeyExpiresAt - 300000) {
      return this.cachedApiKey;
    }

    try {
      const res = await fetch('https://api.pluggy.ai/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: creds.clientId, clientSecret }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        this.logger.error(`Falha de autenticação na API do Pluggy (${res.status}): ${errorText}`);
        throw new Error(`Credenciais do Pluggy rejeitadas (HTTP ${res.status}): ${errorText}`);
      }

      const data = await res.json();
      this.cachedApiKey = data.apiKey;
      // API key do Pluggy expira em 2 horas (7200 segundos)
      this.apiKeyExpiresAt = now + 7200 * 1000;
      return data.apiKey;
    } catch (err) {
      const cause = err?.cause?.message || err?.cause?.code || err.message;
      this.logger.error(`Erro de rede ao conectar com api.pluggy.ai: ${cause}`);
      throw new Error(`Não foi possível alcançar a API do Pluggy. Verifique sua conexão com a internet e as credenciais nas Configurações. (${cause})`);
    }
  }

  async createConnectToken(clientUserId?: string): Promise<{ connectToken: string }> {
    const apiKey = await this.getApiKey();

    const res = await fetch('https://api.pluggy.ai/connect_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': apiKey,
      },
      body: JSON.stringify({
        options: {
          clientUserId: clientUserId || 'user_app_financeiro',
        },
      }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      this.logger.error(`Falha ao criar connectToken: ${errorText}`);
      throw new Error(`Erro ao gerar token do Pluggy Connect: ${res.statusText}`);
    }

    const data = await res.json();
    return { connectToken: data.accessToken };
  }

  async getConnections(): Promise<PluggyItem[]> {
    return this.itemRepo.find({ order: { created_at: 'DESC' } });
  }

  async deleteConnection(itemId: string): Promise<{ success: boolean }> {
    await this.txRepo.delete({ pluggy_item_id: itemId });
    await this.itemRepo.delete({ id: itemId });
    return { success: true };
  }

  async syncItem(itemId?: string): Promise<{ success: boolean; syncedItemsCount: number; newTransactionsCount: number }> {
    const apiKey = await this.getApiKey();
    let itemIdsToSync: string[] = [];

    if (itemId) {
      itemIdsToSync = [itemId];
    } else {
      const savedItems = await this.itemRepo.find();
      itemIdsToSync = savedItems.map((item) => item.id);
    }

    if (itemIdsToSync.length === 0) {
      return { success: true, syncedItemsCount: 0, newTransactionsCount: 0 };
    }

    const rules = await this.classifierService.loadRules();
    const ignoredCatNames = (await this.catRepo.find({ where: { ignorar_dashboard: true } })).map(c => c.nome.toLowerCase());
    let totalNewOrUpdated = 0;

    for (const id of itemIdsToSync) {
      try {
        // 1. Obter informações do Item no Pluggy com retentativas se estiver UPDATING
        let connectorName = 'Banco Conectado';
        let itemStatus = 'UPDATED';
        let itemData: any = null;

        let attempts = 0;
        const maxAttempts = 5;
        while (attempts < maxAttempts) {
          const itemRes = await fetch(`https://api.pluggy.ai/items/${id}`, {
            headers: { 'X-API-KEY': apiKey },
          });

          if (itemRes.ok) {
            itemData = await itemRes.json();
            connectorName = itemData.connector?.name || connectorName;
            itemStatus = itemData.status || itemStatus;
            
            this.logger.log(`[PluggyService] Item ${id} (${connectorName}) - Status atual: ${itemStatus}`);

            // Se o item ainda estiver sincronizando (UPDATING / OUT_OF_DATE), aguardar 3s para retentar
            if (itemStatus === 'UPDATING' && attempts < maxAttempts - 1) {
              await new Promise((resolve) => setTimeout(resolve, 3000));
              attempts++;
              continue;
            }
          }
          break;
        }

        // 2. Buscar Contas vinculadas ao Item
        const accountsRes = await fetch(`https://api.pluggy.ai/accounts?itemId=${id}`, {
          headers: { 'X-API-KEY': apiKey },
        });

        if (!accountsRes.ok) {
          const errTxt = await accountsRes.text();
          this.logger.warn(`[PluggyService] Não foi possível buscar contas do item ${id} (HTTP ${accountsRes.status}): ${errTxt}`);
          continue;
        }

        const accountsData = await accountsRes.json();
        const accounts = accountsData.results || accountsData || [];
        this.logger.log(`[PluggyService] Item ${id} (${connectorName}): ${accounts.length} conta(s) encontrada(s).`);
        this.logger.log(`[PluggyService] RAW Accounts JSON: ${JSON.stringify(accounts)}`);

        // Nome real da instituição vindo da API (ex: "C6 BANK")
        let realBankName = connectorName;
        for (const acc of accounts) {
          const accName = (acc.name || '').trim();
          if (acc.marketingName) {
            realBankName = acc.marketingName;
            break;
          } else if (accName && !accName.toUpperCase().includes('BANDEIRADO') && connectorName === 'MeuPluggy') {
            realBankName = accName;
            break;
          }
        }

        // Salvar/Atualizar registro do Item no banco local
        let pluggyItem = await this.itemRepo.findOneBy({ id });
        if (!pluggyItem) {
          pluggyItem = this.itemRepo.create({ id });
        }
        pluggyItem.connector_name = realBankName !== connectorName ? `${realBankName} (via ${connectorName})` : connectorName;
        pluggyItem.status = itemStatus;
        pluggyItem.last_synced_at = new Date().toISOString();
        await this.itemRepo.save(pluggyItem);

        // 3. Para cada conta, buscar transações via v2 API (com paginação por cursor)
        for (const account of accounts) {
          const isCreditCard = account.type === 'CREDIT' || account.subtype === 'CREDIT_CARD';
          const accountTypeLabel = isCreditCard ? 'CREDIT' : 'CHECKING';
          const bankName = realBankName;

          let afterCursor: string | null = null;
          let hasMore = true;

          while (hasMore) {
            let url = `https://api.pluggy.ai/v2/transactions?accountId=${account.id}`;
            if (afterCursor) {
              url += `&after=${encodeURIComponent(afterCursor)}`;
            }

            const txRes = await fetch(url, {
              headers: { 'X-API-KEY': apiKey },
            });

            if (!txRes.ok) {
              const errTxt = await txRes.text();
              this.logger.error(`[PluggyService] Erro ao buscar transações v2 da conta ${account.id} (HTTP ${txRes.status}): ${errTxt}`);
              break;
            }

            const txData = await txRes.json();
            const pluggyTxs = txData.results || [];
            this.logger.log(`[PluggyService] ${bankName} - Conta "${account.name || 'Principal'}" (${account.type}): ${pluggyTxs.length} transação(ões) retornada(s) da API v2.`);
            hasMore = Boolean(txData.next);
            afterCursor = txData.next ? new URLSearchParams(txData.next.split('?')[1] || '').get('after') : null;
            hasMore = Boolean(txData.next);
            afterCursor = txData.next ? new URLSearchParams(txData.next.split('?')[1] || '').get('after') : null;

            for (const pTx of pluggyTxs) {
              const dataFormatada = (pTx.date || new Date().toISOString()).substring(0, 10);
              const descClean = pTx.description || 'Transação sem descrição';
              const descRaw = pTx.descriptionRaw || descClean;

              // Identificar se é fatura de cartão ou transferência interna para marcar ignorar_dashboard
              let ignorarDash = false;
              let ignoreReason: string | null = null;

              const descUpper = descClean.toUpperCase();
              if (
                descUpper.includes('PAGAMENTO FATURA') ||
                descUpper.includes('PAGTO FATURA') ||
                descUpper.includes('PAGAMENTO DE FATURA') ||
                pTx.category === 'Credit Card Payment'
              ) {
                ignorarDash = true;
                ignoreReason = 'Pagamento de Fatura de Cartão (Desconsiderado para evitar duplicidade)';
              } else if (
                descUpper.includes('TRANSFERENCIA MESMA TITULARIDADE') ||
                descUpper.includes('TRANSF ENTRE CONTAS')
              ) {
                ignorarDash = true;
                ignoreReason = 'Transferência entre contas próprias';
              }

              // Extrair metadados de parcelamento (1/4)
              const parcelaAtual = pTx.creditCardMetadata?.installmentNumber || null;
              const totalParcelas = pTx.creditCardMetadata?.totalInstallments || null;
              const paymentMethod = pTx.paymentData?.paymentMethod || pTx.type || (isCreditCard ? 'CREDIT' : 'DEBIT');

              // Sinal do valor: DEBIT = Saída/Despesa (negativo), CREDIT = Entrada/Receita (positivo)
              let realAmount = pTx.amount;
              if (pTx.type === 'DEBIT') {
                realAmount = -Math.abs(pTx.amount);
              } else if (pTx.type === 'CREDIT') {
                realAmount = Math.abs(pTx.amount);
              } else if (isCreditCard && pTx.amount > 0) {
                realAmount = -Math.abs(pTx.amount);
              }

              // Classificação de Categoria
              const classification = this.classifierService.classifyTransaction(
                {
                  titulo: descClean,
                  descricao: descRaw,
                  valor: realAmount,
                  banco: bankName,
                },
                rules,
              );

              // Se a regra de classificação ou a categoria atribuída ignorar o dashboard por padrão
              if (!ignorarDash && classification.ignorar_dashboard) {
                ignorarDash = true;
                ignoreReason = `Regra de classificação (${classification.categoria})`;
              } else if (!ignorarDash && ignoredCatNames.includes(classification.categoria.toLowerCase())) {
                ignorarDash = true;
                ignoreReason = `Categoria ${classification.categoria} desconsiderada do Dashboard`;
              }

              // Buscar se já existe por pluggy_transaction_id ou por coincidencia de CSV
              let existingTx = await this.txRepo.findOneBy({ pluggy_transaction_id: pTx.id });

              if (!existingTx) {
                // Tentar encontrar coincidência por ID padrão
                existingTx = await this.txRepo.findOneBy({ id: pTx.id });
              }

              if (!existingTx) {
                // Buscar por (data, valor, banco) se veio de um CSV antigo
                existingTx = await this.txRepo.findOne({
                  where: {
                    data: dataFormatada,
                    valor: realAmount,
                    banco: bankName,
                  },
                });
              }

              if (existingTx) {
                // Atualizar com os dados da API (Prioridade da API)
                existingTx.source = 'PLUGGY';
                existingTx.pluggy_transaction_id = pTx.id;
                existingTx.pluggy_account_id = account.id;
                existingTx.pluggy_item_id = id;
                existingTx.payment_method = paymentMethod;
                existingTx.account_type = accountTypeLabel;
                existingTx.parcela_atual = parcelaAtual;
                existingTx.total_parcelas = totalParcelas;
                existingTx.valor = realAmount;

                if (!existingTx.is_manual) {
                  existingTx.categoria = classification.categoria;
                  existingTx.subcategoria = classification.subcategoria;
                  existingTx.matched_rule_id = classification.matched_rule_id;
                  if (classification.set_custo_fixo) {
                    existingTx.is_custo_fixo = true;
                  }
                }

                if (ignorarDash && !existingTx.ignorar_dashboard) {
                  existingTx.ignorar_dashboard = true;
                  existingTx.ignore_reason = ignoreReason;
                }

                await this.txRepo.save(existingTx);
              } else {
                // Criar nova transação
                const newTx = this.txRepo.create({
                  id: pTx.id,
                  data: dataFormatada,
                  titulo: descClean,
                  descricao: descRaw,
                  valor: realAmount,
                  banco: bankName,
                  account_type: accountTypeLabel,
                  categoria: classification.categoria,
                  subcategoria: classification.subcategoria,
                  matched_rule_id: classification.matched_rule_id,
                  is_manual: false,
                  source: 'PLUGGY',
                  pluggy_transaction_id: pTx.id,
                  pluggy_account_id: account.id,
                  pluggy_item_id: id,
                  payment_method: paymentMethod,
                  ignorar_dashboard: ignorarDash,
                  ignore_reason: ignoreReason,
                  parcela_atual: parcelaAtual,
                  total_parcelas: totalParcelas,
                  is_custo_fixo: classification.set_custo_fixo || false,
                });

                await this.txRepo.save(newTx);
                totalNewOrUpdated++;
              }
            }
          }
        }
      } catch (err) {
        this.logger.error(`Erro ao sincronizar item ${id}: ${(err as Error).message}`);
      }
    }

    return {
      success: true,
      syncedItemsCount: itemIdsToSync.length,
      newTransactionsCount: totalNewOrUpdated,
    };
  }
}
