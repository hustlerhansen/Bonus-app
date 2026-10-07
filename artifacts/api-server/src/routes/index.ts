import { Router, type IRouter } from "express";
import healthRouter from "./health";
import bonusplayRouter from "./bonusplay";
import v2Router from "./v2";

const router: IRouter = Router();

router.use(healthRouter);
router.use(bonusplayRouter);
router.use(v2Router);

export default router;
