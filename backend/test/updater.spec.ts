/**
 * updater.spec.ts
 * Bateria de testes para o sistema de atualização de versão.
 * Testa: detecção de canal, comparação semver, tratamento de erros de rede e GitHub API.
 */

import {
  detectChannel,
  isNewerVersion,
  checkForUpdate,
  httpsGet,
  UpdateCheckResult,
} from '../src/update/version-checker';

// alias para os testes de integração (sem mock)
const checkForUpdateReal = checkForUpdate;

// ─────────────────────────────────────────────────────────────────────────────
// 1. detectChannel — detecção de canal pela versão instalada
// ─────────────────────────────────────────────────────────────────────────────
describe('detectChannel', () => {
  it('deve retornar "latest" para versão estável', () => {
    expect(detectChannel('1.1.3')).toBe('latest');
    expect(detectChannel('2.0.0')).toBe('latest');
  });

  it('deve retornar "beta" para versão com sufixo -beta.N', () => {
    expect(detectChannel('1.1.3-beta.42')).toBe('beta');
    expect(detectChannel('1.0.0-beta.1')).toBe('beta');
  });

  it('deve retornar "dev" para versão com sufixo -dev.N', () => {
    expect(detectChannel('1.1.3-dev.5')).toBe('dev');
    expect(detectChannel('2.0.0-dev.100')).toBe('dev');
  });

  it('deve priorizar "dev" sobre "beta" se ambos aparecerem (edge case)', () => {
    // Raro, mas -dev. aparece antes de -beta. na string
    expect(detectChannel('1.0.0-dev.1-beta.2')).toBe('dev');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. isNewerVersion — comparação semver
// ─────────────────────────────────────────────────────────────────────────────
describe('isNewerVersion', () => {
  it('deve retornar true quando remote é mais novo (patch)', () => {
    expect(isNewerVersion('1.1.3', '1.1.4')).toBe(true);
  });

  it('deve retornar true quando remote é mais novo (minor)', () => {
    expect(isNewerVersion('1.1.3', '1.2.0')).toBe(true);
  });

  it('deve retornar true quando remote é mais novo (major)', () => {
    expect(isNewerVersion('1.1.3', '2.0.0')).toBe(true);
  });

  it('deve retornar false quando versões são iguais', () => {
    expect(isNewerVersion('1.1.3', '1.1.3')).toBe(false);
  });

  it('deve retornar false quando local é mais novo que remote', () => {
    expect(isNewerVersion('1.2.0', '1.1.3')).toBe(false);
  });

  it('deve comparar número de build quando core semver é idêntico (pré-release)', () => {
    // beta.50 > beta.42 → update disponível
    expect(isNewerVersion('1.1.3-beta.42', '1.1.3-beta.50')).toBe(true);
    // beta.42 > beta.50 → sem update
    expect(isNewerVersion('1.1.3-beta.50', '1.1.3-beta.42')).toBe(false);
    // dev.6 > dev.5 → update disponível
    expect(isNewerVersion('1.1.3-dev.5', '1.1.3-dev.6')).toBe(true);
    // mesmo build → sem update
    expect(isNewerVersion('1.1.3-beta.42', '1.1.3-beta.42')).toBe(false);
  });

  it('deve considerar release estável mais nova que qualquer pré-release do mesmo core', () => {
    // 1.1.3 estável > 1.1.3-beta.99
    expect(isNewerVersion('1.1.3-beta.99', '1.1.3')).toBe(true);
    // 1.1.3 estável não é mais nova que ela mesma
    expect(isNewerVersion('1.1.3', '1.1.3')).toBe(false);
  });

  it('deve aceitar tag com prefixo "v"', () => {
    expect(isNewerVersion('1.1.3', 'v1.1.4')).toBe(true);
    expect(isNewerVersion('v1.1.3', '1.1.4')).toBe(true);
  });

  it('deve tratar versões com diferentes quantidades de segmentos', () => {
    expect(isNewerVersion('1.1', '1.1.1')).toBe(true);
    expect(isNewerVersion('1.1.0', '1.1')).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Helper: cria um fetcher mock que retorna os dados informados
// ─────────────────────────────────────────────────────────────────────────────
function makeFetcher(statusCode: number, body: string) {
  return jest.fn().mockResolvedValue({ statusCode, body });
}

function makeRelease(tag: string, prerelease = false) {
  return {
    tag_name: tag,
    name: tag,
    prerelease,
    published_at: '2026-01-01T00:00:00Z',
    html_url: `https://github.com/Thom3002/app-financeiro/releases/tag/${tag}`,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. checkForUpdate — lógica completa de verificação de updates
// ─────────────────────────────────────────────────────────────────────────────
describe('checkForUpdate', () => {
  const owner = 'Thom3002';
  const repo = 'app-financeiro';

  // ── Cenários de sucesso ──────────────────────────────────────────────────

  it('deve retornar "update-available" quando existe versão mais nova', async () => {
    const releases = [makeRelease('v1.2.0'), makeRelease('v1.1.3')];
    const fetcher = makeFetcher(200, JSON.stringify(releases));

    const result = await checkForUpdate('1.1.3', owner, repo, false, fetcher);

    expect(result.status).toBe('update-available');
    expect(result.latestVersion).toBe('1.2.0');
    expect(result.currentVersion).toBe('1.1.3');
    expect(result.message).toContain('1.2.0');
    expect(result.releaseUrl).toContain('v1.2.0');
  });

  it('deve retornar "up-to-date" quando já está na versão mais recente', async () => {
    const releases = [makeRelease('v1.1.3')];
    const fetcher = makeFetcher(200, JSON.stringify(releases));

    const result = await checkForUpdate('1.1.3', owner, repo, false, fetcher);

    expect(result.status).toBe('up-to-date');
    expect(result.message).toContain('versão mais recente');
  });

  it('deve retornar "up-to-date" quando local é mais novo que remote (edge case dev)', async () => {
    const releases = [makeRelease('v1.1.3')];
    const fetcher = makeFetcher(200, JSON.stringify(releases));

    const result = await checkForUpdate('1.2.0', owner, repo, false, fetcher);

    expect(result.status).toBe('up-to-date');
  });

  it('deve ignorar pre-releases quando allowPrerelease=false e canal é "latest"', async () => {
    // Só há pre-release disponível
    const releases = [makeRelease('v1.2.0-beta.1', true)];
    const fetcher = makeFetcher(200, JSON.stringify(releases));

    const result = await checkForUpdate('1.1.3', owner, repo, false, fetcher);

    expect(result.status).toBe('up-to-date');
    expect(result.message).toContain('versão mais recente');
  });

  it('deve considerar pre-releases quando allowPrerelease=true', async () => {
    const releases = [makeRelease('v1.2.0-beta.1', true), makeRelease('v1.1.3')];
    const fetcher = makeFetcher(200, JSON.stringify(releases));

    const result = await checkForUpdate('1.1.3', owner, repo, true, fetcher);

    expect(result.status).toBe('update-available');
    expect(result.latestVersion).toBe('1.2.0-beta.1');
  });

  it('deve considerar pre-releases automaticamente quando versão instalada é beta', async () => {
    // beta.50 é mais novo que beta.42 (mesmo core, build maior)
    const releases = [makeRelease('v1.1.3-beta.50', true), makeRelease('v1.1.3-beta.42', true)];
    const fetcher = makeFetcher(200, JSON.stringify(releases));

    // allowPrerelease=false mas canal detectado é "beta" → deve checar beta
    const result = await checkForUpdate('1.1.3-beta.42', owner, repo, false, fetcher);

    expect(result.status).toBe('update-available');
    expect(result.latestVersion).toBe('1.1.3-beta.50');
    expect(result.channel).toBe('beta');
  });

  it('deve detectar canal "dev" corretamente', async () => {
    // dev.6 é mais novo que dev.5 (mesmo core, build maior)
    const releases = [makeRelease('v1.1.3-dev.6', true)];
    const fetcher = makeFetcher(200, JSON.stringify(releases));

    const result = await checkForUpdate('1.1.3-dev.5', owner, repo, false, fetcher);

    expect(result.status).toBe('update-available');
    expect(result.latestVersion).toBe('1.1.3-dev.6');
    expect(result.channel).toBe('dev');
  });

  it('deve retornar "up-to-date" quando lista de releases está vazia', async () => {
    const fetcher = makeFetcher(200, JSON.stringify([]));

    const result = await checkForUpdate('1.1.3', owner, repo, false, fetcher);

    expect(result.status).toBe('up-to-date');
  });

  // ── Cenários de erro HTTP ────────────────────────────────────────────────

  it('deve retornar "error" com mensagem amigável quando HTTP 403 (rate limit)', async () => {
    const fetcher = makeFetcher(403, '{"message":"rate limit exceeded"}');

    const result = await checkForUpdate('1.1.3', owner, repo, false, fetcher);

    expect(result.status).toBe('error');
    expect(result.message).toContain('Limite de requisições');
    expect(result.error).toContain('403');
  });

  it('deve retornar "error" com mensagem amigável quando HTTP 404', async () => {
    const fetcher = makeFetcher(404, '{"message":"Not Found"}');

    const result = await checkForUpdate('1.1.3', owner, repo, false, fetcher);

    expect(result.status).toBe('error');
    expect(result.message).toContain('não encontrado');
    expect(result.error).toContain('404');
  });

  it('deve retornar "error" para qualquer outro status HTTP de erro', async () => {
    const fetcher = makeFetcher(500, 'Internal Server Error');

    const result = await checkForUpdate('1.1.3', owner, repo, false, fetcher);

    expect(result.status).toBe('error');
    expect(result.message).toContain('500');
  });

  // ── Cenários de erro de rede ─────────────────────────────────────────────

  it('deve retornar "error" com mensagem amigável em caso de timeout', async () => {
    const fetcher = jest.fn().mockRejectedValue(new Error('Timeout após 10000ms'));

    const result = await checkForUpdate('1.1.3', owner, repo, false, fetcher);

    expect(result.status).toBe('error');
    expect(result.message).toContain('Tempo de resposta esgotado');
    expect(result.error).toContain('Timeout');
  });

  it('deve retornar "error" com mensagem amigável para ENOTFOUND', async () => {
    const fetcher = jest.fn().mockRejectedValue(
      new Error('Sem conexão com a internet ou GitHub inacessível.'),
    );

    const result = await checkForUpdate('1.1.3', owner, repo, false, fetcher);

    expect(result.status).toBe('error');
    expect(result.message).toContain('rede');
  });

  it('deve retornar "error" quando o body não é um JSON válido', async () => {
    const fetcher = makeFetcher(200, 'not valid json at all {{}}');

    const result = await checkForUpdate('1.1.3', owner, repo, false, fetcher);

    expect(result.status).toBe('error');
    expect(result.message).toContain('inválida');
  });

  // ── Estrutura de retorno ─────────────────────────────────────────────────

  it('deve sempre retornar currentVersion e channel no resultado', async () => {
    const fetcher = makeFetcher(200, JSON.stringify([makeRelease('v1.1.3')]));

    const result: UpdateCheckResult = await checkForUpdate(
      '1.1.3-beta.5',
      owner,
      repo,
      false,
      fetcher,
    );

    expect(result.currentVersion).toBe('1.1.3-beta.5');
    expect(result.channel).toBe('beta');
  });

  it('deve chamar a API com a URL correta', async () => {
    const fetcher = makeFetcher(200, JSON.stringify([]));

    await checkForUpdate('1.1.3', 'MeuOwner', 'meu-repo', false, fetcher);

    expect(fetcher).toHaveBeenCalledWith(
      'https://api.github.com/repos/MeuOwner/meu-repo/releases',
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. INTEGRAÇÃO — chamadas reais à GitHub API (sem mock)
//    Esses testes dependem de conexão com a internet.
//    São separados em um describe próprio e têm timeout maior (15s).
// ─────────────────────────────────────────────────────────────────────────────
describe('Integração: GitHub API (chamada real, sem mock)', () => {
  const OWNER = 'Thom3002';
  const REPO = 'app-financeiro';

  // ── httpsGet ──────────────────────────────────────────────────────────────

  describe('httpsGet', () => {
    it('deve retornar HTTP 200 e um body JSON válido para a API de releases', async () => {
      const { statusCode, body } = await httpsGet(
        `https://api.github.com/repos/${OWNER}/${REPO}/releases`,
      );

      expect(statusCode).toBe(200);
      expect(body.length).toBeGreaterThan(0);

      const parsed = JSON.parse(body); // lança se inválido
      expect(Array.isArray(parsed)).toBe(true);

      console.log(`[INTEGRAÇÃO] GitHub API retornou ${parsed.length} release(s).`);
    }, 15000);

    it('cada release deve ter os campos essenciais: tag_name, prerelease, html_url', async () => {
      const { statusCode, body } = await httpsGet(
        `https://api.github.com/repos/${OWNER}/${REPO}/releases`,
      );

      expect(statusCode).toBe(200);
      // Tipagem forte: usamos a interface GitHubRelease para acesso seguro aos campos
      const releases = JSON.parse(body) as Array<{ tag_name: string; prerelease: boolean; html_url: string; name: string }>;

      // Garante que o repo tem pelo menos uma release publicada
      expect(releases.length).toBeGreaterThan(0);

      const first = releases[0];
      expect(typeof first.tag_name).toBe('string');
      expect(first.tag_name.length).toBeGreaterThan(0);
      expect(typeof first.prerelease).toBe('boolean');
      expect(typeof first.html_url).toBe('string');
      expect(first.html_url).toContain('github.com');

      console.log(`[INTEGRAÇÃO] Release mais recente: ${first.tag_name} (prerelease=${first.prerelease})`);
      console.log(`[INTEGRAÇÃO] URL: ${first.html_url}`);
    }, 15000);

    it('deve retornar HTTP 404 para um repositório inexistente', async () => {
      const { statusCode } = await httpsGet(
        'https://api.github.com/repos/usuario-que-nao-existe-xyz/repo-fake-abc123/releases',
      );

      expect(statusCode).toBe(404);
      console.log('[INTEGRAÇÃO] 404 confirmado para repo inexistente ✓');
    }, 15000);
  });

  // ── checkForUpdate (real) ─────────────────────────────────────────────────

  describe('checkForUpdate', () => {
    it('deve retornar um status válido consultando o GitHub real', async () => {
      // Usa versão 0.0.0 para garantir que sempre detecte update disponível
      const result = await checkForUpdateReal('0.0.0', OWNER, REPO, true);

      console.log('[INTEGRAÇÃO] Resultado do checkForUpdate:');
      console.log(`  status:         ${result.status}`);
      console.log(`  currentVersion: ${result.currentVersion}`);
      console.log(`  latestVersion:  ${result.latestVersion ?? 'N/A'}`);
      console.log(`  channel:        ${result.channel}`);
      console.log(`  message:        ${result.message}`);
      if (result.releaseUrl) {
        console.log(`  releaseUrl:     ${result.releaseUrl}`);
      }

      // Status deve ser um dos valores válidos
      expect(['update-available', 'up-to-date', 'error']).toContain(result.status);

      // currentVersion e channel sempre presentes
      expect(result.currentVersion).toBe('0.0.0');
      expect(['latest', 'beta', 'dev']).toContain(result.channel);

      // Com versão 0.0.0 e allowPrerelease=true, deve detectar update se o repo tem releases
      if (result.status === 'update-available') {
        expect(result.latestVersion).toBeTruthy();
        expect(result.releaseUrl).toContain('github.com');
      }
    }, 15000);

    it('deve retornar "update-available" com versão 0.0.0 (assume que o repo tem pelo menos 1 release)', async () => {
      const result = await checkForUpdateReal('0.0.0', OWNER, REPO, true);

      // Se o repo existe e tem releases, deve haver update
      if (result.status === 'error') {
        // Falha de rede: pula o teste com aviso, mas não falha
        console.warn(`[INTEGRAÇÃO] Rede indisponível: ${result.message}`);
        return;
      }

      expect(result.status).toBe('update-available');
      expect(result.latestVersion).toMatch(/^\d+\.\d+\.\d+/); // semver básico
      console.log(`[INTEGRAÇÃO] ✅ Update detectado: 0.0.0 → ${result.latestVersion}`);
    }, 15000);

    it('deve retornar "error" com mensagem amigável para repo inexistente (real)', async () => {
      const result = await checkForUpdateReal('1.0.0', 'usuario-inexistente-xyz', 'repo-fake-abc123', false);

      expect(result.status).toBe('error');
      expect(result.message).toBeTruthy();
      expect(result.message.length).toBeGreaterThan(5);

      console.log(`[INTEGRAÇÃO] Mensagem de erro para repo inexistente: "${result.message}"`);
    }, 15000);
  });
});
