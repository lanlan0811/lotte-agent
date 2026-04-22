const fs = require("fs");
const path = require("path");

const utilsPath = path.join(__dirname, "node_modules", "next", "dist", "build", "utils.js");

if (!fs.existsSync(utilsPath)) {
  console.log("[patch-next] utils.js not found, skipping patch");
  process.exit(0);
}

let content = fs.readFileSync(utilsPath, "utf-8");
let patched = false;

const patch1 = "appConfig: {}";
const replace1 = "appConfig: { revalidate: 0 }";

if (content.includes(patch1) && !content.includes("appConfig: { revalidate: 0 }")) {
  content = content.replace(
    /if \(page === _constants1\.UNDERSCORE_GLOBAL_ERROR_ROUTE\) \{[\s\S]*?appConfig: \{\}/,
    (match) => match.replace("appConfig: {}", replace1)
  );
  patched = true;
}

const patch2 = "originalAppPath === _constants1.UNDERSCORE_GLOBAL_ERROR_ROUTE_ENTRY ? {}";
const replace2 = "originalAppPath === _constants1.UNDERSCORE_GLOBAL_ERROR_ROUTE_ENTRY ? { revalidate: 0 }";

if (content.includes(patch2)) {
  content = content.replace(patch2, replace2);
  patched = true;
}

if (patched) {
  fs.writeFileSync(utilsPath, content, "utf-8");
  console.log("[patch-next] Successfully patched Next.js global-error bug (revalidate: 0)");
} else {
  console.log("[patch-next] Patch already applied or not needed");
}
