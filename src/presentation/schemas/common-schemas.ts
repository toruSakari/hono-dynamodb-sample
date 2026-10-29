import { z } from "@hono/zod-openapi";

export const ErrorSchema = z.strictObject({ error: z.string() }).openapi("Error");
export const HealthSchema = z.strictObject({ status: z.literal("ok") }).openapi("Health");
