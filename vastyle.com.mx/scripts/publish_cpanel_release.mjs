import { createHash, randomBytes } from "node:crypto";
import { chmod, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";

const root = process.cwd();
const host = "svgr206.serverneubox.com.mx";
const release = path.join(root, "vastyle.com.mx/release");
const releaseHtml = await readFile(path.join(release, "index.html"), "utf8");
const appScript = releaseHtml.match(/src="\/assets\/(index-[^"/]+\.js)"/)?.[1];
const appStyle = releaseHtml.match(/href="\/assets\/(index-[^"/]+\.css)/)?.[1];
if (!appScript || !appStyle) throw new Error("El release no contiene los assets principales.");
const backupRoot = `/private/tmp/vastyle-production-backup-20261014/publish-${Date.now()}`;
const tempRoot = `/private/tmp/vastyle-release-${randomBytes(5).toString("hex")}`;
const netrc = `${tempRoot}.netrc`;
const changedFiles = [];
const env = Object.fromEntries((await readFile(path.join(root, "vastyle.com.mx/.env"), "utf8"))
  .split(/\r?\n/).filter((line) => /^[A-Za-z_][A-Za-z_0-9]*=/.test(line))
  .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]));
if (!env.user || !env.pass) throw new Error("Faltan credenciales FTPS locales.");
await mkdir(backupRoot, { recursive: true, mode: 0o700 });
await mkdir(tempRoot, { recursive: true, mode: 0o700 });
await writeFile(netrc, `machine ${host} login ${env.user} password ${env.pass}\n`, { mode: 0o600 });
await chmod(netrc, 0o600);

function sha(value) {
  return createHash("sha256").update(value).digest("hex");
}

function curl(args) {
  return new Promise((resolve, reject) => {
    const child = spawn("curl", ["--silent", "--show-error", "--retry", "3", "--retry-delay", "2",
      "--retry-all-errors", "--ssl-reqd", "--tlsv1.2", "--tls-max", "1.2", "--netrc-file", netrc, ...args]);
    let error = "";
    child.stderr.on("data", (chunk) => { error += chunk; });
    child.on("close", (code) => code === 0 ? resolve() : reject(new Error(`curl ${code}: ${error.trim()}`)));
  });
}

async function download(remote, local) {
  await curl(["--output", local, `ftp://${host}/${remote}`]);
  return readFile(local);
}

async function verifyStage(remote, localBytes) {
  const checkPath = path.join(tempRoot, `${path.basename(remote)}.verify`);
  const remoteBytes = await download(remote, checkPath);
  if (sha(remoteBytes) !== sha(localBytes)) throw new Error(`Hash remoto incorrecto: ${remote}`);
}

async function backupCurrent(remote, label) {
  const local = path.join(backupRoot, label.replaceAll("/", "__"));
  const bytes = await download(remote, local);
  if (!bytes.length) throw new Error(`El respaldo remoto está vacío: ${remote}`);
  return { local, bytes };
}

async function atomicReplace(localPath, remote, label) {
  const source = await readFile(localPath);
  const current = await backupCurrent(remote, label);
  if (sha(current.bytes) === sha(source)) {
    console.log(`Sin cambios ${remote}`);
    return;
  }
  const stage = `${remote}.stage-${path.basename(tempRoot)}`;
  await curl(["--limit-rate", "900k", "--upload-file", localPath, `ftp://${host}/${stage}`]);
  await verifyStage(stage, source);
  await curl(["--quote", `RNFR ${stage}`, "--quote", `RNTO ${remote}`, `ftp://${host}/`]);
  const live = await download(remote, path.join(tempRoot, `${path.basename(remote)}.live`));
  if (sha(live) !== sha(source)) throw new Error(`No se confirmó el reemplazo de ${remote}`);
  changedFiles.push({ remote, backup: current.local });
  console.log(`Publicado ${remote}; respaldo local: ${current.local}`);
}

