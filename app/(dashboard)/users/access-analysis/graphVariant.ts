/**
 * graphVariant.ts — pure flag → variant decision for /users/spatial-graph.
 * Default is the 3D physics shell. The embedding projector is opt-in only
 * (NEXT_PUBLIC_ACC_PERSON_GRAPH=1) and retained as a reference, not the default.
 */
export type GraphVariant = "physics" | "projector";

export function chooseGraphVariant(flag: string | undefined): GraphVariant {
  return flag === "1" ? "projector" : "physics";
}
