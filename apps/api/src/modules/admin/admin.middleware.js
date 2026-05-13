const crypto = require("crypto");
const { getAdminApiKey } = require("./admin.config");

function requireAdminApiKey(req, res, next) {
  const configured = getAdminApiKey();
  if (!configured) {
    return res.status(503).json({ message: "Admin API is not configured (set ADMIN_API_KEY)." });
  }

  const header = req.headers["x-admin-key"];
  if (header == null || String(header).trim() === "") {
    return res.status(401).json({ message: "Missing X-Admin-Key header." });
  }

  const a = Buffer.from(configured, "utf8");
  const b = Buffer.from(String(header).trim(), "utf8");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ message: "Invalid admin key." });
  }

  next();
}

module.exports = { requireAdminApiKey };
