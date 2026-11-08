import { Logger } from '@nestjs/common';
import { createApp } from './app.setup';
import { ConfigError, loadConfig } from './config/app-config';

async function bootstrap(): Promise<void> {
  let config;
  try {
    config = loadConfig();
  } catch (error) {
    // A bad setting is reported plainly and stops the server.
    console.error(error instanceof ConfigError ? error.message : error);
    process.exit(1);
  }

  const app = await createApp(config);
  await app.listen({ host: config.host, port: config.port });

  const log = new Logger('Bootstrap');
  const base = await app.getUrl();
  log.log(`Currency Reader API is listening on ${base}`);
  if (config.swaggerEnabled) log.log(`Interactive docs: ${base}/docs`);
}

void bootstrap();
