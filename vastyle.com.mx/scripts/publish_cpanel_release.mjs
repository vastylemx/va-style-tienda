import { createHash, randomBytes } from "node:crypto";
import { chmod, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const frontendRoot = path.join(projectRoot, "frontend");
const releaseRoot = path.join(projectRoot, "release");
const host = "svgr206.serverneubox.com.mx";
const runId = `${new Date().toISOString().replace(/[-:.TZ]/g, "")}-${randomBytes(4).toString("hex")}`;
const temporaryRoot = path.join(os.tmpdir(), `vastyle-cpanel-publish-${runId}`);
const backupRoot = path.join(os.tmpdir(), `vastyle-cpanel-backup-${runId}`);
const netrcPath = `${temporaryRoot}.netrc`;
const args = process.argv.slice(2);
const apply = args.length === 1 && args[0] === "--apply";
const dryRun = args.length === 0 || (args.length === 1 && args[0] === "--dry-run");

if (!dryRun && !apply) {
  throw new Error("Uso: node publish_cpanel_release.mjs [--dry-run|--apply]");
}

const protectedPaths = [
  "/home/vastyle/app_config/** (configuración real)",
  "/home/vastyle/public_html/media/** (archivos subidos: imágenes y videos)",
  "/home/vastyle/logs/**",
  "/home/vastyle/public_html/.htaccess y cualquier otro .htaccess",
  "MariaDB completa: tablas, registros, ids, relaciones e inventario",
  "release/.htaccess y configuración local (.env)",
];

function sha(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function assertManagedPath(target, kind) {
  const safeStaticFiles = new Set([
    "public_html/favicon.svg",
    "public_html/icon-192.png",
    "public_html/icon-512.png",
    "public_html/icons.svg",
    "public_html/manifest.json",
    "public_html/service-worker.js",
    "public_html/index.html",
  ]);
  if (kind === "asset" && /^public_html\/assets\/[A-Za-z0-9._-]+$/.test(target)) return;
  if (safeStaticFiles.has(target)) return;
  if (/^src\/[A-Za-z0-9._-]+\.php$/.test(target)) return;
  if (/^public_html\/(?:api\/index|community-admin|ffmpeg-core-wasm|home-banner-media-admin|home-config-admin|product-admin)\.php$/.test(target)) return;
  throw new Error(`Destino no permitido por la lista de publicación: ${target}`);
}

async function exists(file) {
  try { await readFile(file); return true; } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

async function buildManifest() {
  const htmlPath = path.join(releaseRoot, "index.html");
  const html = await readFile(htmlPath, "utf8");
  const js = html.match(/src="\/(assets\/index-[A-Za-z0-9_-]+\.js)"/)?.[1];
  const css = html.match(/href="\/(assets\/index-[A-Za-z0-9_-]+\.css)(?:\?[^\"]*)?"/)?.[1];
  if (!js || !css) throw new Error("Build inválido: index.html no referencia los bundles Vite esperados.");

  const assetsRoot = path.join(releaseRoot, "assets");
  const assets = (await readdir(assetsRoot, { withFileTypes: true }))
    .filter((entry) => entry.isFile())
    .map((entry) => ({ local: path.join(assetsRoot, entry.name), remote: `public_html/assets/${entry.name}`, kind: "asset" }))
    .sort((left, right) => left.remote.localeCompare(right.remote));
  if (!assets.some((item) => item.remote === `public_html/${js}`) ||
      !assets.some((item) => item.remote === `public_html/${css}`)) {
    throw new Error("Build inválido: falta un bundle referenciado desde index.html.");
  }

  const publicFiles = ["favicon.svg", "icon-192.png", "icon-512.png", "icons.svg", "manifest.json", "service-worker.js"];
  const rootFiles = publicFiles.map((name) => ({ local: path.join(releaseRoot, name), remote: `public_html/${name}`, kind: "mutable" }));
  const backendSourceRoot = path.join(projectRoot, "backend/src");
  const backendSources = (await readdir(backendSourceRoot, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".php"))
    .map((entry) => ({ local: path.join(backendSourceRoot, entry.name), remote: `src/${entry.name}`, kind: "mutable" }))
    .sort((left, right) => left.remote.localeCompare(right.remote));
  const publicBackendRoot = path.join(projectRoot, "backend/public");
  const backendEntrypoints = (await readdir(publicBackendRoot, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".php"))
    .map((entry) => ({
      local: path.join(publicBackendRoot, entry.name),
      remote: entry.name === "api/index.php" ? "public_html/api/index.php" : `public_html/${entry.name}`,
      kind: "mutable",
    }))
    .sort((left, right) => left.remote.localeCompare(right.remote));
  backendEntrypoints.push({
    local: path.join(publicBackendRoot, "api/index.php"),
    remote: "public_html/api/index.php",
    kind: "mutable",
  });
  const expiry = {
    local: path.join(projectRoot, "backend/scripts/expire_new_arrivals.php"),
    remote: "src/expire_new_arrivals.php",
    kind: "mutable",
  };
  const index = { local: htmlPath, remote: "public_html/index.html", kind: "mutable", activateLast: true };
  const mutable = [...backendSources, ...backendEntrypoints, expiry, ...rootFiles, index];
  const items = [...assets, ...mutable];

  for (const item of items) {
    assertManagedPath(item.remote, item.kind);
    if (!(await exists(item.local))) throw new Error(`Falta el archivo requerido por el release: ${item.local}`);
  }

  const wasmReference = await readFile(path.join(frontendRoot, "src/communityVideoCompression.js"), "utf8");
  const wasmName = wasmReference.match(/wasmURL\s*=\s*["']\/ffmpeg-core-wasm\.php\?v=([A-Za-z0-9_-]+)["']/)?.[1];
  if (!wasmName || !wasmReference.includes("/ffmpeg-core-wasm.php")) {
    throw new Error("No se pudo determinar la versión del WASM de compresión que debe preservarse.");
  }
  const wasmWrapper = await readFile(path.join(publicBackendRoot, "ffmpeg-core-wasm.php"), "utf8");
  if (!wasmWrapper.includes(`ffmpeg-core-${wasmName}.wasm.br`)) {
    throw new Error("El frontend y el endpoint WASM no coinciden; se detiene la publicación.");
  }

  return {
    js,
    css,
    wasm: `src/ffmpeg-core-${wasmName}.wasm.br`,
    assets,
    mutable: mutable.filter((item) => !item.activateLast),
    index,
  };
}

function parseEnv(source) {
  return Object.fromEntries(source.split(/\r?\n/)
    .filter((line) => /^[A-Za-z_][A-Za-z0-9_]*=/.test(line))
    .map((line) => {
      const splitAt = line.indexOf("=");
      let value = line.slice(splitAt + 1).trim();
      if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
      return [line.slice(0, splitAt), value];
    }));
}

function curl(netrc, curlArgs) {
  return new Promise((resolve, reject) => {
    const child = spawn("curl", ["--silent", "--show-error", "--retry", "2", "--retry-delay", "2",
      "--ssl-reqd", "--tlsv1.2", "--tls-max", "1.2", "--netrc-file", netrc, ...curlArgs]);
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (code) => code === 0 ? resolve() : reject(new Error(`curl ${code}: ${stderr.trim()}`)));
  });
}

async function download(netrc, remote, local) {
  await curl(netrc, ["--output", local, `ftp://${host}/${remote}`]);
  return readFile(local);
}

async function checkProduction() {
  const healthResponse = await fetch("https://vastyle.com.mx/api/health", { cache: "no-store" });
  const health = await healthResponse.json();
  if (!healthResponse.ok || !health.ok) throw new Error("API de cPanel no pasó GET /api/health.");
  const catalogResponse = await fetch("https://vastyle.com.mx/api/products", { cache: "no-store" });
  const catalog = await catalogResponse.json();
  const products = Array.isArray(catalog.data) ? catalog.data : [];
  const ids = products.map((product) => String(product.id ?? ""));
  if (!catalogResponse.ok || !catalog.ok || products.length === 0 || ids.some((id) => !id) || new Set(ids).size !== ids.length) {
    throw new Error("GET /api/products debe devolver productos con ids únicos antes de publicar.");
  }
  return { health: true, products: products.length, uniqueIds: new Set(ids).size };
}

function planSummary(manifest) {
  return {
    mode: dryRun ? "dry-run (sin conexión ni escrituras)" : "apply",
    assets: manifest.assets.map((item) => ({ action: "add-if-missing; hash collision aborts", remote: `/home/vastyle/${item.remote}` })),
    mutableCode: manifest.mutable.map((item) => ({ action: "backup then atomic replace; existing file required", remote: `/home/vastyle/${item.remote}` })),
    activationLast: { action: "backup then atomic replace after staged hash checks", remote: `/home/vastyle/${manifest.index.remote}` },
    requiredPreservedWasm: `/home/vastyle/${manifest.wasm} (must already exist; never uploaded/replaced)`,
    protected: protectedPaths,
    noDeleteOperations: true,
    databaseWrites: false,
  };
}

const manifest = await buildManifest();
if (dryRun) {
  console.log(JSON.stringify(planSummary(manifest), null, 2));
  process.exit(0);
}

const envPath = path.join(projectRoot, ".env");
const env = parseEnv(await readFile(envPath, "utf8"));
if (!env.user || !env.pass) throw new Error("Faltan las credenciales FTPS locales user/pass.");
await mkdir(temporaryRoot, { recursive: true, mode: 0o700 });
await chmod(temporaryRoot, 0o700);
await mkdir(backupRoot, { recursive: true, mode: 0o700 });
await chmod(backupRoot, 0o700);
await writeFile(netrcPath, `machine ${host} login ${env.user} password ${env.pass}\n`, { mode: 0o600 });
await chmod(netrcPath, 0o600);

const changes = [];
const backups = new Map();
const staged = [];

async function fetchRemote(remote, localName) {
  return download(netrcPath, remote, path.join(temporaryRoot, localName));
}

async function stageAndReplace(item, source) {
  const remote = item.remote;
  const suffix = `stage-${runId}`;
  const stagedRemote = `${remote}.${suffix}`;
  const stageLocal = path.join(temporaryRoot, `${path.basename(remote)}.${suffix}`);
  await writeFile(stageLocal, source, { mode: 0o600 });
  await curl(netrcPath, ["--limit-rate", "900k", "--ftp-create-dirs", "--upload-file", stageLocal, `ftp://${host}/${stagedRemote}`]);
  staged.push(stagedRemote);
  const stagedBytes = await fetchRemote(stagedRemote, `${path.basename(remote)}.verify`);
  if (sha(stagedBytes) !== sha(source)) throw new Error(`Hash de staging incorrecto: ${remote}`);
  await curl(netrcPath, ["--quote", `RNFR ${stagedRemote}`, "--quote", `RNTO ${remote}`, `ftp://${host}/`]);
  changes.push({ remote, previous: backups.get(remote) ?? null });
  const live = await fetchRemote(remote, `${path.basename(remote)}.live`);
  if (sha(live) !== sha(source)) throw new Error(`No se pudo verificar el archivo remoto activado: ${remote}`);
  console.log(`Verificado: /home/vastyle/${remote}`);
}

async function rollback() {
  for (const change of [...changes].reverse()) {
    if (!change.previous) continue;
    const previous = await readFile(change.previous);
    const rollbackItem = { remote: change.remote };
    await stageAndReplace(rollbackItem, previous);
  }
}

try {
  const production = await checkProduction();

  const requiredWasm = await fetchRemote(manifest.wasm, "required-ffmpeg-wasm.br");
  if (!requiredWasm.length) throw new Error("El WASM requerido en cPanel está vacío; se aborta sin reemplazarlo.");

  for (const item of manifest.mutable) {
    const current = await fetchRemote(item.remote, `${item.remote.replaceAll("/", "__")}.backup`);
    if (!current.length) throw new Error(`El archivo administrado remoto está vacío: ${item.remote}`);
    const backup = path.join(backupRoot, item.remote.replaceAll("/", "__"));
    await writeFile(backup, current, { mode: 0o600, flag: "wx" });
    backups.set(item.remote, backup);
  }

  const assetActions = [];
  for (const item of manifest.assets) {
    const source = await readFile(item.local);
    try {
      const current = await fetchRemote(item.remote, `${path.basename(item.remote)}.asset-check`);
      if (sha(current) !== sha(source)) throw new Error(`Colisión: el asset hash ya existe con otro contenido (${item.remote}).`);
      assetActions.push({ item, source, exists: true });
    } catch (error) {
      if (!String(error.message).includes("curl 78")) throw error;
      assetActions.push({ item, source, exists: false });
    }
  }

  for (const asset of assetActions) {
    if (!asset.exists) {
      await stageAndReplace(asset.item, asset.source);
    } else {
      console.log(`Asset ya verificado: /home/vastyle/${asset.item.remote}`);
    }
  }

  for (const item of manifest.mutable) {
    const source = await readFile(item.local);
    const previous = await readFile(backups.get(item.remote));
    if (sha(source) !== sha(previous)) await stageAndReplace(item, source);
    else console.log(`Sin cambios: /home/vastyle/${item.remote}`);
  }

  const indexSource = await readFile(manifest.index.local);
  const indexPrevious = await readFile(backups.get(manifest.index.remote));
  if (sha(indexSource) !== sha(indexPrevious)) await stageAndReplace(manifest.index, indexSource);

  const liveHtmlResponse = await fetch("https://vastyle.com.mx/", { cache: "no-store" });
  const liveHtml = await liveHtmlResponse.text();
  if (!liveHtmlResponse.ok || !liveHtml.includes(`/${manifest.js}`) || !liveHtml.includes(`/${manifest.css}`)) {
    throw new Error("El HTML de producción no referencia los assets del release compilado.");
  }
  const after = await checkProduction();
  console.log(JSON.stringify({ ok: true, productionBefore: production, productionAfter: after, backupRoot, activeJs: manifest.js, activeCss: manifest.css }));
} catch (error) {
  try {
    await rollback();
  } catch (rollbackError) {
    console.error(`ERROR: rollback incompleto. Respaldos locales: ${backupRoot}. ${rollbackError.message}`);
  }
  throw error;
} finally {
  await rm(netrcPath, { force: true });
  await rm(temporaryRoot, { recursive: true, force: true });
}
