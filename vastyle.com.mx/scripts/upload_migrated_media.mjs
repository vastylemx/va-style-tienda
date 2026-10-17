throw new Error("Herramienta histórica retirada del flujo operativo. No la ejecutes contra producción; el publicador vigente no transfiere ni reemplaza media.");

import { createHash } from "node:crypto";
import { readFile, writeFile, chmod, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";

const workDir = process.argv[2] || "/private/tmp/vastyle-media-files";
const manifest = JSON.parse(await readFile(path.join(workDir, "manifest.json"), "utf8"));
const env = Object.fromEntries((await readFile("vastyle.com.mx/.env", "utf8"))
  .split(/\r?\n/)
  .filter((line) => /^[A-Za-z_][A-Za-z_0-9]*=/.test(line))
  .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]));
const host = "svgr206.serverneubox.com.mx";
const remoteDir = "public_html/media/migrated-final-20261014";
const publicDir = "https://vastyle.com.mx/media/migrated-final-20261014";
const progressPath = path.join(workDir, "verified-final.json");
const netrc = "/private/tmp/vastyle-media-upload.netrc";
await writeFile(netrc, `machine ${host} login ${env.user} password ${env.pass}\n`, { mode: 0o600 });
await chmod(netrc, 0o600);

function curl(args) {
  return new Promise((resolve, reject) => {
    const child = spawn("curl", [
      "--silent", "--show-error", "--retry", "5", "--retry-delay", "5",
      "--retry-all-errors", "--ssl-reqd", "--tlsv1.2", "--tls-max", "1.2",
      "--netrc-file", netrc, ...args,
    ]);
    let error = "";
    child.stderr.on("data", (chunk) => { error += chunk; });
    child.on("close", (code) => code === 0 ? resolve() : reject(new Error(`curl ${code}: ${error.trim()}`)));
  });
}

try {
  const listing = await new Promise((resolve, reject) => {
    const child = spawn("curl", ["--silent", "--show-error", "--ssl-reqd", "--tlsv1.2", "--tls-max", "1.2",
      "--netrc-file", netrc, "-l", `ftp://${host}/${remoteDir}/`]);
    const chunks = [];
    let error = "";
    child.stdout.on("data", (chunk) => chunks.push(chunk));
    child.stderr.on("data", (chunk) => { error += chunk; });
    child.on("close", (code) => code === 0 ? resolve(Buffer.concat(chunks).toString()) : reject(new Error(error.trim())));
  });
  const existing = new Set(listing.split(/\r?\n/).map((name) => name.trim()).filter(Boolean));
  const entries = manifest.objects;
  let verified = {};
  try {
    verified = JSON.parse(await readFile(progressPath, "utf8"));
  } catch {}
  let completed = Object.keys(verified).length;
  for (const entry of entries) {
    const localPath = path.join(workDir, "objects", entry.name);
    const local = await readFile(localPath);
    const localHash = createHash("sha256").update(local).digest("hex");
    if (local.length !== entry.bytes || localHash !== entry.sha256) {
      throw new Error(`El archivo local no coincide con el manifiesto: ${entry.name}`);
    }
    let complete = verified[entry.name] === entry.sha256;
    if (complete) continue;
    if (!complete && existing.has(entry.name)) complete = await verifyPublic(entry);
    if (!complete) {
      try {
        await curl(["--limit-rate", "900k", "--ftp-create-dirs", "--upload-file", localPath,
          `ftp://${host}/${remoteDir}/${entry.name}`]);
      } catch (error) {
        throw new Error(`Falló ${entry.name} (${entry.bytes} bytes): ${error.message}`);
      }
      if (!await verifyPublic(entry)) throw new Error(`Hash público incorrecto después de cargar: ${entry.name}`);
      await new Promise((resolve) => setTimeout(resolve, 700));
    }
    verified[entry.name] = entry.sha256;
    await writeFile(progressPath, JSON.stringify(verified), { mode: 0o600 });
    completed += 1;
    if (completed % 25 === 0 || completed === entries.length) {
      console.log(`Transferidos ${completed}/${entries.length}`);
    }
  }
  console.log(JSON.stringify({ objects: entries.length, previouslyPresent: existing.size,
    sourceBytes: entries.reduce((sum, entry) => sum + entry.bytes, 0) }));
} finally {
  await rm(netrc, { force: true });
}

async function verifyPublic(entry) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await fetch(`${publicDir}/${entry.name}`, {
        cache: "no-store", signal: AbortSignal.timeout(60000),
      });
      if (response.ok) {
        const bytes = Buffer.from(await response.arrayBuffer());
        if (bytes.length === entry.bytes && createHash("sha256").update(bytes).digest("hex") === entry.sha256) {
          return true;
        }
      }
    } catch {}
    if (attempt < 4) await new Promise((resolve) => setTimeout(resolve, 1200));
  }
  return false;
}