async function createOrReplace(localPath, remote, label) {
  try {
    await download(remote, path.join(tempRoot, `${path.basename(remote)}.existing`));
    return atomicReplace(localPath, remote, label);
  } catch (error) {
    if (!String(error.message).includes("curl 78") && !String(error.message).includes("curl 19")) throw error;
  }
  const source = await readFile(localPath);
  const stage = `${remote}.stage-${path.basename(tempRoot)}`;
  await curl(["--limit-rate", "900k", "--ftp-create-dirs", "--upload-file", localPath, `ftp://${host}/${stage}`]);
  await verifyStage(stage, source);
  await curl(["--quote", `RNFR ${stage}`, "--quote", `RNTO ${remote}`, `ftp://${host}/`]);
  await verifyStage(remote, source);
  changedFiles.push({ remote, backup: null });
  console.log(`Creado ${remote}; hash verificado`);
}

async function addHashedAsset(localPath, remote) {
  const source = await readFile(localPath);
  const currentPath = path.join(tempRoot, `${path.basename(remote)}.existing`);
  try {
    const current = await download(remote, currentPath);
    if (sha(current) !== sha(source)) throw new Error(`Colisión de asset con contenido distinto: ${remote}`);
    console.log(`Asset verificado ${remote}`);
    return;
  } catch (error) {
    if (!String(error.message).includes("curl 78") && !String(error.message).includes("curl 19")) throw error;
  }
  const stage = `${remote}.stage-${path.basename(tempRoot)}`;
  await curl(["--limit-rate", "900k", "--ftp-create-dirs", "--upload-file", localPath, `ftp://${host}/${stage}`]);
  await verifyStage(stage, source);
  await curl(["--quote", `RNFR ${stage}`, "--quote", `RNTO ${remote}`, `ftp://${host}/`]);
  await verifyStage(remote, source);
  console.log(`Asset subido y verificado ${remote}`);
}

const backendFiles = [
  ["vastyle.com.mx/backend/src/bootstrap.php", "src/bootstrap.php"],
  ["vastyle.com.mx/backend/src/public_routes.php", "src/public_routes.php"],
  ["vastyle.com.mx/backend/src/admin_home_routes.php", "src/admin_home_routes.php"],
  ["vastyle.com.mx/backend/src/admin_misc_routes.php", "src/admin_misc_routes.php"],
  ["vastyle.com.mx/backend/src/admin_product_routes.php", "src/admin_product_routes.php"],
  ["vastyle.com.mx/backend/src/admin_community_routes.php", "src/admin_community_routes.php"],
  ["vastyle.com.mx/backend/public/community-admin.php", "public_html/community-admin.php"],
  ["vastyle.com.mx/backend/public/ffmpeg-core-wasm.php", "public_html/ffmpeg-core-wasm.php"],
  ["vastyle.com.mx/backend/public/home-banner-media-admin.php", "public_html/home-banner-media-admin.php"],
  ["vastyle.com.mx/backend/public/home-config-admin.php", "public_html/home-config-admin.php"],
  ["vastyle.com.mx/backend/public/product-admin.php", "public_html/product-admin.php"],
];

async function checkProductionApi() {
  const health = await (await fetch("https://vastyle.com.mx/api/health", { cache: "no-store" })).json();
  const catalog = await (await fetch("https://vastyle.com.mx/api/products", { cache: "no-store" })).json();
  const products = Array.isArray(catalog.data) ? catalog.data : [];
  const unique = new Set(products.map((product) => String(product.id)));
  const media = products.filter((product) => String(product.image_url || "").startsWith("/media/migrated-final-20261014/")).length;
  if (!health.ok || !catalog.ok || products.length !== 492 || unique.size !== 492 || media !== 492) {
    throw new Error("La API/catálogo no pasó la verificación de preactivación.");
  }
  return { health: health.ok, catalogRows: products.length, uniqueProductIds: unique.size, localProductImages: media };
}

async function rollback() {
  for (const change of changedFiles.reverse()) {
    if (!change.backup) {
      await curl(["--quote", `DELE ${change.remote}`, `ftp://${host}/`]);
      continue;
    }
    const stage = `${change.remote}.rollback-${path.basename(tempRoot)}`;
    await curl(["--limit-rate", "900k", "--upload-file", change.backup, `ftp://${host}/${stage}`]);
    const backupBytes = await readFile(change.backup);
    await verifyStage(stage, backupBytes);
    await curl(["--quote", `RNFR ${stage}`, "--quote", `RNTO ${change.remote}`, `ftp://${host}/`]);
  }
}

