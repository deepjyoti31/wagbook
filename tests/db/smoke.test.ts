import { describe, expect, it } from "vitest";
import { createTestDb, migrationFiles } from "./harness";

describe("migrations", () => {
  it("apply cleanly, in order, to an empty database", async () => {
    const db = await createTestDb();
    const tables = await db.query<{ n: number }>(
      "select count(*)::int as n from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'",
    );
    expect(tables.rows[0].n).toBeGreaterThan(15);
    await db.close();
  });

  it("are named with a 14 digit timestamp and a snake_case description", () => {
    for (const f of migrationFiles()) expect(f).toMatch(/^\d{14}_[a-z0-9_]+\.sql$/);
  });
});
