import { createHash } from "node:crypto";
import { readFile, writeFile, chmod, mkdir, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";

const root = process.cwd();
const host = "svgr206.serverneubox.com.mx";
const backupDir = "/private/tmp/vastyle-production-backup-20261014";
const netrc = "/private/tmp/vastyle-release-deploy.netrc";
const env = Object.fromEntries((await readFile(path.join(root, "vastyle.com.mx/.env"), "utf8"))
  .split(/\r?\n/).filter((line) => /^[A-Za-z_][A-Za-z_0-9]*=/.test(line))
  .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]));
await writeFile(netrc, `machine ${host} login ${env.user} password ${env.pass}\n`, { mode: 0o600 });
await chmod(netrc, 0o600);
const temp = "/private/tmp/vastyle-release-verify";
await mkdir(temp, { recursive: true, mode: 0o700 });

function sha(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function curl(args) {
  return new Promise((resolve, reject) => {
    const child = spawn("curl", [
      "--silent", "--show-error", "--retry", "3", "--retry-delay", "5",
      "--retry-all-errors", "--ssl-reqd", "--netrc-file", netrc, ...args,
    ]);
    let error = "";
    child.stderr.on("data", (chunk) => { error += chunk; });
    child.on("close", (code) => code === 0 ? resolve() : reject(new Error(`curl ${code}: ${error.trim()}`)));
  });
}

async function uploadNewOrVerify(local, remote) {
  const source = await readFile(local);
  const remoteUrl = `ftp://${host}/${remote}`;
  const current = path.join(temp, path.basename(remote));
  try {
    await curl(["--output", current, remoteUrl]);
    const old = await readFile(current);
    if (sha(old) !== sha(source)) throw new Error(`El asset remoto existente no coincide: ${remote}`);
    return;
  } catch (error) {
    if (!String(error.message).includes("curl 78") && !String(error.message).includes("curl 19")) throw error;
  }
  await curl(["--limit-rate", "900k", "--upload-file", local, remoteUrl]);
  await curl(["--output", current, remoteUrl]);
  if (sha(await readFile(current)) !== sha(source)) throw new Error(`Hash de asset incorrecto: ${remote}`);
}

async function replaceRemote(local, remote, backupName) {
  const backup = path.join(backupDir, backupName);
  await readFile(backup);
  const source = await readFile(local);
  const stage = `${remote}.stage-release`;
  const stagedLocal = path.join(temp, `${path.basename(remote)}.stage`);
  await curl(["--limit-rate", "900k", "--upload-file", local, `ftp://${host}/${stage}`]);
  await curl(["--output", stagedLocal, `ftp://${host}/${stage}`]);
  if (sha(await readFile(stagedLocal)) !== sha(source)) throw new Error(`Hash de staging incorrecto: ${remote}`);
  await curl(["--quote", `RNFR ${stage}`, "--quote", `RNTO ${remote}`, `ftp://${host}/`]);
  console.log(`Activado ${remote}`);
}

const release = path.join(root, "vastyle.com.mx/release");
const backendFiles = [
  ["vastyle.com.mx/backend/src/bootstrap.php", "src/bootstrap.php", "src_bootstrap.php"],
  ["vastyle.com.mx/backend/src/admin_home_routes.php", "src/admin_home_routes.php", "src_admin_home_routes.php"],
  ["vastyle.com.mx/backend/src/admin_product_routes.php", "src/admin_product_routes.php", "src_admin_product_routes.php"],
  ["vastyle.com.mx/backend/src/admin_misc_routes.php", "src/admin_misc_routes.php", "src_admin_misc_routes.php"],
];
const apiEntry = ["vastyle.com.mx/backend/public/api/index.php", "public_html/api/index.php", "public_html_api_index.php"];
const assets = [
  "assets/index-BkxqBSqh.js",
  "assets/index-B1fwtgeb.css",
  "assets/communityVideoCompression-Bh3TXzlX.js",
];

try {
  for (const relative of assets) {
    await uploadNewOrVerify(path.join(release, relative), `public_html/${relative}`);
    console.log(`Verificado ${relative}`);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  for (const [local, remote, backup] of backendFiles) {
    await replaceRemote(path.join(root, local), remote, backup);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  await replaceRemote(path.join(root, apiEntry[0]), apiEntry[1], apiEntry[2]);
  await new Promise((resolve) => setTimeout(resolve, 1000));
  await replaceRemote(path.join(release, "index.html"), "public_html/index.html", "public_html_index.html");
} finally {
  await rm(netrc, { force: true });
  await rm(temp, { recursive: true, force: true });
}

const html = await (await fetch("https://vastyle.com.mx/", { cache: "no-store" })).text();
if (!html.includes("index-BkxqBSqh.js") || !html.includes("index-B1fwtgeb.css")) {
  throw new Error("El HTML de producción no referencia el release esperado.");
}
const api = await (await fetch("https://vastyle.com.mx/api/products", { cache: "no-store" })).json();
const products = Array.isArray(api.data) ? api.data : [];
if (!api.ok || products.length !== 492 || new Set(products.map((product) => String(product.id))).size !== 492) {
  throw new Error("La verificación del catálogo posterior al despliegue falló.");
}
console.log(JSON.stringify({ frontend: "index-BkxqBSqh.js", catalogRows: products.length,
  uniqueProductIds: new Set(products.map((product) => String(product.id))).size }));
