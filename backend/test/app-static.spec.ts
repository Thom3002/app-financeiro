import { NestFactory } from '@nestjs/core';
import { INestApplication } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';

function getUrl(url: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
      }
    };
    http.get(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        resolve({
          status: res.statusCode || 0,
          body: data,
        });
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
}

describe('Static File Serving (Production Mode)', () => {
  let app: INestApplication;
  let serverUrl: string;
  let tempDir: string;

  // NestJS bootstrap with TypeORM can take >5s when running alongside other test suites
  // because the module cache may already be warm and SQLite init may compete for resources.
  beforeAll(async () => {
    // 1. Create an isolated temp directory for serving mock frontend dist
    tempDir = path.resolve(__dirname, 'temp-static-test');
    const mockDistDir = path.join(tempDir, 'frontend', 'dist');
    fs.mkdirSync(mockDistDir, { recursive: true });
    fs.writeFileSync(
      path.join(mockDistDir, 'index.html'),
      '<html><body>Mock Frontend Index HTML</body></html>'
    );

    // 2. Set APP_PATH so app.module resolves getFrontendDistPath() to our temp directory
    process.env.APP_PATH = path.join(tempDir, 'dummy-nest-app');
    process.env.NODE_ENV = 'production';
    process.env.DATABASE_PATH = ':memory:';

    // 3. Clear any cached version of app.module so it re-reads the env vars we just set.
    //    This is necessary when tests run in the same worker as other suites that also
    //    import app.module (Node.js caches CommonJS modules by file path).
    const appModuleCacheKey = require.resolve('../src/app.module');
    delete require.cache[appModuleCacheKey];

    // 4. Dynamically import AppModule so it reads the env variables we just set
    const { AppModule } = await import('../src/app.module');

    // 5. Bootstrap app using NestFactory.create so ServeStaticModule correctly resolves the httpAdapter
    app = await NestFactory.create(AppModule, {
      logger: false // Keep test output clean
    });
    app.setGlobalPrefix('api');
    await app.listen(0); // Listen on a random port
    const address = app.getHttpServer().address();
    const port = typeof address === 'string' ? address : address.port;
    serverUrl = `http://localhost:${port}`;
  }, 30000); // 30s timeout: NestJS + TypeORM init can be slow in a parallel test environment

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    // Clean up our mock files and directories
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    delete process.env.APP_PATH;
    delete process.env.NODE_ENV;
    delete process.env.DATABASE_PATH;
  }, 15000);

  it('deve servir o frontend index.html ao acessar a raiz', async () => {
    const res = await getUrl(`${serverUrl}/`);
    expect(res.status).toBe(200);
    expect(res.body).toContain('Mock Frontend Index HTML');
  });

  it('deve servir o frontend index.html ao acessar uma rota que nao seja da API (fallback SPA)', async () => {
    const res = await getUrl(`${serverUrl}/qualquer-rota-spa`);
    expect(res.status).toBe(200);
    expect(res.body).toContain('Mock Frontend Index HTML');
  });

  it('deve retornar 404 para rotas de API inexistentes', async () => {
    const res = await getUrl(`${serverUrl}/api/rota-inexistente`);
    expect(res.status).toBe(404);
    expect(res.body).not.toContain('Mock Frontend Index HTML');
  });
});
