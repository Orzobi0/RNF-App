const functions = require("firebase-functions");
const admin = require("firebase-admin");

const SESSION_COOKIE_NAME = "__session";
const SESSION_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

const baseCookieAttrs = [
  "Path=/",
  "HttpOnly",
  "Secure",
  "SameSite=Lax",
];

const parseCookies = (cookieHeader = "") => {
  if (!cookieHeader) return {};

  return cookieHeader
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .reduce((acc, part) => {
        const index = part.indexOf("=");
        if (index < 0) return acc;
        const key = part.slice(0, index).trim();
        const value = part.slice(index + 1).trim();
        if (!key) return acc;
        acc[key] = decodeURIComponent(value);
        return acc;
      }, {});
};

const sendJson = (res, status, payload) => {
  res.setHeader("Cache-Control", "no-store");
  return res.status(status).json(payload);
};

const setSessionCookie = (res, value, maxAgeSeconds) => {
  const attrs = [...baseCookieAttrs, `Max-Age=${maxAgeSeconds}`];
  const cookieValue = `${SESSION_COOKIE_NAME}=${value}; ${attrs.join("; ")}`;
  res.setHeader("Set-Cookie", cookieValue);
};

const clearSessionCookie = (res) => {
  const attrs = [...baseCookieAttrs, "Max-Age=0"];
  const cookieValue = `${SESSION_COOKIE_NAME}=; ${attrs.join("; ")}`;
  res.setHeader("Set-Cookie", cookieValue);
};

const extractPath = (path = "/") => {
  const noPrefix = path.startsWith("/api/") ? path.slice(4) : path;
  if (noPrefix === "/api") return "/";
  const hasTrailingSlash = noPrefix.endsWith("/") && noPrefix.length > 1;
  return hasTrailingSlash ? noPrefix.slice(0, -1) : noPrefix;
};

const sessionApi = functions.https.onRequest(async (req, res) => {
  const method = req.method;
  const path = extractPath(req.path || "/");

  try {
    if (method === "POST" && path === "/sessionLogin") {
      const idToken = req.body && req.body.idToken;
      if (!idToken || typeof idToken !== "string") {
        return sendJson(res, 400, {ok: false, code: "missing_id_token"});
      }

      await admin.auth().verifyIdToken(idToken, true);
      const sessionCookie = await admin.auth().createSessionCookie(idToken, {
        expiresIn: SESSION_MAX_AGE_MS,
      });

      const maxAgeSeconds = Math.floor(SESSION_MAX_AGE_MS / 1000);
      setSessionCookie(res, sessionCookie, maxAgeSeconds);
      return sendJson(res, 200, {ok: true});
    }

    if (method === "POST" && path === "/sessionLogout") {
      const cookies = parseCookies(req.headers.cookie || "");
      const sessionCookie = cookies[SESSION_COOKIE_NAME];

      clearSessionCookie(res);

      if (sessionCookie) {
        try {
          const decoded = await admin.auth()
              .verifySessionCookie(sessionCookie, false);
          await admin.auth().revokeRefreshTokens(decoded.uid);
        } catch (error) {
          // Ignore invalid/expired cookie on logout.
        }
      }

      return sendJson(res, 200, {ok: true});
    }

    if (method === "GET" && path === "/sessionRestore") {
      const cookies = parseCookies(req.headers.cookie || "");
      const sessionCookie = cookies[SESSION_COOKIE_NAME];

      if (!sessionCookie) {
        return sendJson(res, 401, {ok: false, code: "missing_session"});
      }

      try {
        const decoded = await admin.auth()
            .verifySessionCookie(sessionCookie, true);
        const customToken = await admin.auth().createCustomToken(decoded.uid);
        return sendJson(res, 200, {ok: true, customToken});
      } catch (error) {
        clearSessionCookie(res);
        return sendJson(res, 401, {ok: false, code: "invalid_session"});
      }
    }

    if (method === "GET" && path === "/sessionMe") {
      const cookies = parseCookies(req.headers.cookie || "");
      const sessionCookie = cookies[SESSION_COOKIE_NAME];

      if (!sessionCookie) {
        return sendJson(res, 401, {ok: false, code: "missing_session"});
      }

      try {
        const decoded = await admin.auth()
            .verifySessionCookie(sessionCookie, true);
        return sendJson(res, 200, {
          ok: true,
          uid: decoded.uid,
          email: decoded.email || null,
        });
      } catch (error) {
        clearSessionCookie(res);
        return sendJson(res, 401, {ok: false, code: "invalid_session"});
      }
    }

    return sendJson(res, 404, {ok: false, code: "not_found"});
  } catch (error) {
    console.error("[sessionApi]", method, path, error);
    return sendJson(res, 500, {ok: false, code: "internal"});
  }
});

module.exports = {
  sessionApi,
};
