import * as v from "valibot";

export const logLevelSchema = v.picklist(["debug", "info", "warn", "error"]);

export type LogLevel = v.InferOutput<typeof logLevelSchema>;
