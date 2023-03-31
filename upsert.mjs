import * as fs from "fs/promises";
import * as path from "path";
import { promisify } from "util";
import { exec as cbExec } from "child_process";
const exec = promisify(cbExec);

/** @type URL[] */
const inputs = process.env.PLUGINS.split(" ").map((pl) => new URL(pl.replace(/\/*$/, "/")));
for (const pl of inputs) pl.pathname = pl.pathname.replace(/\/+/g, "/");

for (const pl of inputs) {
  console.log(`> ${pl}`);

  try {
    const source = pl.host + pl.pathname;

    const mReq = await fetch(new URL("manifest.json", pl));
    if (!mReq.ok) throw `Manifest request returned non-ok status code ${mReq.status}`;
    
    let manifest;
    try {
      manifest = await mReq.json();
      manifest.main = "index.js";
      manifest.vendetta ??= {};
      manifest.vendetta.original = source;
    } catch {
      throw "Malformed plugin manifest JSON";
    }
    
    const jReq = await fetch(new URL(manifest.main, pl));
    if (!jReq.ok) throw `Bundle request returned non-ok status code ${jReq.status}`;
    const js = await jReq.text();

    await fs.mkdir(source, { recursive: true });

    await fs.writeFile(path.join(source, "index.js"), js);
    await fs.writeFile(path.join(source, "manifest.json"), JSON.stringify(manifest));

    /** @type any[] */
    let plugins = JSON.parse(await fs.readFile("plugins-full.json", "utf8"));
    const index = plugins.findIndex((p) => p.vendetta.original === source);
    if (index === -1) plugins.push(manifest);
    else plugins[index] = manifest;

    await fs.writeFile("plugins.json", JSON.stringify(plugins.map((p) => p.vendetta.original)));
    await fs.writeFile("plugins-full.json", JSON.stringify(plugins));

    const add = await exec("git add --all");
    if (add.stderr) throw add.stderr;

    const commit = await exec(`git commit --allow-empty -m "[CI] Upserted ${pl}"`);
    if (commit.stderr) throw commit.stderr;
    
    console.log("Successfully upserted");
  } catch (e) {
    console.error(e);
  }
}
