# LOD Query Encoder Contract

The dashboard expects a separate SigLIP-compatible text embedding service for LOD search.

## Endpoint

`POST /embed-query`

## Request

```json
{
  "query": "double door family"
}
```

Optional header:

```text
Authorization: Bearer <LOD_QUERY_ENCODER_API_KEY>
```

## Response

```json
{
  "vector": [0.123, -0.456, "... 768 floats total ..."],
  "model": "siglip-query-v1"
}
```

## Requirements

- `vector` must be exactly 768 floats.
- The text encoder must be compatible with the SigLIP image vectors stored in `LodEmbedding.pgvector`.
- The service should be stateless and safe to call from the dashboard runtime.

## Dashboard Environment

```env
LOD_QUERY_ENCODER_URL=http://localhost:8091/embed-query
LOD_QUERY_ENCODER_API_KEY=
LOD_QUERY_ENCODER_TIMEOUT_MS=15000
LOD_QUERY_ENCODER_VERSION=siglip-query-v1
LOD_QUERY_ENCODER_DEVICE=cpu
```

## Local runner

```bash
python services/lod-query-encoder/server.py
```

The dashboard dev stack also starts this service automatically.

Use `LOD_QUERY_ENCODER_DEVICE=cpu` on workstations where the installed PyTorch CUDA build does not support the local GPU yet. The service can fall back automatically, but pinning CPU avoids the first-request demotion cost.
