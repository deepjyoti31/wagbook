/**
 * Generates three files from the real, migrated schema:
 *
 *   src/lib/supabase/database.types.ts   TypeScript types for the Supabase client
 *   docs/reference/schema.md             the human-readable schema reference
 *   docs/reference/error-codes.md        every WBnnn error the database can raise
 *
 * Run `npm run gen:db` after every migration. tests/db/generated.test.ts
 * fails if any of them is out of date, so the types and the documentation
 * can never drift away from the database.
 *
 * This does the job of `supabase gen types` without needing Docker, a
 * Supabase login or network access, which matters in cloud coding sessions.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { PGlite } from "@electric-sql/pglite";
import { createTestDb, MIGRATIONS_DIR, migrationFiles } from "../tests/db/harness";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
export const TYPES_PATH = join(root, "src", "lib", "supabase", "database.types.ts");
export const SCHEMA_DOC_PATH = join(root, "docs", "reference", "schema.md");
export const ERROR_CODES_PATH = join(root, "docs", "reference", "error-codes.md");

/**
 * Every "WBnnn: message" the database can raise, collected from the migrations.
 * Codes are never reused or renumbered: people search logs and issues for them.
 */
export function errorCodes(): string {
  const found = new Map<string, { messages: Set<string>; files: Set<string> }>();
  for (const file of migrationFiles()) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
    for (const m of sql.matchAll(/'(WB\d{3}): ((?:[^']|'')*)'/g)) {
      const entry = found.get(m[1]) ?? { messages: new Set<string>(), files: new Set<string>() };
      entry.messages.add(m[2].replace(/''/g, "'"));
      entry.files.add(file);
      found.set(m[1], entry);
    }
  }
  const rows = [...found.entries()].sort(([a], [b]) => a.localeCompare(b));
  return [
    "# Error codes",
    "",
    "> GENERATED FILE. Do not edit by hand. Run `npm run gen:db` after changing anything in `supabase/migrations`.",
    "",
    "Every error the database raises on purpose starts with a code like `WB020`. The app shows the text after the code to the",
    "person (see `src/lib/errors.ts`); the code is for searching logs, tests and issues. A `%` in a message is filled in with a",
    "value when the error is raised.",
    "",
    "Rules: a code is never reused or renumbered. A new error takes the next free number in its range.",
    "",
    "| Range | Area |",
    "| --- | --- |",
    "| WB001 to WB009 | Signing in, permission and not found |",
    "| WB010 to WB019 | Organisations and people |",
    "| WB020 to WB029 | Bookings and capacity |",
    "| WB030 to WB039 | Invoices |",
    "| WB040 to WB049 | The public intake form |",
    "| WB050 to WB059 | Bills and payments (continued) |",
    "| WB060 to WB069 | Reports and expenses |",
    "| WB070 to WB079 | A parent's details: export and erase |",
    "| WB080 to WB089 | Daily care and incidents |",
    "| WB090 to WB099 | Credit notes |",
    "| WB100 to WB109 | Booking requests from parents |",
    "| WB110 to WB119 | Day boarding packs |",
    "| WB120 to WB129 | Refunds |",
    "| WB130 to WB139 | Stock |",
    "| WB140 to WB149 | Recipes and portions |",
    "| WB150 to WB159 | Food subscriptions, deliveries and their bills |",
    "| WB160 to WB169 | Batches and packing |",
    "| WB170 to WB179 | Delivery runs, riders and problems |",
    "| WB180 to WB189 | Food orders from the website and parents' links |",
    "| WB190 to WB199 | Appointments |",
    "| WB200 to WB209 | Appointments: bills, courses and packages |",
    "| WB210 to WB219 | Health at the door, credit, pick-up and drop |",
    "",
    "| Code | Message | Raised in |",
    "| --- | --- | --- |",
    ...rows.map(([code, e]) => `| \`${code}\` | ${[...e.messages].join("<br>")} | ${[...e.files].map((f) => `\`${f}\``).join("<br>")} |`),
    "",
  ].join("\n");
}

interface Column {
  table: string;
  kind: string;
  name: string;
  type: string;
  typtype: string;
  elem_type: string | null;
  elem_typtype: string | null;
  not_null: boolean;
  has_default: boolean;
  default_expr: string | null;
  comment: string | null;
  display_type: string;
}

const SCALARS: Record<string, string> = {
  uuid: "string", text: "string", varchar: "string", bpchar: "string", name: "string", date: "string", time: "string",
  timetz: "string", timestamp: "string", timestamptz: "string", interval: "string", bytea: "string",
  int2: "number", int4: "number", int8: "number", float4: "number", float8: "number", numeric: "number", oid: "number",
  bool: "boolean", json: "Json", jsonb: "Json", void: "undefined",
};

function tsType(type: string, typtype: string, elem: string | null, elemTyptype: string | null, tables: Set<string>): string {
  if (elem) return `${tsType(elem, elemTyptype ?? "b", null, null, tables)}[]`;
  if (typtype === "e") return `Database["public"]["Enums"]["${type}"]`;
  if (typtype === "c" && tables.has(type)) return `Database["public"]["Tables"]["${type}"]["Row"]`;
  return SCALARS[type] ?? "unknown";
}

export async function generate(db: PGlite): Promise<{ types: string; markdown: string; errors: string }> {
  const q = async <T,>(sql: string) => (await db.query<T>(sql)).rows;

  const relations = await q<{ name: string; kind: string; comment: string | null; options: string[] | null }>(`
    select c.relname as name, c.relkind as kind, obj_description(c.oid, 'pg_class') as comment, c.reloptions as options
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'v') order by c.relname`);

  const columns = await q<Column>(`
    select c.relname as table, c.relkind as kind, a.attname as name, t.typname as type, t.typtype,
           et.typname as elem_type, et.typtype as elem_typtype, a.attnotnull as not_null,
           (a.atthasdef or a.attidentity <> '') as has_default,
           pg_get_expr(d.adbin, d.adrelid) as default_expr,
           col_description(c.oid, a.attnum) as comment,
           format_type(a.atttypid, a.atttypmod) as display_type
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
    join pg_type t on t.oid = a.atttypid
    left join pg_type et on et.oid = t.typelem and t.typcategory = 'A'
    left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
    where n.nspname = 'public' and c.relkind in ('r', 'v') and a.attnum > 0 and not a.attisdropped
    order by c.relname, a.attnum`);

  const enums = await q<{ name: string; labels: string[]; comment: string | null }>(`
    select t.typname as name, array_agg(e.enumlabel order by e.enumsortorder) as labels, obj_description(t.oid, 'pg_type') as comment
    from pg_type t join pg_enum e on e.enumtypid = t.oid join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' group by t.oid, t.typname order by t.typname`);

  const fks = await q<{ table: string; name: string; columns: string[]; ref_table: string; ref_columns: string[]; one_to_one: boolean }>(`
    select c.relname as table, con.conname as name,
           (select array_agg(a.attname order by k.ord) from unnest(con.conkey) with ordinality k(attnum, ord)
              join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.attnum) as columns,
           rc.relname as ref_table,
           (select array_agg(a.attname order by k.ord) from unnest(con.confkey) with ordinality k(attnum, ord)
              join pg_attribute a on a.attrelid = con.confrelid and a.attnum = k.attnum) as ref_columns,
           exists (select 1 from pg_constraint u where u.conrelid = con.conrelid and u.contype in ('p', 'u')
                     and u.conkey <@ con.conkey and u.conkey @> con.conkey) as one_to_one
    from pg_constraint con
    join pg_class c on c.oid = con.conrelid join pg_namespace n on n.oid = c.relnamespace
    join pg_class rc on rc.oid = con.confrelid join pg_namespace rn on rn.oid = rc.relnamespace
    where con.contype = 'f' and n.nspname = 'public' and rn.nspname = 'public'
    order by c.relname, con.conname`);

  const constraints = await q<{ table: string; name: string; type: string; def: string }>(`
    select c.relname as table, con.conname as name, con.contype as type, pg_get_constraintdef(con.oid) as def
    from pg_constraint con join pg_class c on c.oid = con.conrelid join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and con.contype in ('p', 'u', 'f', 'x', 'c')
    order by c.relname, array_position(array['p', 'u', 'f', 'x', 'c']::"char"[], con.contype), con.conname`);

  const indexes = await q<{ table: string; def: string }>(`
    select i.tablename as table, i.indexdef as def from pg_indexes i
    where i.schemaname = 'public'
      and not exists (select 1 from pg_constraint con join pg_class ic on ic.oid = con.conindid where ic.relname = i.indexname)
    order by i.tablename, i.indexname`);

  const policies = await q<{ table: string; name: string; cmd: string; roles: string[]; using: string | null; check: string | null }>(`
    select tablename as table, policyname as name, cmd, roles::text[] as roles, qual as using, with_check as check
    from pg_policies where schemaname = 'public' order by tablename, policyname`);

  const triggers = await q<{ table: string; name: string; fn: string; def: string }>(`
    select c.relname as table, t.tgname as name, p.proname as fn, pg_get_triggerdef(t.oid) as def
    from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
    join pg_proc p on p.oid = t.tgfoid
    where n.nspname = 'public' and not t.tgisinternal order by c.relname, t.tgname`);

  const grants = await q<{ table: string; privs: string[] }>(`
    select c.relname as table,
           array_remove(array[
             case when has_table_privilege('authenticated', c.oid, 'select') then 'select' end,
             case when has_table_privilege('authenticated', c.oid, 'insert') then 'insert' end,
             case when has_table_privilege('authenticated', c.oid, 'update') then 'update' end,
             case when has_table_privilege('authenticated', c.oid, 'delete') then 'delete' end], null) as privs
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'v') order by c.relname`);

  const functions = await q<{
    name: string; args: string; result: string; comment: string | null; definer: boolean; is_trigger: boolean; volatility: string;
    anon: boolean; authenticated: boolean; arg_names: string[] | null; arg_modes: string[] | null;
    arg_types: { type: string; typtype: string; elem: string | null; elem_typtype: string | null }[];
    n_defaults: number; n_in: number; ret: { type: string; typtype: string; elem: string | null; elem_typtype: string | null }; retset: boolean;
  }>(`
    select p.proname as name, pg_get_function_identity_arguments(p.oid) as args, pg_get_function_result(p.oid) as result,
           obj_description(p.oid, 'pg_proc') as comment, p.prosecdef as definer,
           (p.prorettype = 'trigger'::regtype) as is_trigger,
           case p.provolatile when 'i' then 'immutable' when 's' then 'stable' else 'volatile' end as volatility,
           has_function_privilege('anon', p.oid, 'execute') as anon,
           has_function_privilege('authenticated', p.oid, 'execute') as authenticated,
           p.proargnames as arg_names, p.proargmodes::text[] as arg_modes,
           (select coalesce(json_agg(json_build_object('type', t.typname, 'typtype', t.typtype, 'elem', et.typname, 'elem_typtype', et.typtype) order by x.ord), '[]'::json)
              from unnest(coalesce(p.proallargtypes, p.proargtypes::oid[])) with ordinality x(oid, ord)
              join pg_type t on t.oid = x.oid
              left join pg_type et on et.oid = t.typelem and t.typcategory = 'A') as arg_types,
           p.pronargdefaults as n_defaults, p.pronargs as n_in,
           (select json_build_object('type', t.typname, 'typtype', t.typtype, 'elem', et.typname, 'elem_typtype', et.typtype)
              from pg_type t left join pg_type et on et.oid = t.typelem and t.typcategory = 'A' where t.oid = p.prorettype) as ret,
           p.proretset as retset
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f'
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
    order by p.proname`);

  const tableNames = new Set(relations.filter((r) => r.kind === "r").map((r) => r.name));
  const colsOf = (t: string) => columns.filter((c) => c.table === t);
  const ts = (c: Pick<Column, "type" | "typtype" | "elem_type" | "elem_typtype">) => tsType(c.type, c.typtype, c.elem_type, c.elem_typtype, tableNames);

  // ---------------------------------------------------------------- types
  const out: string[] = [
    "// GENERATED FILE. Do not edit by hand.",
    "// Run `npm run gen:db` after changing anything in supabase/migrations.",
    "",
    "export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];",
    "",
    "export type Database = {",
    "  public: {",
    "    Tables: {",
  ];
  for (const rel of relations.filter((r) => r.kind === "r")) {
    const cols = colsOf(rel.name);
    out.push(`      ${rel.name}: {`, "        Row: {");
    for (const c of cols) out.push(`          ${c.name}: ${ts(c)}${c.not_null ? "" : " | null"};`);
    out.push("        };", "        Insert: {");
    for (const c of cols) out.push(`          ${c.name}${c.not_null && !c.has_default ? "" : "?"}: ${ts(c)}${c.not_null ? "" : " | null"};`);
    out.push("        };", "        Update: {");
    for (const c of cols) out.push(`          ${c.name}?: ${ts(c)}${c.not_null ? "" : " | null"};`);
    out.push("        };", "        Relationships: [");
    for (const fk of fks.filter((f) => f.table === rel.name)) {
      out.push(
        "          {",
        `            foreignKeyName: "${fk.name}";`,
        `            columns: [${fk.columns.map((c) => `"${c}"`).join(", ")}];`,
        `            isOneToOne: ${fk.one_to_one};`,
        `            referencedRelation: "${fk.ref_table}";`,
        `            referencedColumns: [${fk.ref_columns.map((c) => `"${c}"`).join(", ")}];`,
        "          },",
      );
    }
    out.push("        ];", "      };");
  }
  out.push("    };", "    Views: {");
  for (const rel of relations.filter((r) => r.kind === "v")) {
    out.push(`      ${rel.name}: {`, "        Row: {");
    for (const c of colsOf(rel.name)) out.push(`          ${c.name}: ${ts(c)} | null;`);
    out.push("        };", "        Relationships: [];", "      };");
  }
  out.push("    };", "    Functions: {");
  for (const f of functions.filter((fn) => !fn.is_trigger)) {
    const modes = f.arg_modes ?? f.arg_types.map(() => "i");
    const names = f.arg_names ?? [];
    const inputs = f.arg_types.map((t, i) => ({ t, mode: modes[i], name: names[i] })).filter((a) => a.mode === "i" || a.mode === "b");
    const outputs = f.arg_types.map((t, i) => ({ t, mode: modes[i], name: names[i] })).filter((a) => a.mode === "t" || a.mode === "o");
    const firstOptional = inputs.length - f.n_defaults;
    const argLines = inputs.map(
      (a, i) => `${a.name}${i >= firstOptional ? "?" : ""}: ${tsType(a.t.type, a.t.typtype, a.t.elem, a.t.elem_typtype, tableNames)}`,
    );
    let returns: string;
    if (outputs.length > 0) {
      returns = `{ ${outputs.map((o) => `${o.name}: ${tsType(o.t.type, o.t.typtype, o.t.elem, o.t.elem_typtype, tableNames)}`).join("; ")} }[]`;
    } else {
      returns = tsType(f.ret.type, f.ret.typtype, f.ret.elem, f.ret.elem_typtype, tableNames);
      if (f.retset) returns = `${returns}[]`;
    }
    out.push(`      ${f.name}: {`, `        Args: ${argLines.length ? `{ ${argLines.join("; ")} }` : "Record<PropertyKey, never>"};`, `        Returns: ${returns};`, "      };");
  }
  out.push("    };", "    Enums: {");
  for (const e of enums) out.push(`      ${e.name}: ${e.labels.map((l) => `"${l}"`).join(" | ")};`);
  out.push(
    "    };",
    "    CompositeTypes: { [_ in never]: never };",
    "  };",
    "};",
    "",
    'type PublicSchema = Database["public"];',
    "",
    "/** Row type of a table, e.g. Tables<\"bookings\">. */",
    'export type Tables<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Row"];',
    "/** Shape accepted when inserting into a table. */",
    'export type TablesInsert<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Insert"];',
    "/** Shape accepted when updating a table. */",
    'export type TablesUpdate<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Update"];',
    "/** Union of an enum's labels, e.g. Enums<\"booking_status\">. */",
    'export type Enums<T extends keyof PublicSchema["Enums"]> = PublicSchema["Enums"][T];',
    "",
  );

  // ------------------------------------------------------------- markdown
  const esc = (s: string | null) => (s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
  const md: string[] = [
    "# Schema reference",
    "",
    "> GENERATED FILE. Do not edit by hand. Run `npm run gen:db` after changing anything in `supabase/migrations`.",
    "> The descriptions come from `comment on` statements in the migrations, so fix wording there.",
    "",
    "This is the exact shape of the database after every migration has run. For the reasoning behind it, read",
    "[04-data-model.md](../04-data-model.md) and [05-security-and-privacy.md](../05-security-and-privacy.md).",
    "",
    `Migrations applied: ${migrationFiles().length}. Tables: ${tableNames.size}. Views: ${relations.length - tableNames.size}. Functions: ${functions.length}.`,
    "",
    "## Contents",
    "",
    "- [Enumerated types](#enumerated-types)",
    "- Tables: " + relations.filter((r) => r.kind === "r").map((r) => `[${r.name}](#${r.name})`).join(", "),
    "- Views: " + relations.filter((r) => r.kind === "v").map((r) => `[${r.name}](#${r.name})`).join(", "),
    "- [Functions](#functions)",
    "",
    "## Enumerated types",
    "",
    "| Type | Values | Meaning |",
    "| --- | --- | --- |",
    ...enums.map((e) => `| \`${e.name}\` | ${e.labels.map((l) => `\`${l}\``).join(", ")} | ${esc(e.comment)} |`),
    "",
    "## Tables",
    "",
  ];
  const section = (rel: (typeof relations)[number]) => {
    const lines: string[] = [`### ${rel.name}`, "", rel.comment ?? "_No description._", ""];
    lines.push("| Column | Type | Required | Default | Meaning |", "| --- | --- | --- | --- | --- |");
    for (const c of colsOf(rel.name)) {
      lines.push(`| \`${c.name}\` | \`${esc(c.display_type)}\` | ${c.not_null ? "yes" : ""} | ${c.default_expr ? `\`${esc(c.default_expr)}\`` : ""} | ${esc(c.comment)} |`);
    }
    lines.push("");
    if (rel.kind === "r") {
      const cons = constraints.filter((c) => c.table === rel.name);
      const label: Record<string, string> = { p: "Primary key", u: "Unique", f: "Foreign key", x: "Exclusion", c: "Check" };
      if (cons.length) {
        lines.push("**Constraints**", "");
        for (const c of cons) lines.push(`- ${label[c.type] ?? c.type} \`${c.name}\`: \`${c.def.replace(/`/g, "'")}\``);
        lines.push("");
      }
      const idx = indexes.filter((i) => i.table === rel.name);
      if (idx.length) {
        lines.push("**Indexes**", "");
        for (const i of idx) lines.push(`- \`${i.def}\``);
        lines.push("");
      }
      const trg = triggers.filter((t) => t.table === rel.name);
      if (trg.length) {
        lines.push("**Triggers**", "");
        for (const t of trg) {
          const when = /\b(BEFORE|AFTER)\b.*?\bON\b/.exec(t.def)?.[0].replace(/\s+ON$/, "") ?? "";
          lines.push(`- \`${t.name}\` (${when.toLowerCase()}) runs \`${t.fn}()\``);
        }
        lines.push("");
      }
      const g = grants.find((x) => x.table === rel.name)?.privs ?? [];
      lines.push("**Access**", "");
      lines.push(`- Signed-in users may: ${g.length ? g.join(", ") : "nothing directly"} (then narrowed by the policies below). Anonymous visitors: nothing.`);
      const pol = policies.filter((p) => p.table === rel.name);
      if (!pol.length) lines.push("- No policies: no row is reachable except through SECURITY DEFINER functions.");
      for (const p of pol) {
        const parts = [p.using ? `rows where \`${esc(p.using)}\`` : "", p.check ? `new values must satisfy \`${esc(p.check)}\`` : ""].filter(Boolean);
        lines.push(`- \`${p.name}\` (${p.cmd.toLowerCase()}): ${parts.join("; ")}`);
      }
      lines.push("");
    } else {
      const g = grants.find((x) => x.table === rel.name)?.privs ?? [];
      lines.push(`**Access**: signed-in users may ${g.join(", ") || "nothing"}. ${(rel.options ?? []).includes("security_invoker=true") ? "Runs with the caller's row level security." : "WARNING: not security_invoker."}`, "");
    }
    return lines;
  };
  for (const rel of relations.filter((r) => r.kind === "r")) md.push(...section(rel));
  md.push("## Views", "");
  for (const rel of relations.filter((r) => r.kind === "v")) md.push(...section(rel));

  md.push(
    "## Functions",
    "",
    "Who may call: **public** means anyone, signed in or not. **signed-in** means any authenticated user (the function itself then checks membership and role). **internal** means no API role can call it; it runs only from triggers or other functions.",
    "",
  );
  for (const f of functions) {
    const who = f.is_trigger ? "internal (trigger)" : f.anon ? "public" : f.authenticated ? "signed-in" : "internal";
    md.push(`### ${f.name}`, "", "```", `${f.name}(${f.args}) returns ${f.result}`, "```", "");
    md.push(`- Who may call: ${who}`);
    md.push(`- Runs as: ${f.definer ? "the database owner (SECURITY DEFINER), so it performs its own permission checks" : "the caller (row level security applies)"}`);
    md.push(`- Volatility: ${f.volatility}`, "", f.comment ?? "_No description._", "");
  }

  return { types: out.join("\n"), markdown: `${md.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd()}\n`, errors: errorCodes() };
}

// Run as a script: `npm run gen:db`.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const db = await createTestDb();
  const { types, markdown, errors } = await generate(db);
  await db.close();
  writeFileSync(TYPES_PATH, types);
  writeFileSync(SCHEMA_DOC_PATH, markdown);
  writeFileSync(ERROR_CODES_PATH, errors);
  console.log(`Wrote ${TYPES_PATH}\nWrote ${SCHEMA_DOC_PATH}\nWrote ${ERROR_CODES_PATH}`);
}
