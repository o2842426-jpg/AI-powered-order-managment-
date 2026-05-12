const crypto = require("crypto");
const { db } = require("../../db/client");

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

function createAuthResponse(user) {
  const storeRow = db
    .prepare("SELECT slug FROM stores WHERE id = ?")
    .get(user.store_id);
  const store_slug = storeRow?.slug ? String(storeRow.slug) : null;

  const payload = {
    sub: user.id,
    store_id: user.store_id,
    role: user.role,
    exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS,
  };

  return {
    token: signPayload(payload),
    user: {
      id: user.id,
      store_id: user.store_id,
      name: user.name,
      email: user.email,
      role: user.role,
      store_slug,
    },
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

    const user = db
      .prepare("SELECT id, store_id, name, email, role FROM users WHERE id = ?")
      .get(result.lastInsertRowid);

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

    let newUserId;

    const runTx = db.transaction(() => {
      const storeResult = db
        .prepare(
          `
            INSERT INTO stores (name, slug, phone, delivery_info)
            VALUES (?, ?, ?, ?)
          `
        )
        .run(name, slug, phoneStr || null, delivery);

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

    const user = db
      .prepare(
        "SELECT id, store_id, name, email, role FROM users WHERE id = ?"
      )
      .get(newUserId);

    if (!user) {
      return res.status(500).json({ message: "Store created but user lookup failed." });
    }

    return res.status(201).json({
      data: {
        ...createAuthResponse(user),
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

    return res.status(200).json({ data: createAuthResponse(user) });
  } catch (error) {
    return res.status(500).json({
      message: "Could not login.",
      error: error.message,
    });
  }
}

module.exports = {
  register,
  login,
  createStoreWithOwner,
  getAuthSecret,
};
