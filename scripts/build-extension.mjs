import { build } from "esbuild";
import { readFile, writeFile, mkdir, copyFile, cp, rm } from "node:fs/promises";
import postcss from "postcss";
import tailwindcss from "@tailwindcss/postcss";
const url = process.env.NEXT_PUBLIC_CONVEX_SITE_URL || "";
const release = process.argv.includes("--release");
if (release && !/^https:\/\/[a-z0-9-]+\.convex\.site$/.test(url))
  throw new Error(
    "Set the verified production NEXT_PUBLIC_CONVEX_SITE_URL before building the submission package.",
  );
if (url && !/^https:\/\/[a-z0-9-]+\.convex\.site$/.test(url))
  throw new Error("Invalid backend URL");
await build({
  entryPoints: ["extension/sidepanel.tsx"],
  bundle: true,
  outfile: "extension/sidepanel.js",
  format: "iife",
  platform: "browser",
  target: "chrome116",
  minify: true,
  jsx: "automatic",
  define: {
    FUSION_API_URL: JSON.stringify(url),
    "process.env.NODE_ENV": '"production"',
  },
});
const manifest = JSON.parse(await readFile("extension/manifest.json", "utf8"));
if (url) manifest.host_permissions.push(url + "/*");
await rm("dist/extension", { recursive: true, force: true });
await mkdir("dist/extension", { recursive: true });
for (const f of [
  "sidepanel.html",
  "sidepanel.css",
  "sidepanel.js",
  "background.js",
])
  await copyFile("extension/" + f, "dist/extension/" + f);
await cp("extension/icons", "dist/extension/icons", { recursive: true });
await cp("extension/_locales", "dist/extension/_locales", { recursive: true });
const sharedCss = await postcss([tailwindcss()]).process(
  await readFile("src/app/globals.css", "utf8"),
  { from: "src/app/globals.css", to: "dist/extension/sidepanel.css" },
);
await writeFile(
  "dist/extension/sidepanel.css",
  sharedCss.css + "\n" + (await readFile("extension/sidepanel.css", "utf8")),
);
await writeFile(
  "dist/extension/manifest.json",
  JSON.stringify(manifest, null, 2) + "\n",
);
await writeFile(
  "dist/extension-build.json",
  JSON.stringify(
    { release, backend: url || null, version: manifest.version },
    null,
    2,
  ) + "\n",
);
console.log(
  release
    ? "Release folder ready for QA and packaging."
    : "Preparation folder ready; no backend configured unless supplied.",
);
