import * as v from "valibot";

/** Log level schema for env validation and logger config. Separate file so env can import without pulling in logger (avoids circular dependency). */
export const logLevelSchema = v.picklist(["debug", "info", "warn", "error"]);

export type LogLevel = v.InferOutput<typeof logLevelSchema>;
