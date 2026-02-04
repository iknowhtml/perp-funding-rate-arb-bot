import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { config } from "../config";
import * as schema from "./schema";

const connectionString = config.database.url;

const client = postgres(connectionString, {
  max: 10,
});

export const db = drizzle(client, { schema });

export type Database = typeof db;

export interface DatabaseInstance {
  db: Database;
  close: () => Promise<void>;
}

export const createDatabase = async (connectionUrl: string): Promise<DatabaseInstance> => {
  const postgresClient = postgres(connectionUrl, {
    max: 10,
  });

  const database = drizzle(postgresClient, { schema });

  return {
    db: database,
    close: async (): Promise<void> => {
      await postgresClient.end();
    },
  };
};
