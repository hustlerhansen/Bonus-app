import app from "./app";
import { logger } from "./lib/logger";
import { seedDemoCatalog } from "./bonusplay/seed";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function start(): Promise<void> {
  await seedDemoCatalog();
  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }
    logger.info({ port }, "BONUSPLAY API listening");
  });
}
start().catch(err => {
  logger.error({ err }, "Unable to seed BONUSPLAY catalog");
  process.exit(1);
});
