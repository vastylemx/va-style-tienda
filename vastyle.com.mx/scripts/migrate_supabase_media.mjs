import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";

const backupPath = process.argv[2] || "/private/tmp/vastyle-media-db-backup-20261014.json";
const outputDir = process.argv[3] || "/private/tmp/vastyle-media-files";
const manifestPath = path.join(outputDir, "manifest.json");
const backup = JSON.parse(await readFile(backupPath, "utf8"));
if (!backup.ok || !backup.data) throw new Error("No se reconoce el respaldo de medios.");

function getReferences(value, table, id, field, found = []) {
  if (typeof value === "string" && value.includes("supabase.co")) {
    found.push({ table, id: Number(id), field, url: value });
  } else if (Array.isArray(value)) {
    value.forEach((item) => getReferences(item, table, id, field, found));
  } else if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      getReferences(item, table, id, field, found);
    }
  }
  return found;
}

const references = [];
for (const [table, rows] of Object.entries(backup.data)) {
  for (const row of rows) {
    for (const [field, value] of Object.entries(row)) {
      if (field === "settings" && typeof value === "string") {
        try {
          getReferences(JSON.parse(value), table, row.id, field, references);
        } catch {
          throw new Error(`JSON inválido en settings de ${table}:${row.id}`);
        }
      } else if (typeof value === "string" && value.includes("supabase.co")) {
        references.push({ table, id: Number(row.id), field, url: value });
      }
    }
  }
}

const referencesByUrl = new Map();
for (const reference of references) {
  const current = referencesByUrl.get(reference.url) || [];
  current.push(reference);
  referencesByUrl.set(reference.url, current);
}

await mkdir(path.join(outputDir, "objects"), { recursive: true, mode: 0o700 });
const entries = [...referencesByUrl].map(([url, refs]) => {
  const parsed = new URL(url);
  if (!parsed.pathname.includes("/storage/v1/object/public/")) {
    throw new Error("URL de medio fuera del almacenamiento público esperado.");
  }
  const suffix = path.posix.extname(decodeURIComponent(parsed.pathname)).toLowerCase();
  if (!/^\.(jpg|jpeg|png|webp|gif|mp4|webm|mov|m4v|ogg)$/.test(suffix)) {
    throw new Error(`Extensión de medio no permitida: ${suffix || "sin extensión"}`);
  }
  const digest = createHash("sha256").update(url).digest("hex");
  return { url, refs, file: path.join(outputDir, "objects", `${digest}${suffix}`), name: `${digest}${suffix}`, bytes: null, sha256: null };
});

let cursor = 0;
let completed = 0;
const failures = [];
async function download(entry) {
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch(entry.url, { signal: AbortSignal.timeout(45000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const mime = response.headers.get("content-type")?.split(";")[0].toLowerCase() || "";
      if (!/^(image\/(jpeg|png|webp|gif)|video\/(mp4|webm|quicktime|x-m4v|ogg))$/.test(mime)) {
        throw new Error(`MIME inesperado: ${mime || "vacío"}`);
      }
      const data = Buffer.from(await response.arrayBuffer());
      if (!data.length) throw new Error("Archivo vacío");
      const expected = Number(response.headers.get("content-length"));
      if (Number.isFinite(expected) && expected > 0 && expected !== data.length) {
        throw new Error("Longitud descargada incompleta");
      }
      await writeFile(entry.file, data, { mode: 0o600 });
      entry.bytes = data.length;
      entry.sha256 = createHash("sha256").update(data).digest("hex");
      completed += 1;
      if (completed % 25 === 0 || completed === entries.length) {
        console.log(`Descargados ${completed}/${entries.length}`);
      }
      return;
    } catch (error) {
      if (attempt === 4) failures.push({ index: completed, error: error.message });
      else await new Promise((resolve) => setTimeout(resolve, 700 * attempt));
    }
  }
}

await Promise.all(Array.from({ length: 5 }, async () => {
  while (cursor < entries.length) await download(entries[cursor++]);
}));

if (failures.length) {
  throw new Error(`${failures.length} medios no se pudieron validar; no actualizar referencias de DB.`);
}

let totalBytes = 0;
for (const entry of entries) {
  const fileStat = await stat(entry.file);
  if (fileStat.size !== entry.bytes) throw new Error(`Tamaño local inconsistente para ${entry.name}`);
  totalBytes += entry.bytes;
}
await writeFile(manifestPath, JSON.stringify({
  createdAt: new Date().toISOString(),
  backupSha256: createHash("sha256").update(JSON.stringify(backup)).digest("hex"),
  references: references.length,
  objects: entries.map(({ url, refs, name, bytes, sha256 }) => ({ url, refs, name, bytes, sha256 })),
}, null, 2), { mode: 0o600 });
console.log(JSON.stringify({ references: references.length, uniqueObjects: entries.length, totalBytes, totalMiB: +(totalBytes / 1048576).toFixed(2), manifestPath }));
