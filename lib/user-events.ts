
import { EventEmitter } from "events";

export type UserEvent =
  | {
      type: "role-updated";
      userId: string;
      role: string;
    }
  | {
      type: "module-access-updated";
      userId: string;
      modules: string[];
    }
  | {
      type: "user-blacklisted";
      userId: string;
    }
  | {
      type: "user-removed";
      userId: string;
    }
  | {
      type: "user-linked";
      userId: string;
      provider: string;
    };

class UserEventEmitter extends EventEmitter {}

// Singleton scoped to the Node.js process
const userEvents = new UserEventEmitter();
userEvents.setMaxListeners(0);

export default userEvents;
