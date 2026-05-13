function getAdminApiKey() {
  const k = process.env.ADMIN_API_KEY;
  if (k == null || String(k).trim() === "") return null;
  return String(k).trim();
}

function isAdminApiConfigured() {
  return Boolean(getAdminApiKey());
}

module.exports = { getAdminApiKey, isAdminApiConfigured };
