/**
 * version-checker.ts
 * Serviço isolado e testável para verificação de versões via GitHub Releases API.
 * Não depende do Electron nem do electron-updater — pode ser testado com Jest puro.
 */

import * as https from 'https';

export type UpdateChannel = 'latest' | 'beta' | 'dev';

export interface GitHubRelease {
  tag_name: string;
  name: string;
  prerelease: boolean;
  published_at: string;
  html_url: string;
}

export interface UpdateCheckResult {
  /** Status da verificação */
  status: 'up-to-date' | 'update-available' | 'error';
  /** Versão atual instalada */
  currentVersion: string;
  /** Versão mais recente no GitHub (quando disponível) */
  latestVersion?: string;
  /** Canal detectado com base na versão instalada */
  channel: UpdateChannel;
  /** URL da release no GitHub (quando disponível) */
  releaseUrl?: string;
  /** Mensagem descritiva para exibir ao usuário */
  message: string;
  /** Erro técnico original (para log interno) */
  error?: string;
}

/**
 * Detecta o canal de atualização com base na versão instalada.
 * Ex: "1.1.3-beta.42" → 'beta', "1.1.3-dev.5" → 'dev', "1.1.3" → 'latest'
 */
export function detectChannel(version: string): UpdateChannel {
  if (version.includes('-dev.')) return 'dev';
  if (version.includes('-beta.')) return 'beta';
  return 'latest';
}

/**
 * Extrai o número de build do sufixo de pré-lançamento.
 * Ex: "1.1.3-beta.42" → 42, "1.1.3" → -1 (release estável é maior)
 */
function extractBuildNumber(version: string): number {
  const clean = version.replace(/^v/, '');
  const match = clean.match(/-(beta|dev)\.(\d+)$/);
  if (match) return parseInt(match[2], 10);
  // Sem sufixo = release estável, considerada maior que qualquer pre-release
  return Infinity;
}

/**
 * Compara duas versões semver.
 * Quando o core (major.minor.patch) é idêntico, compara o número de build
 * do sufixo de pré-lançamento (ex: beta.50 > beta.42).
 * Retorna true se remoteVersion for mais nova que localVersion.
 */
export function isNewerVersion(localVersion: string, remoteVersion: string): boolean {
  const stripSuffix = (v: string) => v.replace(/^v/, '').split('-')[0];

  const parseCore = (v: string): number[] =>
    stripSuffix(v)
      .split('.')
      .map((n) => parseInt(n, 10) || 0);

  const local = parseCore(localVersion);
  const remote = parseCore(remoteVersion);

  for (let i = 0; i < Math.max(local.length, remote.length); i++) {
    const l = local[i] ?? 0;
    const r = remote[i] ?? 0;
    if (r > l) return true;
    if (r < l) return false;
  }

  // Cores idênticos: compara sufixo de build
  const localBuild = extractBuildNumber(localVersion);
  const remoteBuild = extractBuildNumber(remoteVersion);
  return remoteBuild > localBuild;
}

/**
 * Faz uma requisição HTTPS e retorna o body como string.
 * Inclui timeout configurável e tratamento de erro de rede.
 */
export function httpsGet(
  url: string,
  timeoutMs = 10000,
): Promise<{ statusCode: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: {
          'User-Agent': 'app-financeiro-updater/1.0',
          Accept: 'application/vnd.github+json',
        },
      },
      (res) => {
        let body = '';
        res.on('data', (chunk: Buffer) => {
          body += chunk.toString();
        });
        res.on('end', () => {
          resolve({ statusCode: res.statusCode ?? 0, body });
        });
        res.on('error', reject);
      },
    );

    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`Timeout após ${timeoutMs}ms`));
    });

    req.on('error', (err) => {
      if ((err as NodeJS.ErrnoException).code === 'ENOTFOUND') {
        reject(new Error('Sem conexão com a internet ou GitHub inacessível.'));
      } else {
        reject(err);
      }
    });
  });
}

/**
 * Busca releases do GitHub e decide se há uma atualização disponível.
 *
 * @param currentVersion  Versão atualmente instalada (ex: "1.1.3" ou "1.1.3-beta.42")
 * @param owner           Dono do repositório no GitHub
 * @param repo            Nome do repositório
 * @param allowPrerelease Se true, considera releases marcadas como pré-lançamento
 * @param fetcher         Função de HTTP substituível para testes (padrão: httpsGet)
 */
export async function checkForUpdate(
  currentVersion: string,
  owner: string,
  repo: string,
  allowPrerelease = false,
  fetcher: typeof httpsGet = httpsGet,
): Promise<UpdateCheckResult> {
  const channel = detectChannel(currentVersion);

  // Para canais beta/dev, sempre considera pré-lançamentos
  const checkPrerelease = allowPrerelease || channel !== 'latest';

  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/releases`;

  let releases: GitHubRelease[];

  try {
    const { statusCode, body } = await fetcher(apiUrl);

    if (statusCode === 403) {
      return {
        status: 'error',
        currentVersion,
        channel,
        message: 'Limite de requisições da API do GitHub atingido. Tente novamente em alguns minutos.',
        error: `HTTP 403 – Rate limit`,
      };
    }

    if (statusCode === 404) {
      return {
        status: 'error',
        currentVersion,
        channel,
        message: 'Repositório não encontrado no GitHub.',
        error: `HTTP 404 – Not found`,
      };
    }

    if (statusCode < 200 || statusCode >= 300) {
      return {
        status: 'error',
        currentVersion,
        channel,
        message: `Erro ao consultar o GitHub (HTTP ${statusCode}).`,
        error: `HTTP ${statusCode}`,
      };
    }

    try {
      releases = JSON.parse(body) as GitHubRelease[];
    } catch {
      return {
        status: 'error',
        currentVersion,
        channel,
        message: 'Resposta inválida recebida do GitHub.',
        error: 'JSON parse error',
      };
    }
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Erro desconhecido ao verificar atualizações.';
    const isTimeout = message.toLowerCase().includes('timeout');
    return {
      status: 'error',
      currentVersion,
      channel,
      message: isTimeout
        ? 'Tempo de resposta esgotado. Verifique sua conexão com a internet.'
        : `Erro de rede: ${message}`,
      error: message,
    };
  }

  if (!Array.isArray(releases) || releases.length === 0) {
    return {
      status: 'up-to-date',
      currentVersion,
      channel,
      message: 'Nenhuma release encontrada no GitHub.',
    };
  }

  // Filtra releases: ignora pre-releases a não ser que checkPrerelease seja true
  const candidates = releases.filter((r) => checkPrerelease || !r.prerelease);

  if (candidates.length === 0) {
    return {
      status: 'up-to-date',
      currentVersion,
      channel,
      message: 'Você já possui a versão mais recente.',
    };
  }

  // A primeira release da lista já é a mais recente (GitHub ordena por data desc)
  const latest = candidates[0];
  const latestVersion = latest.tag_name.replace(/^v/, '');

  if (isNewerVersion(currentVersion, latestVersion)) {
    return {
      status: 'update-available',
      currentVersion,
      latestVersion,
      channel,
      releaseUrl: latest.html_url,
      message: `Nova versão ${latestVersion} disponível!`,
    };
  }

  return {
    status: 'up-to-date',
    currentVersion,
    latestVersion,
    channel,
    message: 'Você já possui a versão mais recente.',
  };
}
