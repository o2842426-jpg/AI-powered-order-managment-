/**
 * Shared guard for /api/stores/:storeId/* owner routes.
 */
function assertStoreScope(req, res, storeId) {
  if (Number.isNaN(storeId) || storeId <= 0) {
    res.status(400).json({ message: "storeId must be a valid positive number." });
    return false;
  }
  if (req.user?.store_id !== storeId) {
    res.status(403).json({ message: "Forbidden for this store." });
    return false;
  }
  return true;
}

module.exports = { assertStoreScope };
