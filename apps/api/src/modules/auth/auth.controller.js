const crypto = require("crypto");
const { db } = require("../../db/client");
const { TRIAL_DAYS } = require("../billing/billing.access");
const {
  normalizeStoreVertical,
  normalizeReplyDialect,
  normalizeDefaultPayment,
  buildSeedAiPrompt,
} = require("../stores/storeOnboarding.constants");

const STORE_CURRENCY_CODES = new Set(["SAR", "IQD", "USD"]);

function normalizeCreateCurrency(raw) {
  const c = String(raw ?? "IQD")
    .trim()
    .toUpperCase();
  return STORE_CURRENCY_CODES.has(c) ? c : "IQD";
}

const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7;

function getAuthSecret() {
  return process.env.AUTH_SECRET || "dev-auth-secret-change-me";
}

function base64Url(input) {
  return Buffer.from(input).toString("base64url");
}

function signPayload(payload) {
  const encodedPayload = base64Url(JSON.stringify(payload));
  const signature = crypto
    .createHmac("sha256", getAuthSecret())
    .update(encodedPayload)
    .digest("base64url");

  return `${encodedPayload}.${signature}`;
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const key = crypto.scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${key}`;
}

function verifyPassword(password, storedHash) {
  const [method, salt, key] = String(storedHash || "").split("$");
  if (method !== "scrypt" || !salt || !key) return false;

  const candidate = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(key, "hex");
  return (
    candidate.length === expected.length &&
    crypto.timingSafeEqual(candidate, expected)
  );
}

function loadUserById(userId) {
  return (
    db
      .prepare(
        `
          SELECT id, store_id, name, email, role
          FROM users
          WHERE id = ?
        `
      )
      .get(Number(userId)) || null
  );
}

function createAuthResponse(user) {
  if (!user?.id) {
    throw new Error("Cannot create auth response without a valid user.");
  }

  const storeRow = db
    .prepare("SELECT slug FROM stores WHERE id = ?")
    .get(user.store_id);
  const store_slug = storeRow?.slug ? String(storeRow.slug) : null;

  const issuedAt = Math.floor(Date.now() / 1000);
  const userRecord = {
    id: Number(user.id),
    store_id: Number(user.store_id),
    name: String(user.name || ""),
    email: String(user.email || ""),
    role: String(user.role || "owner"),
    store_slug,
  };

  const payload = {
    sub: userRecord.id,
    store_id: userRecord.store_id,
    role: userRecord.role,
    name: userRecord.name,
    email: userRecord.email,
    store_slug: userRecord.store_slug,
    iat: issuedAt,
    exp: issuedAt + TOKEN_TTL_SECONDS,
  };

  return {
    token: signPayload(payload),
    user: userRecord,
  };
}

function register(req, res) {
  try {
    const { store_id, name, email, password } = req.body;
    const storeId = Number(store_id);

    if (Number.isNaN(storeId) || storeId <= 0) {
      return res.status(400).json({ message: "store_id is required." });
    }
    if (!name || !String(name).trim()) {
      return res.status(400).json({ message: "name is required." });
    }
    if (!email || !String(email).trim()) {
      return res.status(400).json({ message: "email is required." });
    }
    if (!password || String(password).length < 6) {
      return res.status(400).json({
        message: "password must be at least 6 characters.",
      });
    }

    const store = db.prepare("SELECT id FROM stores WHERE id = ?").get(storeId);
    if (!store) {
      return res.status(400).json({ message: "Store does not exist." });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const existingUser = db
      .prepare("SELECT id FROM users WHERE email = ?")
      .get(normalizedEmail);

    if (existingUser) {
      return res.status(409).json({ message: "Email already registered." });
    }

    const result = db
      .prepare(
        `
          INSERT INTO users (store_id, name, email, password_hash, role)
          VALUES (?, ?, ?, ?, 'owner')
        `
      )
      .run(
        storeId,
        String(name).trim(),
        normalizedEmail,
        hashPassword(String(password))
      );

    const user = loadUserById(result.lastInsertRowid);
    if (!user) {
      return res.status(500).json({ message: "User created but lookup failed." });
    }

    return res.status(201).json({ data: createAuthResponse(user) });
  } catch (error) {
    return res.status(500).json({
      message: "Could not register owner.",
      error: error.message,
    });
  }
}

function normalizeStoreSlug(input) {
  let s = String(input || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
  while (s.includes("--")) {
    s = s.replace(/--/g, "-");
  }
  s = s.replace(/^-+|-+$/g, "");
  return s.slice(0, 48);
}

function slugFromStoreName(name) {
  const base = String(name || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim();
  let s = normalizeStoreSlug(base.replace(/\s+/g, "-"));
  if (s.length >= 3) return s;
  return `store-${crypto.randomBytes(4).toString("hex")}`;
}

/**
 * إنشاء متجر جديد + أول مستخدم مالك (تسجيل ذاتي).
 */
function createStoreWithOwner(req, res) {
  try {
    const {
      store_name,
      slug: slugInput,
      phone,
      delivery_info,
      policy_text,
      currency_code,
      store_vertical,
      reply_dialect,
      default_payment,
      sell_summary,
      owner_name,
      email,
      password,
    } = req.body;

    const name = String(store_name || "").trim();
    if (!name || name.length < 2) {
      return res.status(400).json({
        message: "store_name is required (at least 2 characters).",
      });
    }

    let slug = normalizeStoreSlug(slugInput);
    if (!slug) {
      slug = slugFromStoreName(name);
    }
    if (!slug || slug.length < 3) {
      slug = `store-${crypto.randomBytes(4).toString("hex")}`;
    }
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      return res.status(400).json({
        message:
          "slug may only contain lowercase English letters, digits, and single hyphens between words.",
      });
    }

    const userChoseSlug = String(slugInput || "").trim().length > 0;
    if (userChoseSlug) {
      const taken = db.prepare("SELECT id FROM stores WHERE slug = ?").get(slug);
      if (taken) {
        return res.status(409).json({
          message: "This store URL (slug) is already taken. Choose another.",
        });
      }
    } else {
      let guard = 0;
      while (db.prepare("SELECT id FROM stores WHERE slug = ?").get(slug)) {
        guard += 1;
        if (guard > 12) {
          return res.status(409).json({
            message: "Could not allocate a unique store URL. Try again in a moment.",
          });
        }
        slug = `store-${crypto.randomBytes(4).toString("hex")}`;
      }
    }

    const normalizedEmail = String(email || "").trim().toLowerCase();
    if (!normalizedEmail || !normalizedEmail.includes("@")) {
      return res.status(400).json({ message: "A valid email is required." });
    }

    const existingUser = db
      .prepare("SELECT id FROM users WHERE email = ?")
      .get(normalizedEmail);
    if (existingUser) {
      return res.status(409).json({ message: "Email already registered." });
    }

    if (!password || String(password).length < 6) {
      return res.status(400).json({
        message: "password must be at least 6 characters.",
      });
    }

    const owner = String(owner_name || "").trim();
    if (!owner) {
      return res.status(400).json({ message: "owner_name is required." });
    }

    const phoneStr = phone != null ? String(phone).trim() : "";
    const delivery =
      delivery_info != null && String(delivery_info).trim()
        ? String(delivery_info).trim()
        : null;
    const policy =
      policy_text != null && String(policy_text).trim()
        ? String(policy_text).trim()
        : null;

    const vertical = normalizeStoreVertical(store_vertical);
    if (!vertical) {
      return res.status(400).json({
        message: "store_vertical is required (clothing, electronics, beauty, home, real_estate, food, other).",
      });
    }

    const dialect = normalizeReplyDialect(reply_dialect) || "iraqi";
    const payment = normalizeDefaultPayment(default_payment) || "cod";
    const sellSummary =
      sell_summary != null && String(sell_summary).trim()
        ? String(sell_summary).trim().slice(0, 280)
        : null;
    const currency = normalizeCreateCurrency(currency_code);
    const seededPrompt = buildSeedAiPrompt(sellSummary, vertical);

    let newUserId;

    const trialStartedAt = new Date().toISOString();
    const trialEndsAt = new Date(
      Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000
    ).toISOString();

    const runTx = db.transaction(() => {
      const storeResult = db
        .prepare(
          `
            INSERT INTO stores (
              name, slug, phone, delivery_info, policy_text,
              currency_code, store_vertical, reply_dialect, default_payment,
              sell_summary, ai_prompt,
              subscription_status, trial_started_at, trial_ends_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'trial', ?, ?)
          `
        )
        .run(
          name,
          slug,
          phoneStr || null,
          delivery,
          policy,
          currency,
          vertical,
          dialect,
          payment,
          sellSummary,
          seededPrompt,
          trialStartedAt,
          trialEndsAt
        );

      const storeId = Number(storeResult.lastInsertRowid);
      const userResult = db
        .prepare(
          `
            INSERT INTO users (store_id, name, email, password_hash, role)
            VALUES (?, ?, ?, ?, 'owner')
          `
        )
        .run(
          storeId,
          owner,
          normalizedEmail,
          hashPassword(String(password))
        );

      newUserId = Number(userResult.lastInsertRowid);
    });

    runTx();

    const user = loadUserById(newUserId);
    if (!user) {
      return res.status(500).json({ message: "Store created but user lookup failed." });
    }

    const auth = createAuthResponse(user);
    return res.status(201).json({
      data: {
        ...auth,
        store: {
          id: user.store_id,
          slug,
          name,
        },
      },
    });
  } catch (error) {
    return res.status(500).json({
      message: "Could not create store.",
      error: error.message,
    });
  }
}

function login(req, res) {
  try {
    const { email, password } = req.body;
    const normalizedEmail = String(email || "").trim().toLowerCase();

    if (!normalizedEmail || !password) {
      return res.status(400).json({
        message: "email and password are required.",
      });
    }

    const user = db
      .prepare(
        `
          SELECT id, store_id, name, email, password_hash, role
          FROM users
          WHERE email = ?
        `
      )
      .get(normalizedEmail);

    if (!user || !verifyPassword(String(password), user.password_hash)) {
      return res.status(401).json({ message: "Invalid email or password." });
    }

    const freshUser = loadUserById(user.id);
    if (!freshUser) {
      return res.status(500).json({ message: "User lookup failed after login." });
    }

    return res.status(200).json({ data: createAuthResponse(freshUser) });
  } catch (error) {
    return res.status(500).json({
      message: "Could not login.",
      error: error.message,
    });
  }
}

/**
 * GET /api/auth/me — return a fresh token + user record for the current session.
 */
function getCurrentAuthSession(req, res) {
  try {
    const freshUser = loadUserById(req.user?.id);
    if (!freshUser) {
      return res.status(404).json({ message: "User not found." });
    }

    return res.status(200).json({ data: createAuthResponse(freshUser) });
  } catch (error) {
    return res.status(500).json({
      message: "Could not refresh auth session.",
      error: error.message,
    });
  }
}

module.exports = {
  register,
  login,
  createStoreWithOwner,
  getCurrentAuthSession,
  getAuthSecret,
};
