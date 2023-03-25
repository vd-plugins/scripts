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

    await fs.rm(source, { recursive: true });

    /** @type any[] */
    let plugins = JSON.parse(await fs.readFile("plugins-full.json", "utf8"));
    plugins = plugins.filter((p) => p.vendetta.original !== source);

    await fs.writeFile("plugins.json", JSON.stringify(plugins.map((p) => p.vendetta.original)));
    await fs.writeFile("plugins-full.json", JSON.stringify(plugins));

    const add = await exec("git add --all");
    if (add.stderr) throw add.stderr;

    const commit = await exec(`git commit --allow-empty -m "[CI] Removed ${pl}"`);
    if (commit.stderr) throw commit.stderr;
    
    console.log("Successfully removed");
  } catch (e) {
    console.error(e);
  }
}
