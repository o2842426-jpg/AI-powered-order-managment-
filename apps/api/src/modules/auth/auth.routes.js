const express = require("express");
const {
  register,
  login,
  createStoreWithOwner,
  getCurrentAuthSession,
} = require("./auth.controller");
const { requireAuth } = require("./auth.middleware");
const {
  initFacebookOAuth,
  facebookOAuthCallback,
} = require("../channels/facebook.auth.controller");

const authRouter = express.Router();

authRouter.post("/register", register);
authRouter.post("/login", login);
authRouter.post("/create-store", createStoreWithOwner);
authRouter.get("/me", requireAuth, getCurrentAuthSession);

authRouter.post("/facebook/init", requireAuth, initFacebookOAuth);
authRouter.get("/facebook/callback", facebookOAuthCallback);

module.exports = { authRouter };
