import { EventEmitter } from "events";

export type ClashEvent =
  | {
      type: "wiki-upsert";
      projectId: string;
      wiki: {
        id: string;
        section: string;
        title: string;
        content: string;
        status: string;
        order: number;
        updatedAt: string;
      };
    }
  | {
      type: "wiki-status";
      projectId: string;
      wiki: {
        id: string;
        section: string;
        status: string;
        updatedAt: string;
      };
    }
  | {
      type: "wiki-deleted";
      projectId: string;
      section: string;
    }
  | {
      type: "wiki-list-reordered";
      projectId: string;
    }
  | {
      type: "task-created";
      projectId: string;
      task: {
        id: string;
        status: string;
        order: number;
        title: string;
        description: string | null;
        milestone: string | null;
        dueDate: string | null;
        owner: string | null;
        isBlocked: boolean;
        createdAt: string;
        updatedAt: string;
      };
    }
  | {
      type: "task-updated";
      projectId: string;
      task: {
        id: string;
        status: string;
        order: number;
        title: string;
        description: string | null;
        milestone: string | null;
        dueDate: string | null;
        owner: string | null;
        isBlocked: boolean;
        createdAt: string;
        updatedAt: string;
      };
    }
  | {
      type: "task-deleted";
      projectId: string;
      taskId: string;
    };

class ClashEventEmitter extends EventEmitter {}

// Singleton scoped to the Node.js process and reused across requests.
const clashEvents = new ClashEventEmitter();
clashEvents.setMaxListeners(0);

export default clashEvents;
