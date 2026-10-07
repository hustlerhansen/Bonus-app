import express, { type Express, type ErrorRequestHandler } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { DemoError } from "./bonusplay/service";
import { PointsError } from "./v2/points";
import helmet from "helmet";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import { CLERK_PROXY_PATH, clerkProxyMiddleware, getClerkProxyHost } from "./middlewares/clerkProxyMiddleware";

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
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: "64kb" }));
app.use(express.urlencoded({ extended: true }));
app.use(
  clerkMiddleware((req) => ({
    publishableKey: publishableKeyFromHost(
      getClerkProxyHost(req) ?? "",
      process.env.CLERK_PUBLISHABLE_KEY,
    ),
  })),
);

app.use("/api", router);
const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  if (error instanceof DemoError || error instanceof PointsError) {
    req.log.warn({ status: error.status }, error.message);
    res.status(error.status).json({ error: error.message });
    return;
  }
  req.log.error({ errorName: error?.name, code: error?.code }, "BONUSPLAY request failed");
  res.status(500).json({ error: "Noe gikk galt på serveren. Prøv igjen." });
};
app.use(errorHandler);

export default app;
