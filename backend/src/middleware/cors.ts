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
    origin = '*';
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

  return cors({ origin, methods, allowedHeaders });
}
