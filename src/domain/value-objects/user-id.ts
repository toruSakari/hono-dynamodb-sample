import { z } from "zod";

// User 集約の識別子。他の UUID ブランドとは区別する。
export const UserIdSchema = z.uuid().brand<"UserId">();
export type UserId = z.infer<typeof UserIdSchema>;
