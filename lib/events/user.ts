
import { EventEmitter } from "events";

class UserEventEmitter extends EventEmitter {}

// Singleton scoped to the Node.js process
const userEvents = new UserEventEmitter();
userEvents.setMaxListeners(0);

export default userEvents;
