import { readFileSync } from "node:fs";
import { join } from "node:path";

function loadToken() {
  for (const key of ["TRACKER_GH_TOKEN", "GH_TOKEN", "GITHUB_TOKEN", "GH_PAT"]) {
    const v = String(process.env[key] || "").trim();
    if (v) return v;
  }
  try {
    return readFileSync(join(process.cwd(), "data/tracker-vault.token"), "utf8").trim();
  } catch {
    return "";
  }
}

/** GitHub token for Tracker-Vault. Never hardcode. File or env only. */
export const TRACKER_VAULT_TOKEN = loadToken();
