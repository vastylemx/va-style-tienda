import { createHash, randomBytes, randomUUID } from "node:crypto";
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
if (!env.user || !env.pass || !env.ADMIN_EMAIL || !env.ADMIN_PASSWORD) throw new Error("Faltan credenciales locales de despliegue.");

const suffix = randomBytes(6).toString("hex");
const backupRoot = `/private/tmp/vastyle-advisor-backup-${Date.now()}`;
const netrc = `${backupRoot}/ftp.netrc`;
const migrationRemote = `public_html/api/advisor-name-setup-${suffix}.php`;
const changed = [];
let migrationUploaded = false;
let sessionCookie = "";
let csrfToken = "";
await mkdir(backupRoot, { recursive: true, mode: 0o700 });
await writeFile(netrc, `machine ${host} login ${env.user} password ${env.pass}\n`, { mode: 0o600 });
await chmod(netrc, 0o600);

const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
function curl(args) {
  return new Promise((resolve, reject) => {
    const child = spawn("curl", ["--silent", "--show-error", "--retry", "3", "--retry-delay", "3",
      "--retry-all-errors", "--ssl-reqd", "--tlsv1.2", "--tls-max", "1.2", "--netrc-file", netrc, ...args]);
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (code) => code === 0 ? resolve() : reject(new Error(`FTPS (${code}): ${stderr.trim()}`)));
  });
}

async function download(remote, local) {
  await curl(["--output", local, `ftp://${host}/${remote}`]);
  return readFile(local);
}

async function backup(remote) {
  const local = path.join(backupRoot, remote.replaceAll("/", "__"));
  const bytes = await download(remote, local);
  if (!bytes.length) throw new Error(`Respaldo vacío: ${remote}`);
  await chmod(local, 0o600);
  return { local, bytes };
}

async function uploadStage(local, remote) {
  const stage = `${remote}.stage-${suffix}`;
  await curl(["--limit-rate", "800k", "--upload-file", local, `ftp://${host}/${stage}`]);
  const check = await download(stage, path.join(backupRoot, `verify-${randomBytes(5).toString("hex")}`));
  if (sha(check) !== sha(await readFile(local))) throw new Error(`Hash de staging incorrecto: ${remote}`);
  await curl(["--quote", `RNFR ${stage}`, "--quote", `RNTO ${remote}`, `ftp://${host}/`]);
}

async function replace(local, remote, existing) {
  const source = await readFile(local);
  if (sha(source) === sha(existing.bytes)) return;
  await uploadStage(local, remote);
  const live = await download(remote, path.join(backupRoot, `live-${randomBytes(5).toString("hex")}`));
  if (sha(live) !== sha(source)) throw new Error(`Hash remoto incorrecto: ${remote}`);
  changed.push({ remote, backup: existing.local });
  console.log(`Publicado ${remote}`);
}

async function addAsset(local, remote) {
  const source = await readFile(local);
  const checkPath = path.join(backupRoot, `asset-${randomBytes(5).toString("hex")}`);
  try {
    const existing = await download(remote, checkPath);
    if (sha(existing) !== sha(source)) throw new Error(`Colisión de asset: ${remote}`);
    return;
  } catch (error) {
    if (!/FTPS \((78|19)\)/.test(String(error.message))) throw error;
  }
  await uploadStage(local, remote);
  changed.push({ remote, backup: null });
  console.log(`Asset publicado ${remote}`);
}

async function api(route, options = {}) {
  const response = await fetch(`${origin}/api/${route}`, { cache: "no-store", ...options });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.ok) throw new Error(`API ${route}: ${response.status} ${body?.error || "respuesta inválida"}`);
  return body;
}

async function catalogIds() {
  const body = await api("products");
  const ids = (body.data || []).map((product) => String(product.id));
  if (ids.length < 492 || new Set(ids).size !== ids.length) throw new Error("El catálogo no conserva IDs únicos.");
  return ids.sort();
}

async function login() {
  const response = await fetch(`${origin}/api/admin/login`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD }), cache: "no-store",
  });
  const body = await response.json();
  const cookies = response.headers.getSetCookie?.() || [response.headers.get("set-cookie")].filter(Boolean);
  sessionCookie = cookies.map((value) => value.split(";", 1)[0]).join("; ");
  csrfToken = body.csrfToken || "";
  if (!response.ok || !body.ok || !sessionCookie || !csrfToken) throw new Error("No se pudo autenticar la sesión de despliegue.");
}

function adminHeaders(write = false) {
  return { cookie: sessionCookie, ...(write ? { "x-csrf-token": csrfToken, "content-type": "application/json" } : {}) };
}

async function rollback() {
  for (const change of changed.reverse()) {
    if (change.backup) await uploadStage(change.backup, change.remote);
    else await curl(["--quote", `DELE ${change.remote}`, `ftp://${host}/`]);
  }
}

