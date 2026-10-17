import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";

const rootDir = path.resolve(import.meta.dirname, "..");
const envPath = path.join(rootDir, ".env");
const outputPath = path.join(rootDir, "tmp", "supabase-export.json");

function loadEnv(filePath) {
  const values = {};
  const content = fs.readFileSync(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex === -1) continue;
    const key = trimmed.slice(0, equalsIndex).trim();
    let value = trimmed.slice(equalsIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

async function fetchAllRows(client, table) {
  const pageSize = 1000;
  let from = 0;
  const rows = [];

  while (true) {
    const { data, error } = await client
      .from(table)
      .select("*")
      .range(from, from + pageSize - 1);

    if (error) {
      throw new Error(`${table}: ${error.message}`);
    }

    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

const env = loadEnv(envPath);
const supabaseUrl = env.SUPABASE_URL;
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en vastyle.com.mx/.env.");
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

const tables = [
  "products",
  "reviews",
  "showroom_arrivals",
  "home_settings",
  "home_sections",
  "home_banners",
  "featured_categories",
  "community_posts",
  "customers",
  "orders",
];

const exportData = {
  exported_at: new Date().toISOString(),
  source: "supabase",
  tables: {},
};

for (const table of tables) {
  exportData.tables[table] = await fetchAllRows(supabase, table);
  console.log(`${table}: ${exportData.tables[table].length}`);
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true, mode: 0o700 });
fs.writeFileSync(outputPath, JSON.stringify(exportData, null, 2), { mode: 0o600 });
console.log(`exported: ${path.relative(process.cwd(), outputPath)}`);
