import { type PostgresJsDatabase, drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

export type Database = PostgresJsDatabase<typeof schema>;

export interface DatabaseInstance {
  db: Database;
  close: () => Promise<void>;
}

export const createDatabase = async (connectionUrl: string): Promise<DatabaseInstance> => {
  const client = postgres(connectionUrl, {
    max: 10,
  });

  const db = drizzle({ client, schema, casing: "snake_case" });

  return {
    db,
    close: async (): Promise<void> => {
      await client.end();
    },
  };
};
