import { EventEmitter } from "events";

export type TrelloEvent =
  | { type: "check-item-created"; timestamp: number }
  | { type: "check-item-toggled"; timestamp: number }
  | { type: "check-item-deleted"; timestamp: number }
  | { type: "card-created"; timestamp: number }
  | { type: "card-updated"; timestamp: number };

class TrelloEventEmitter extends EventEmitter {}

// Singleton scoped to the Node.js process
const trelloEvents = new TrelloEventEmitter();
trelloEvents.setMaxListeners(0);

export default trelloEvents;
