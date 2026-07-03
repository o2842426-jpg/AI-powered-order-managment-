const { assertStoreScope } = require("../stores/storeScope");
const { insertSalesExample } = require("../salesTraining/salesExamples.repository");

const VALID_CATEGORIES = new Set([
  "objection",
  "greeting",
  "closing",
  "discovery",
  "price",
  "hesitant",
  "general",
]);

function normalizeCategory(raw) {
  const c = String(raw || "")
    .trim()
    .toLowerCase()
    .slice(0, 40);
  if (!c) return null;
  if (VALID_CATEGORIES.has(c)) return c;
  if (/^[a-z][a-z0-9_]{1,30}$/.test(c)) return c;
  return null;
}

/**
 * POST /api/dashboard/settings/examples
 * Body: { store_id?: number, category, user_input, ideal_response }
 */
function createSalesExample(req, res) {
  try {
    const storeId = Number(req.body?.store_id ?? req.user?.store_id);
    if (Number.isNaN(storeId) || storeId <= 0) {
      return res.status(400).json({ message: "store_id must be a valid positive number." });
    }
    if (!assertStoreScope(req, res, storeId)) return;

    const category = normalizeCategory(req.body?.category);
    if (!category) {
      return res.status(400).json({
        message:
          "category is required (e.g. objection, greeting, closing, discovery, price, hesitant).",
      });
    }

    const userInput = String(req.body?.user_input ?? "").trim();
    const idealResponse = String(req.body?.ideal_response ?? "").trim();

    if (!userInput) {
      return res.status(400).json({ message: "user_input is required." });
    }
    if (!idealResponse) {
      return res.status(400).json({ message: "ideal_response is required." });
    }
    if (userInput.length > 500) {
      return res.status(400).json({ message: "user_input must be at most 500 characters." });
    }
    if (idealResponse.length > 2000) {
      return res.status(400).json({
        message: "ideal_response must be at most 2000 characters.",
      });
    }

    const row = insertSalesExample({
      storeId,
      category,
      userInput,
      idealResponse,
    });

    return res.status(201).json({
      message: "Sales training example saved.",
      data: row,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Could not save sales training example.",
      error: error.message,
    });
  }
}

module.exports = {
  createSalesExample,
};
