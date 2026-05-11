const crypto = require("crypto");
const { getAuthSecret } = require("./auth.controller");

function verifyToken(token) {
  const [encodedPayload, signature] = String(token || "").split(".");
  if (!encodedPayload || !signature) return null;

  const expectedSignature = crypto
    .createHmac("sha256", getAuthSecret())
    .update(encodedPayload)
    .digest("base64url");

  const provided = Buffer.from(signature);
  const expected = Buffer.from(expectedSignature);
  if (
    provided.length !== expected.length ||
    !crypto.timingSafeEqual(provided, expected)
  ) {
    return null;
  }

  const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString());
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
    return null;
  }

  return payload;
}

function requireAuth(req, res, next) {
  const header = req.get("authorization") || "";
  const [scheme, token] = header.split(" ");

  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ message: "Authentication required." });
  }

  try {
    const payload = verifyToken(token);
    if (!payload) {
      return res.status(401).json({ message: "Invalid or expired token." });
    }

    req.user = {
      id: payload.sub,
      store_id: payload.store_id,
      role: payload.role,
    };
    return next();
  } catch (_error) {
    return res.status(401).json({ message: "Invalid token." });
  }
}

module.exports = {
  requireAuth,
  verifyToken,
};
