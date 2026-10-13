import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ERROR_CODES_PATH, generate, SCHEMA_DOC_PATH, TYPES_PATH } from "../../scripts/gen-db.mts";
import { createTestDb } from "./harness";

describe("generated files", () => {
  it("are up to date with the migrations (run `npm run gen:db` if this fails)", async () => {
    const db = await createTestDb();
    const { types, markdown, errors } = await generate(db);
    await db.close();
    expect(readFileSync(TYPES_PATH, "utf8"), "src/lib/supabase/database.types.ts is stale").toBe(types);
    expect(readFileSync(SCHEMA_DOC_PATH, "utf8"), "docs/reference/schema.md is stale").toBe(markdown);
    expect(readFileSync(ERROR_CODES_PATH, "utf8"), "docs/reference/error-codes.md is stale").toBe(errors);
  });

  it("describe every table, column-bearing view, enum and callable function", async () => {
    const db = await createTestDb();
    const missing = await db.query<{ what: string }>(`
      select 'table ' || c.relname as what from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind in ('r', 'v') and obj_description(c.oid, 'pg_class') is null
      union all
      select 'type ' || t.typname from pg_type t join pg_namespace n on n.oid = t.typnamespace
        where n.nspname = 'public' and t.typtype = 'e' and obj_description(t.oid, 'pg_type') is null
      union all
      select 'function ' || p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.prokind = 'f' and obj_description(p.oid, 'pg_proc') is null
          and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
      order by 1`);
    await db.close();
    expect(missing.rows.map((r) => r.what), "add a `comment on` for each of these").toEqual([]);
  });
});
