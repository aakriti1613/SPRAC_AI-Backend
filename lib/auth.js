// Platform login (the person who operates the scaffolder, not users of generated
// portals).
//
// - Credentials come from server environment variables, never from browser code:
//     PLATFORM_ADMIN_EMAIL, PLATFORM_ADMIN_PASSWORD
// - A successful login returns a signed, expiring token (HMAC-SHA256 with AUTH_SECRET).
// - requireAuth() protects every /api route except the public ones.
//
// No extra dependencies: Node's crypto only.
import crypto from "node:crypto";

const DEFAULT_TTL_SECONDS = 12 * 60 * 60; // 12 hours

const b64url = (input) => Buffer.from(input).toString("base64url");

function sha256(value) {
  return crypto.createHash("sha256").update(String(value)).digest();
}

/** Constant-time string comparison (hashing first makes lengths equal). */
function safeEqual(a, b) {
  return crypto.timingSafeEqual(sha256(a), sha256(b));
}

export function createAuth({
  adminEmail = "",
  adminPassword = "",
  secret = "",
  ttlSeconds = DEFAULT_TTL_SECONDS,
  now = () => Date.now(),
} = {}) {
  const configured = Boolean(adminEmail && adminPassword);
  const signingKey = secret || crypto.randomBytes(32).toString("hex");
  const usingEphemeralSecret = !secret;

  function sign(payloadPart) {
    return crypto.createHmac("sha256", signingKey).update(payloadPart).digest("base64url");
  }

  function issueToken(email) {
    const iat = Math.floor(now() / 1000);
    const payload = { sub: "platform-admin", email, iat, exp: iat + ttlSeconds };
    const payloadPart = b64url(JSON.stringify(payload));
    return { token: `${payloadPart}.${sign(payloadPart)}`, expiresAt: new Date(payload.exp * 1000).toISOString() };
  }

  /** Returns the token payload, or null if the token is missing/forged/expired. */
  function verifyToken(token) {
    if (typeof token !== "string") return null;
    const [payloadPart, signature, extra] = token.split(".");
    if (!payloadPart || !signature || extra !== undefined) return null;
    if (!safeEqual(signature, sign(payloadPart))) return null;
    let payload;
    try {
      payload = JSON.parse(Buffer.from(payloadPart, "base64url").toString("utf8"));
    } catch {
      return null;
    }
    if (!payload || payload.sub !== "platform-admin") return null;
    if (typeof payload.exp !== "number" || payload.exp * 1000 <= now()) return null;
    return payload;
  }

  /** Returns { ok, status, token?, expiresAt?, error? } */
  function login(email, password) {
    if (!configured) {
      return {
        ok: false,
        status: 503,
        error: "Platform login is not configured on the server. Set PLATFORM_ADMIN_EMAIL and PLATFORM_ADMIN_PASSWORD.",
      };
    }
    const emailOk = safeEqual(String(email || "").trim().toLowerCase(), adminEmail.trim().toLowerCase());
    const passwordOk = safeEqual(String(password || ""), adminPassword);
    if (!emailOk || !passwordOk) {
      return { ok: false, status: 401, error: "Invalid email or password" };
    }
    return { ok: true, status: 200, ...issueToken(adminEmail.trim().toLowerCase()) };
  }

  function tokenFromRequest(req) {
    const header = req.headers?.authorization || "";
    const match = /^Bearer\s+(.+)$/i.exec(header);
    return match ? match[1].trim() : "";
  }

  /** Express middleware. `publicPaths` are matched against req.path inside the mount point. */
  function requireAuth({ publicPaths = [] } = {}) {
    const open = new Set(publicPaths);
    return (req, res, next) => {
      if (req.method === "OPTIONS" || open.has(req.path)) return next();
      const payload = verifyToken(tokenFromRequest(req));
      if (!payload) {
        return res.status(401).json({ success: false, error: "Not signed in or session expired. Please log in again." });
      }
      req.platformUser = payload;
      return next();
    };
  }

  return { configured, usingEphemeralSecret, login, verifyToken, requireAuth, tokenFromRequest };
}
