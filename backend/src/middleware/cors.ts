import cors from 'cors';

export function corsMiddleware() {
  const rawOrigins = process.env.CORS_ORIGINS ?? '';
  const methods = process.env.CORS_METHODS ?? 'GET,POST,PUT,PATCH,DELETE,OPTIONS';
  const allowedHeaders = process.env.CORS_HEADERS ?? 'Content-Type,Authorization';

  let origin: cors.CorsOptions['origin'];

  if (!rawOrigins) {
    // No origins configured — deny all cross-origin requests (safe default)
    origin = false;
  } else if (rawOrigins === '*') {
    // Wildcard '*' is incompatible with credentials: true (browser rejects the response).
    // Reflect the request origin so cookies work while still permitting all origins in dev.
    origin = (requestOrigin, callback) => callback(null, requestOrigin ?? true);
  } else {
    const allowList = rawOrigins.split(',').map((o) => o.trim());
    origin = (requestOrigin, callback) => {
      if (!requestOrigin || allowList.includes(requestOrigin)) {
        callback(null, requestOrigin ?? true);
      } else {
        callback(null, false);
      }
    };
  }

  return cors({ origin, methods, allowedHeaders, credentials: true });
}
