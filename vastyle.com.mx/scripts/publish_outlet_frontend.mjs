import { createHash, randomBytes } from "node:crypto";
import { chmod, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";

const root = process.cwd();
const site = path.join(root, "vastyle.com.mx");
const host = "svgr206.serverneubox.com.mx";
const origin = "https://vastyle.com.mx";
const env = Object.fromEntries((await readFile(path.join(site, ".env"), "utf8"))
  .split(/\r?\n/).filter((line) => /^[A-Za-z_][A-Za-z_0-9]*=/.test(line))
  .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]));
if (!env.user || !env.pass) throw new Error("Faltan credenciales FTPS locales.");

const suffix = randomBytes(6).toString("hex");
const backupDir = `/private/tmp/vastyle-outlet-backup-${Date.now()}`;
const netrc = path.join(backupDir, "ftp.netrc");
const remoteIndex = "public_html/index.html";
const release = path.join(site, "release");
await mkdir(backupDir, { recursive: true, mode: 0o700 });
await writeFile(netrc, `machine ${host} login ${env.user} password ${env.pass}\n`, { mode: 0o600 });
await chmod(netrc, 0o600);

const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
function curl(args) {
  return new Promise((resolve, reject) => {
    const process = spawn("curl", ["--silent", "--show-error", "--retry", "3", "--retry-delay", "2",
      "--retry-all-errors", "--ssl-reqd", "--tlsv1.2", "--tls-max", "1.2", "--netrc-file", netrc, ...args]);
    let stderr = "";
    process.stderr.on("data", (chunk) => { stderr += chunk; });
    process.on("close", (code) => code === 0 ? resolve() : reject(new Error(`FTPS (${code}): ${stderr.trim()}`)));
  });
}

async function download(remote, local) {
  await curl(["--output", local, `ftp://${host}/${remote}`]);
  return readFile(local);
}

async function upload(local, remote) {
  const stage = `${remote}.stage-${suffix}`;
  await curl(["--limit-rate", "800k", "--upload-file", local, `ftp://${host}/${stage}`]);
  const check = await download(stage, path.join(backupDir, `check-${randomBytes(5).toString("hex")}`));
  if (sha(check) !== sha(await readFile(local))) throw new Error(`Hash de staging incorrecto: ${remote}`);
  await curl(["--quote", `RNFR ${stage}`, "--quote", `RNTO ${remote}`, `ftp://${host}/`]);
}

async function checkCatalog() {
  const response = await fetch(`${origin}/api/products`, { cache: "no-store" });
  const result = await response.json();
  const ids = (result.data || []).map((item) => String(item.id));
  if (!response.ok || !result.ok || ids.length < 492 || new Set(ids).size !== ids.length) {
    throw new Error("La API del catálogo no respondió con IDs únicos.");
  }
  return ids.length;
}

let activated = false;
let backup;
try {
  const currentCount = await checkCatalog();
  const health = await (await fetch(`${origin}/api/health`, { cache: "no-store" })).json();
  if (!health.ok) throw new Error("La API de producción no está disponible.");
  backup = path.join(backupDir, "index.html");
  await download(remoteIndex, backup);
  await chmod(backup, 0o600);
  console.log(`Respaldo del HTML actual: ${backup}`);

  const names = await readdir(path.join(release, "assets"));
  for (const name of names) {
    const local = path.join(release, "assets", name);
    const remote = `public_html/assets/${name}`;
    try {
      const existing = await download(remote, path.join(backupDir, `asset-${randomBytes(5).toString("hex")}`));
      if (sha(existing) !== sha(await readFile(local))) throw new Error(`Asset remoto distinto: ${remote}`);
      continue;
    } catch (error) {
      if (!/FTPS \((78|19)\)/.test(String(error.message))) throw error;
    }
    await upload(local, remote);
    console.log(`Asset publicado: ${remote}`);
  }

  const releaseIndex = path.join(release, "index.html");
  const html = await readFile(releaseIndex, "utf8");
  const script = html.match(/src="(\/assets\/index-[^"]+\.js)"/)?.[1];
  const style = html.match(/href="(\/assets\/index-[^"]+\.css)/)?.[1];
  if (!script || !style) throw new Error("El release no referencia JS y CSS válidos.");
  await upload(releaseIndex, remoteIndex);
  activated = true;

  for (const domain of ["https://vastyle.com.mx", "https://www.vastyle.com.mx"]) {
    const page = await (await fetch(`${domain}/?verify=${suffix}`, { cache: "no-store" })).text();
    if (!page.includes(script) || !page.includes(style)) throw new Error(`El nuevo release no está activo en ${domain}.`);
  }
  const liveJs = await (await fetch(`${origin}${script}?verify=${suffix}`, { cache: "no-store" })).text();
  if (!liveJs.includes("Marcar lote como OUTLET") || !liveJs.includes("Precio Outlet del lote")) {
    throw new Error("El bundle público no contiene el formulario Outlet actualizado.");
  }
  const finalCount = await checkCatalog();
  console.log(JSON.stringify({ published: true, script, style, catalogBefore: currentCount, catalogAfter: finalCount, backupDir }));
} catch (error) {
  console.error("Publicación interrumpida:", error.message);
  if (activated && backup) {
    try { await upload(backup, remoteIndex); console.error("HTML anterior restaurado."); }
    catch (rollbackError) { console.error("No se pudo restaurar el HTML:", rollbackError.message); }
  }
  process.exitCode = 1;
} finally {
  await rm(netrc, { force: true });
}
