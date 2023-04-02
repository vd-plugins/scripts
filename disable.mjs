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

    const manifest = JSON.parse(await fs.readFile(path.join(source, "manifest.json"), "utf8"));
    manifest.description = "This plugin has been temporarily disabled by the Vendetta staff";
    manifest.hash = "7a3bac42d229c335dc892d1749680f70ba9d74cb06cd451dcd1153b9acd1a8c1";

    await fs.writeFile(path.join(source, "index.js"), `(()=>({onUnload(){}}))();`);
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
    
    console.log("Successfully disabled");
  } catch (e) {
    console.error(e);
  }
}
