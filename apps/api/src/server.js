const dotenv = require("dotenv");
const path = require("path");

const envRoot = path.resolve(__dirname, "../../../.env");
const envApi = path.resolve(__dirname, "../.env");
dotenv.config({ path: envRoot });
dotenv.config({ path: envApi, override: true });

const { app } = require("./app");

const PORT = process.env.PORT || 4000;

if (!String(process.env.OPENAI_API_KEY || "").trim()) {
  console.warn(
    "[dm-commerce] OPENAI_API_KEY is empty or unset — chat uses the fallback reply. " +
      "Put the key in .env at the repo root or in apps/api/.env, then restart the API."
  );
}

app.listen(PORT, () => {
  console.log(`API running on http://localhost:${PORT}`);
});
