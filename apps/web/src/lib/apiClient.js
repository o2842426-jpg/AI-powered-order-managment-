import { apiUrl } from "./api";
import { authFetch } from "./auth";
import { adminFetch } from "./adminApi";
import {
  ApiError,
  API_ERROR_CODES,
  createApiErrorFromResponse,
  throwIfNotOk,
  withNetworkError,
} from "./apiErrors";

async function readJsonBody(res) {
  return res.json().catch(() => ({}));
}

/**
 * Authenticated JSON request with specific error messages.
 * @param {string} path
 * @param {RequestInit} [options]
 * @param {{ fallback?: string, allowPlanRequired?: boolean }} [opts]
 */
export async function authJson(path, options = {}, opts = {}) {
  return withNetworkError(async () => {
    const res = await authFetch(path, options);
    const body = await readJsonBody(res);

    if (
      opts.allowPlanRequired !== false &&
      res.status === 403 &&
      body?.code === API_ERROR_CODES.PLAN_REQUIRED
    ) {
      throw new ApiError({
        userMessage: "",
        code: API_ERROR_CODES.PLAN_REQUIRED,
        status: 403,
        body,
      });
    }

    throwIfNotOk(res, body, { fallback: opts.fallback });
    return body;
  });
}

/**
 * Public (unauthenticated) JSON request.
 * @param {string} path
 * @param {RequestInit} [options]
 * @param {{ fallback?: string }} [opts]
 */
export async function publicJson(path, options = {}, opts = {}) {
  return withNetworkError(async () => {
    const res = await fetch(apiUrl(path), options);
    const body = await readJsonBody(res);
    throwIfNotOk(res, body, { fallback: opts.fallback });
    return body;
  });
}

/**
 * Super-admin JSON request.
 * @param {string} path
 * @param {RequestInit} [options]
 * @param {{ fallback?: string }} [opts]
 */
export async function adminJson(path, options = {}, opts = {}) {
  return withNetworkError(async () => {
    const res = await adminFetch(path, options);
    const body = await readJsonBody(res);
    throwIfNotOk(res, body, { fallback: opts.fallback });
    return body;
  });
}

export { ApiError, API_ERROR_CODES, createApiErrorFromResponse, throwIfNotOk };
