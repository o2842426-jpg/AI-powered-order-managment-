const DEFAULT_GRAPH_VERSION = "v21.0";

const OAUTH_SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_metadata",
  "pages_messaging",
  "instagram_basic",
  "instagram_manage_messages",
];

function resolveGraphApiVersion() {
  return String(process.env.META_GRAPH_API_VERSION || DEFAULT_GRAPH_VERSION).trim();
}

function resolveMetaAppId() {
  return String(process.env.META_APP_ID || "").trim();
}

function resolveMetaAppSecret() {
  return String(process.env.META_APP_SECRET || "").trim();
}

function resolveOAuthRedirectUri() {
  const explicit = String(process.env.META_OAUTH_REDIRECT_URI || "").trim();
  if (explicit) return explicit;

  const apiPublic = String(process.env.API_PUBLIC_URL || "").trim();
  if (apiPublic) {
    return `${apiPublic.replace(/\/$/, "")}/api/auth/facebook/callback`;
  }

  const port = String(process.env.PORT || "4000").trim();
  return `http://127.0.0.1:${port}/api/auth/facebook/callback`;
}

function resolveFrontendSettingsUrl(query = {}) {
  const base = String(process.env.FRONTEND_URL || "http://localhost:5173").replace(
    /\/$/,
    ""
  );
  const url = new URL(`${base}/`);
  url.searchParams.set("owner", "settings");
  for (const [key, value] of Object.entries(query)) {
    if (value != null && String(value).trim() !== "") {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

function assertMetaOAuthConfig() {
  const appId = resolveMetaAppId();
  const appSecret = resolveMetaAppSecret();
  if (!appId || !appSecret) {
    throw new Error("META_APP_ID and META_APP_SECRET must be configured for Facebook OAuth.");
  }
  return { appId, appSecret };
}

/**
 * @param {string} state
 * @returns {string}
 */
function buildFacebookAuthorizeUrl(state) {
  const { appId } = assertMetaOAuthConfig();
  const version = resolveGraphApiVersion();
  const redirectUri = resolveOAuthRedirectUri();
  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    state,
    scope: OAUTH_SCOPES.join(","),
    response_type: "code",
  });

  return `https://www.facebook.com/${version}/dialog/oauth?${params.toString()}`;
}

/**
 * @param {string} pathWithQuery
 * @returns {Promise<object>}
 */
async function graphGet(pathWithQuery) {
  const version = resolveGraphApiVersion();
  const url = pathWithQuery.startsWith("http")
    ? pathWithQuery
    : `https://graph.facebook.com/${version}/${pathWithQuery.replace(/^\//, "")}`;

  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      data?.error?.message ||
      data?.error?.error_user_msg ||
      `graph_http_${res.status}`;
    throw new Error(String(msg));
  }
  return data;
}

/**
 * @param {string} code
 * @returns {Promise<{ access_token: string, token_type?: string, expires_in?: number }>}
 */
async function exchangeCodeForUserAccessToken(code) {
  const { appId, appSecret } = assertMetaOAuthConfig();
  const redirectUri = resolveOAuthRedirectUri();
  const params = new URLSearchParams({
    client_id: appId,
    client_secret: appSecret,
    redirect_uri: redirectUri,
    code: String(code),
  });

  return graphGet(`oauth/access_token?${params.toString()}`);
}

/**
 * @param {string} shortLivedUserToken
 * @returns {Promise<{ access_token: string, token_type?: string, expires_in?: number }>}
 */
async function exchangeForLongLivedUserToken(shortLivedUserToken) {
  const { appId, appSecret } = assertMetaOAuthConfig();
  const params = new URLSearchParams({
    grant_type: "fb_exchange_token",
    client_id: appId,
    client_secret: appSecret,
    fb_exchange_token: String(shortLivedUserToken),
  });

  return graphGet(`oauth/access_token?${params.toString()}`);
}

/**
 * @param {string} userAccessToken
 * @returns {Promise<Array<{
 *   id: string,
 *   name: string,
 *   access_token: string,
 *   instagram_business_account?: { id?: string, username?: string }
 * }>>}
 */
async function fetchPagesWithInstagram(userAccessToken) {
  const params = new URLSearchParams({
    fields: "id,name,access_token,instagram_business_account{id,username}",
    access_token: String(userAccessToken),
  });

  const data = await graphGet(`me/accounts?${params.toString()}`);
  return Array.isArray(data?.data) ? data.data : [];
}

/**
 * Pick the first Page that has a linked Instagram Business account.
 *
 * @param {Awaited<ReturnType<typeof fetchPagesWithInstagram>>} pages
 */
function selectPageWithInstagram(pages) {
  for (const page of pages) {
    const igId = page?.instagram_business_account?.id;
    const pageToken = page?.access_token;
    if (igId && pageToken) {
      return {
        pageId: String(page.id),
        pageName: String(page.name || "Instagram Page"),
        pageAccessToken: String(pageToken),
        instagramId: String(igId),
        instagramUsername:
          page.instagram_business_account?.username != null
            ? String(page.instagram_business_account.username)
            : null,
      };
    }
  }
  return null;
}

module.exports = {
  OAUTH_SCOPES,
  resolveOAuthRedirectUri,
  resolveFrontendSettingsUrl,
  buildFacebookAuthorizeUrl,
  exchangeCodeForUserAccessToken,
  exchangeForLongLivedUserToken,
  fetchPagesWithInstagram,
  selectPageWithInstagram,
};
