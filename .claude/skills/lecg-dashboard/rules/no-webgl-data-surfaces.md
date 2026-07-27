---
name: no-webgl-data-surfaces
verification_command: "rg -l \"@react-three/fiber|@react-three/drei|from ['\\\"]three\" app/(dashboard)/access-analysis/ app/(dashboard)/template-mty/ --include '*.tsx' --include '*.ts' | grep -v '.test.' && echo 'FAIL: WebGL import on data surface' && exit 1 || true"
---

# No WebGL on Data Surfaces

Data-facing pages (`/access-analysis`, `/template-mty`, and any future
analytics surface) must not import Three.js, React Three Fiber, or any WebGL
library.

## Rule

Real 3D (R3F/Three.js) is confined to:
- `/users` header accent
- `/forma-proposal` background

Data surfaces must stay performant and GPU-light. If a phase plan adds WebGL
imports to `/access-analysis` or `/template-mty`, the plan is wrong unless the
user explicitly changed scope.

## Verification

```bash
rg -l "@react-three/fiber|@react-three/drei|from ['\"]three" \
  app/(dashboard)/access-analysis/ \
  app/(dashboard)/template-mty/ \
  --include '*.tsx' --include '*.ts' \
  | grep -v '.test.'
```

Any match = violation.