try {
  const assetNames = await readdir(path.join(release, "assets"));
  for (const name of assetNames) {
    await addHashedAsset(path.join(release, "assets", name), `public_html/assets/${name}`);
  }

  for (const [local, remote] of backendFiles) {
    await atomicReplace(path.join(root, local), remote, `backend-${remote}`);
  }
  await atomicReplace(path.join(root, "vastyle.com.mx/backend/public/api/index.php"),
    "public_html/api/index.php", "backend-public_html-api-index.php");

  const preActivation = await checkProductionApi();
  console.log(`API lista antes de activar frontend: ${JSON.stringify(preActivation)}`);

  await createOrReplace(path.join(root, "vastyle.com.mx/backend/scripts/expire_new_arrivals.php"),
    "src/expire_new_arrivals.php", "backend-src-expire-new-arrivals.php");
  await atomicReplace(path.join(release, "ffmpeg-core-CgUfceKH.wasm.br"),
    "src/ffmpeg-core-CgUfceKH.wasm.br", "backend-src-ffmpeg-core-CgUfceKH.wasm.br");

  const rootFiles = ["favicon.svg", "icon-192.png", "icon-512.png", "icons.svg", "manifest.json", "service-worker.js"];
  for (const name of rootFiles) {
    await atomicReplace(path.join(release, name), `public_html/${name}`, `release-${name}`);
  }

  await atomicReplace(path.join(release, "index.html"), "public_html/index.html", "release-index.html");
  const html = await (await fetch("https://vastyle.com.mx/", { cache: "no-store" })).text();
  if (!html.includes(`/assets/${appScript}`) || !html.includes(`/assets/${appStyle}`)) {
    throw new Error("El HTML público no apunta al release verificado.");
  }
  const js = await (await fetch(`https://vastyle.com.mx/assets/${appScript}`, { cache: "no-store" })).text();
  if (js.includes("supabase.co") || js.includes("createClient")) throw new Error("El bundle nuevo conserva una dependencia Supabase.");
  const { health, catalogRows, uniqueProductIds, localProductImages } = await checkProductionApi();
  const config = Object.fromEntries((await readFile(path.join(root, "vastyle.com.mx/.env"), "utf8"))
    .split(/\r?\n/).filter((line) => /^[A-Za-z_][A-Za-z_0-9]*=/.test(line))
    .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]));
  const login = await fetch("https://vastyle.com.mx/api/admin/login", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: config.ADMIN_EMAIL, password: config.ADMIN_PASSWORD }), cache: "no-store",
  });
  const loginBody = await login.json();
  const cookies = login.headers.getSetCookie?.() || [];
  const cookie = cookies.map((value) => value.split(";", 1)[0]).join("; ");
  if (!login.ok || !loginBody.ok || !cookie) throw new Error("La prueba de login admin posterior al despliegue falló.");
  const adminMe = await fetch("https://vastyle.com.mx/api/admin/me", { headers: { cookie }, cache: "no-store" });
  const adminBody = await adminMe.json();
  if (!adminMe.ok || !adminBody.ok) throw new Error("La sesión admin no se restauró tras el despliegue.");
  const logout = await fetch("https://vastyle.com.mx/api/admin/logout", {
    method: "POST", headers: { cookie, "x-csrf-token": loginBody.csrfToken }, cache: "no-store",
  });
  if (!logout.ok) throw new Error("La sesión temporal de comprobación admin no se cerró correctamente.");
  console.log(JSON.stringify({ frontend: appScript, health,
    catalogRows, uniqueProductIds, localProductImages,
    adminLogin: loginBody.ok && adminBody.ok && logout.ok,
    backupDirectory: backupRoot }));
} catch (error) {
  try {
    await rollback();
    console.error("Se revirtieron los archivos modificados durante el despliegue.");
  } catch (rollbackError) {
    console.error(`ATENCIÓN: rollback incompleto: ${rollbackError.message}`);
  }
  throw error;
} finally {
  await rm(netrc, { force: true });
  await rm(tempRoot, { recursive: true, force: true });
}
