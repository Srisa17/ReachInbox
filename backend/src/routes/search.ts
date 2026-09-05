import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth";
import { searchEmails } from "../services/searchService";

export const searchRouter = Router();
searchRouter.use(requireAuth);

searchRouter.get("/", async (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q : undefined;
  const status = typeof req.query.status === "string" ? req.query.status : undefined;

  const result = await searchEmails({ userId: req.userId!, query: q, status });
  res.json(result);
});
