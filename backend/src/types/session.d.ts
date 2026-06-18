// Module augmentation for express-session: adds application-specific fields to
// SessionData so TypeScript knows req.session.userId exists and is typed.
// This file is picked up automatically because tsconfig.json includes src/**/*.d.ts.
import 'express-session';

declare module 'express-session' {
  interface SessionData {
    userId?: string;
  }
}
