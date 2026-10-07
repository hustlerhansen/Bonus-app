import express, { type Express, type ErrorRequestHandler } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { DemoError } from "./bonusplay/service";

const app: Express = express();
app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json({ limit: "64kb" }));
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);
const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  if (error instanceof DemoError) {
    req.log.warn({ status: error.status }, error.message);
    res.status(error.status).json({ error: error.message });
    return;
  }
  req.log.error({ err: error }, "BONUSPLAY request failed");
  res.status(500).json({ error: "Noe gikk galt på serveren. Prøv igjen." });
};
app.use(errorHandler);

export default app;
