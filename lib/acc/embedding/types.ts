export interface PersonFeatureBag { personId: string; name: string; features: Map<string, number>; } // feature key -> raw tf
export interface EmbeddedPerson { personId: string; name: string; idx: number[]; val: number[]; }     // sparse, L2-normalized
export interface Embedding { persons: EmbeddedPerson[]; featureKeys: string[]; }                       // featureKeys[i] = key for column i
export interface SimEdge { a: number; b: number; score: number; }                                      // a<b, person array indices
export interface TieredEdge { a: number; b: number; tier: 1 | 2 | 3; reason: string; }
export interface Clustering { k: number; assign: Int32Array; }
export interface LayoutNode { id: string; name: string; x: number; y: number; cluster: number; size: number; }
export interface LayoutNode3D { id: string; name: string; x: number; y: number; z: number; cluster: number; size: number; } // static projector positions
export interface ClusterMeta { idx: number; label: string; color: string; count: number; }
export interface PersonGraphSnapshot { k: number; dim: number; personCount: number; nodes: LayoutNode[]; nodes3d: LayoutNode3D[]; edges: TieredEdge[]; clusters: ClusterMeta[]; }
