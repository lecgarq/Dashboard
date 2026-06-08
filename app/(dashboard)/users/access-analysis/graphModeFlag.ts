/** Build-time flag: 3D physics graph is parked behind NEXT_PUBLIC_ACC_3D_GRAPH=1 (spec §7). */
export function is3dGraphEnabled(flag: string | undefined): boolean {
  return flag === "1";
}

/** Runtime read of the public env flag (statically inlined by Next at build). */
export const ACC_3D_GRAPH_ENABLED = is3dGraphEnabled(process.env.NEXT_PUBLIC_ACC_3D_GRAPH);
