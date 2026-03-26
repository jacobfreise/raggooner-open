import { setGlobalOptions } from "firebase-functions";

// db.ts calls initializeApp() at import time — must be the first side-effect.
import "./db";

setGlobalOptions({ maxInstances: 10 });

export * from "./auth/roles";
export * from "./tournaments/sync";
export * from "./tournaments/signup";
export * from "./gameplay/captain";
export * from "./gameplay/races";
export * from "./integrations/discord";
export * from "./maintenance/backup";
