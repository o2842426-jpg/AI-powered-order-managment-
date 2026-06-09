const { isEncryptionConfigured, encryptChannelToken } = require("./channelTokenCrypto");
const {
  createFacebookOAuthState,
  verifyFacebookOAuthState,
  STATE_TTL_SECONDS,
} = require("./facebook.oauth.state");
const {
  buildFacebookAuthorizeUrl,
  exchangeCodeForUserAccessToken,
  exchangeForLongLivedUserToken,
  fetchPagesWithInstagram,
  selectPageWithInstagram,
  resolveFrontendSettingsUrl,
} = require("./facebook.oauth.service");
const { upsertInstagramChannelConnection } = require("./channel.repository");

/**
 * POST /api/auth/facebook/init
 * Requires Bearer JWT — returns Meta OAuth authorize URL with signed state.
 */
function initFacebookOAuth(req, res) {
  try {
    if (!req.user?.store_id || !req.user?.id) {
      return res.status(401).json({ message: "Authentication required." });
    }

    if (!isEncryptionConfigured()) {
      return res.status(503).json({
        message: "CHANNEL_TOKEN_ENCRYPTION_KEY is not configured on the server.",
        code: "ENCRYPTION_NOT_CONFIGURED",
      });
    }

    const state = createFacebookOAuthState({
      storeId: req.user.store_id,
      userId: req.user.id,
    });

    const authorizeUrl = buildFacebookAuthorizeUrl(state);

    return res.status(200).json({
      data: {
        authorize_url: authorizeUrl,
        state_expires_in: STATE_TTL_SECONDS,
      },
    });
  } catch (error) {
    console.error("[facebook-oauth] init failed:", error?.message || error);
    return res.status(500).json({
      message: "Could not start Facebook OAuth.",
      error: error.message,
    });
  }
}

/**
 * GET /api/auth/facebook/callback?code=&state=
 * Public Meta redirect — validates state, stores encrypted Page token, redirects to frontend.
 */
async function facebookOAuthCallback(req, res) {
  const fail = (reason, message) => {
    console.warn(`[facebook-oauth] callback failed (${reason}):`, message);
    return res.redirect(
      resolveFrontendSettingsUrl({
        instagram: "error",
        reason,
      })
    );
  };

  try {
    const oauthError = req.query.error != null ? String(req.query.error) : "";
    if (oauthError) {
      const desc =
        req.query.error_description != null
          ? String(req.query.error_description)
          : oauthError;
      return fail("oauth_denied", desc);
    }

    const code = req.query.code != null ? String(req.query.code).trim() : "";
    const stateRaw = req.query.state != null ? String(req.query.state) : "";
    if (!code) {
      return fail("missing_code", "Authorization code missing.");
    }

    const state = verifyFacebookOAuthState(stateRaw);
    if (!state) {
      return fail("invalid_state", "Invalid or expired OAuth state.");
    }

    if (!isEncryptionConfigured()) {
      return fail("encryption_not_configured", "Server encryption key missing.");
    }

    const shortTokenResult = await exchangeCodeForUserAccessToken(code);
    const shortUserToken = String(shortTokenResult?.access_token || "").trim();
    if (!shortUserToken) {
      return fail("token_exchange_failed", "Could not obtain user access token.");
    }

    const longTokenResult = await exchangeForLongLivedUserToken(shortUserToken);
    const longUserToken = String(
      longTokenResult?.access_token || shortUserToken
    ).trim();

    const pages = await fetchPagesWithInstagram(longUserToken);
    const selected = selectPageWithInstagram(pages);
    if (!selected) {
      return fail(
        "no_ig_account",
        "No Facebook Page with a linked Instagram Business account was found."
      );
    }

    const accessTokenEnc = encryptChannelToken(selected.pageAccessToken);

    let tokenExpiresAt = null;
    if (longTokenResult?.expires_in != null && Number.isFinite(Number(longTokenResult.expires_in))) {
      tokenExpiresAt = new Date(
        Date.now() + Number(longTokenResult.expires_in) * 1000
      ).toISOString();
    }

    upsertInstagramChannelConnection({
      storeId: state.store_id,
      platformPageId: selected.pageId,
      platformInstagramId: selected.instagramId,
      pageName: selected.pageName,
      accessTokenEnc,
      tokenExpiresAt,
      webhookSubscribed: 1,
      metadata: {
        instagram_username: selected.instagramUsername,
        connected_by_user_id: state.user_id,
        oauth_at: new Date().toISOString(),
      },
    });

    console.info(
      `[facebook-oauth] connected store=${state.store_id} page=${selected.pageId} ig=${selected.instagramId}`
    );

    return res.redirect(
      resolveFrontendSettingsUrl({
        instagram: "connected",
      })
    );
  } catch (error) {
    return fail("server_error", error?.message || String(error));
  }
}

module.exports = {
  initFacebookOAuth,
  facebookOAuthCallback,
};
