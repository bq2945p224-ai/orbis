import "reflect-metadata";
import { config as loadDotenv } from "dotenv";
import { resolve } from "node:path";
import { NestFactory } from "@nestjs/core";
import cookieParserPkg from "cookie-parser";
const cookieParser = (cookieParserPkg as unknown as { default?: typeof cookieParserPkg }).default ?? cookieParserPkg;
import { AppModule } from "./app.module.js";
import { loadEnv } from "@orbis/config";

loadDotenv({ path: resolve(process.cwd(), "../../.env") });
loadDotenv();

async function bootstrap() {
  const env = loadEnv();
  const app = await NestFactory.create(AppModule, { rawBody: false });
  app.use(cookieParser(env.SESSION_SECRET));
  app.enableCors({
    origin: env.WEB_ORIGIN,
    credentials: true,
  });
  app.setGlobalPrefix("api");
  // Behind Render/Vercel proxies
  app.getHttpAdapter().getInstance().set("trust proxy", 1);
  const port = env.PORT ?? env.API_PORT;
  await app.listen(port);
  console.log(`Orbis API listening on :${port}`);
}

bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});
