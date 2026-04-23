// Web Worker that runs the ACC graph force simulation off the main thread.
// Posts: { nodes: PhysicsNode[], edges: PhysicsEdge[] }
// Returns: PhysicsNode[] with settled x/y/vx/vy.

import { runSimulation, type PhysicsNode, type PhysicsEdge } from "@/lib/acc/graphSimulation";

interface LayoutMessage {
  nodes: PhysicsNode[];
  edges: PhysicsEdge[];
}

self.onmessage = (e: MessageEvent<LayoutMessage>) => {
  const settled = runSimulation(e.data.nodes, e.data.edges);
  (self as unknown as Worker).postMessage(settled);
};
