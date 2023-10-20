import * as fs from "fs/promises";
import * as path from "path";
import { createHash } from "crypto";
import { promisify } from "util";
import { exec as cbExec } from "child_process";
const exec = promisify(cbExec);

const writeSummary = (text) => fs.appendFile(process.env.GITHUB_STEP_SUMMARY, text);
await writeSummary("# Redirect plugin(s)\n");

/** @type URL[] */
const inputs = process.env.PLUGINS.split(" ").map((pl) => new URL(pl.replace(/\/*$/, "/")));
for (const pl of inputs) pl.pathname = pl.pathname.replace(/\/+/g, "/");

if (inputs.length % 2 !== 0) throw new Error("Invalid redirect input");

for (let i = 0; i < inputs.length; i += 2) {
  const sourceUrl = inputs[i];
  const targetUrl = inputs[i+1];
  console.log(`> ${sourceUrl}`);
  console.log(`-> ${targetUrl}`);

  try {
    const source = sourceUrl.host + sourceUrl.pathname;
    const target = targetUrl.host + targetUrl.pathname;

    const mReq = await fetch(new URL("manifest.json", targetUrl));
    if (!mReq.ok) throw `Target manifest request returned non-ok status code ${mReq.status}`;
    
    let manifest;
    try {
      manifest = await mReq.json();
      manifest.main = "index.js";
      manifest.vendetta ??= {};
      manifest.vendetta.original = target;
    } catch {
      throw "Malformed plugin manifest JSON";
    }
    
    const jReq = await fetch(new URL(manifest.main, targetUrl), { method: "HEAD" });
    if (!jReq.ok) throw `Target bundle request returned non-ok status code ${jReq.status}`;

    manifest.description += " [redirect]";

    const js = `(setImmediate(async function(){let t="https://vd-plugins.github.io/proxy/"+${JSON.stringify(target)},p=vendetta.plugin.id,s=vendetta.plugins,m=nativeModuleProxy.MMKVManager,o=(await m.getItem(p))??"{}";await m.setItem(t,o);s.removePlugin(p);s.installPlugin(t)}),({onUnload(){}}));`;
    manifest.hash = createHash("sha256").update(js).digest("hex");

    await fs.mkdir(source, { recursive: true });

    await fs.writeFile(path.join(source, "index.js"), js);
    await fs.writeFile(path.join(source, "manifest.json"), JSON.stringify(manifest));

    /** @type any[] */
    let plugins = JSON.parse(await fs.readFile("plugins-full.json", "utf8"));
    plugins = plugins.filter((p) => p.vendetta.original !== source);

    await fs.writeFile("plugins.json", JSON.stringify(plugins.map((p) => p.vendetta.original)));
    await fs.writeFile("plugins-full.json", JSON.stringify(plugins));

    const add = await exec("git add --all");
    if (add.stderr) throw add.stderr;

    const commit = await exec(`git commit --allow-empty -m "[CI] Redirected ${sourceUrl}"`);
    if (commit.stderr) throw commit.stderr;
    
    console.log("Successfully redirected");

    const now = await exec(`git rev-list HEAD -1`);
    if (!now.stderr)
      await writeSummary(`- from https://vd-plugins.github.io/proxy/${source}  
to https://vd-plugins.github.io/proxy/${target}  
https://github.com/vd-plugins/proxy/commit/${now.stdout.trim()}\n\n`);
  } catch (e) {
    console.error(e);
  }
}
