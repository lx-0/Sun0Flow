import { z } from "zod";
import { zCsvParam, zLimitParam } from "@/lib/query-params";

export const recommendationsQuerySchema = z.object({
  limit: zLimitParam(20, 50),
  exclude: zCsvParam,
});

export const similarRecommendationsQuerySchema = z.object({
  songId: z.string().min(1),
  limit: zLimitParam(5, 20),
});