try {
  const beforeIds = await catalogIds();
  await login();
  const rosterBefore = await api("admin/whatsapp-lines", { headers: adminHeaders() });
  await writeFile(path.join(backupRoot, "whatsapp_advisor_lines.json"), JSON.stringify(rosterBefore.lines, null, 2), { mode: 0o600 });

  const paths = [
    ["backend/src/public_routes.php", "src/public_routes.php"],
    ["backend/src/admin_misc_routes.php", "src/admin_misc_routes.php"],
    ["backend/public/api/index.php", "public_html/api/index.php"],
    ["release/index.html", "public_html/index.html"],
  ];
  const backups = new Map();
  for (const [, remote] of paths) backups.set(remote, await backup(remote));
  console.log(`Respaldos completos: ${backupRoot}`);

  await uploadStage(path.join(site, "scripts/migrate_advisor_names.php"), migrationRemote);
  migrationUploaded = true;
  const migrated = await api(`advisor-name-setup-${suffix}.php`, {
    method: "POST", headers: adminHeaders(true), body: "{}",
  });
  if (migrated.lines.length !== 5) throw new Error("La migración no devolvió cinco líneas.");
  await curl(["--quote", `DELE ${migrationRemote}`, `ftp://${host}/`]);
  migrationUploaded = false;
  console.log("MariaDB: cinco nombres verificados; instalador temporal eliminado.");

  for (const [local, remote] of paths.slice(0, 3)) {
    await replace(path.join(site, local), remote, backups.get(remote));
  }
  const expected = ["NOEMI GOMEZ", "VENDEDOR", "ALEJANDRO VEGA", "LUIS AVILA", "VENDEDOR"];
  const publicLines = await api(`advisor-lines?verify=${suffix}`);
  const adminLines = await api("admin/whatsapp-lines", { headers: adminHeaders() });
  if (publicLines.data.length !== 5 || publicLines.data.some((line, i) => line.display_name !== expected[i])
      || adminLines.lines.length !== 5 || adminLines.lines.some((line, i) => line.display_name !== expected[i])) {
    throw new Error("La API de asesores no coincide con la configuración esperada.");
  }
  const first = adminLines.lines[0];
  const saved = await api("admin/whatsapp-lines", {
    method: "PATCH", headers: adminHeaders(true), body: JSON.stringify(first),
  });
  if (saved.line.display_name !== first.display_name || saved.line.phone_number !== first.phone_number) {
    throw new Error("La edición administrativa de nombres no pasó la prueba.");
  }

  for (const line of adminLines.lines) {
    const visitorId = `advisor-test-${randomUUID()}`;
    const assign = (preferredAdvisorLine) => api("whatsapp/assign", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ requestId: randomUUID(), visitorId, preferredAdvisorLine }),
    });
    const newClient = await assign(line.id);
    const returningClient = await assign(line.id === 1 ? 2 : 1);
    if (newClient.advisorLine !== line.id || newClient.phoneNumber !== line.phone_number
        || returningClient.advisorLine !== line.id || returningClient.phoneNumber !== line.phone_number) {
      throw new Error(`Asignación persistente incorrecta para línea ${line.id}.`);
    }
  }
  if (JSON.stringify(await catalogIds()) !== JSON.stringify(beforeIds)) throw new Error("Los IDs del catálogo cambiaron.");
  console.log("API, edición admin y persistencia de cinco asesores verificadas.");

  const assets = await readdir(path.join(site, "release/assets"));
  for (const name of assets) await addAsset(path.join(site, "release/assets", name), `public_html/assets/${name}`);
  await replace(path.join(site, "release/index.html"), "public_html/index.html", backups.get("public_html/index.html"));
  const html = await (await fetch(`${origin}/?verify=${suffix}`, { cache: "no-store" })).text();
  const releaseHtml = await readFile(path.join(site, "release/index.html"), "utf8");
  const script = releaseHtml.match(/src="(\/assets\/index-[^"]+\.js)"/)?.[1];
  const style = releaseHtml.match(/href="(\/assets\/index-[^"]+\.css)/)?.[1];
  if (!script || !style || !html.includes(script) || !html.includes(style)) throw new Error("La portada no referencia el nuevo release.");
  const js = await (await fetch(`${origin}${script}?verify=${suffix}`, { cache: "no-store" })).text();
  if (!js.includes("NUESTROS ASESORES")) throw new Error("El bundle público no contiene el nuevo menú.");
  if (JSON.stringify(await catalogIds()) !== JSON.stringify(beforeIds)) throw new Error("El catálogo cambió tras activar el frontend.");
  console.log(JSON.stringify({ published: true, script, style, advisors: publicLines.data, catalogRows: beforeIds.length, backupRoot }));
} catch (error) {
  console.error("Publicación interrumpida:", error.message);
  if (changed.length) {
    try { await rollback(); console.error("Rollback de archivos completado."); }
    catch (rollbackError) { console.error("Rollback incompleto:", rollbackError.message); }
  }
  process.exitCode = 1;
} finally {
  if (migrationUploaded) {
    try { await curl(["--quote", `DELE ${migrationRemote}`, `ftp://${host}/`]); }
    catch (error) { console.error("Retirar instalador manualmente:", migrationRemote, error.message); }
  }
  if (sessionCookie) {
    try { await api("admin/logout", { method: "POST", headers: adminHeaders(true), body: "{}" }); }
    catch (error) { console.error("No se pudo cerrar la sesión temporal:", error.message); }
  }
  await rm(netrc, { force: true });
}
