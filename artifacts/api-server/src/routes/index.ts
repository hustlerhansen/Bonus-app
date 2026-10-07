import { Router, type IRouter } from "express";
import healthRouter from "./health";
import bonusplayRouter from "./bonusplay";

const router: IRouter = Router();

router.use(healthRouter);
router.use(bonusplayRouter);

export default router;
