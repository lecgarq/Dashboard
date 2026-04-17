# Architecture - LECG Dashboard

> Auto-generated entirely as Mermaid representations on 2026-04-17

## 1. Global Topology & Integrations

```mermaid
graph TD
    classDef framework fill:#0f172a,stroke:#3b82f6,stroke-width:2px,color:#f8fafc
    classDef realtime fill:#ea580c,stroke:#9a3412,stroke-width:2px,color:#fff
    classDef api fill:#2563eb,stroke:#1e3a8a,stroke-width:2px,color:#fff
    classDef data fill:#059669,stroke:#064e3b,stroke-width:2px,color:#fff
    classDef cloud fill:#7c3aed,stroke:#4c1d95,stroke-width:2px,color:#fff
    
    subgraph Core ["LECG Dashboard (Next.js 16.2)"]
        UI["React 19 Server/Client Components"]:::framework
        Pages["11 Active Domain Layouts"]:::framework
        
        subgraph Realtime ["Real-time Sync"]
            YJS["Yjs WS Server (Port 4444)"]:::realtime
            SSE["Server-Sent Events"]:::realtime
        end
        
        subgraph Backend ["tRPC API Layer"]
            TRPC["16 Domain Sub-routers"]:::api
            Zod["Zod Payload Validation"]:::api
            Auth["NextAuth 5.0 Middleware"]:::api
        end
        
        subgraph DataLayer ["Persistence Engine"]
            Prisma["Prisma ORM 7.7.0"]:::data
            DB[("PostgreSQL")]:::data
            PGV[("pgvector HNSW")]:::data
            LOD["Python lod-engine"]:::data
        end
    end
    
    subgraph ThirdParty ["External Cloud Infrastructure"]
        Trello["Trello Kanban Sync"]:::cloud
        Google["Google Workspace (Mail/Cal)"]:::cloud
        Drive["Google Drive Asset Proxy"]:::cloud
        APS["Autodesk Platform Services"]:::cloud
        UT["UploadThing S3 Bucket"]:::cloud
    end

    UI <-->|"WebSockets"| YJS
    UI <-->|"EventSource"| SSE
    Pages -->|"RSC Render"| UI
    UI <-->|"tRPC/React Query"| TRPC
    TRPC -->|"Input Guarantees"| Zod
    Auth -->|"Route Protection"| TRPC
    
    TRPC <-->|"CRUD"| Prisma
    TRPC <-->|"Semantic API"| LOD
    Prisma <-->|"Binary Driver"| DB
    Prisma <-->|"Vector Lookups"| PGV
    
    TRPC <-->|"REST"| Trello
    TRPC <-->|"OAuth2 SDK"| Google
    TRPC <-->|"Bypasses Egress"| Drive
    TRPC <-->|"Forge API"| APS
    UI <-->|"Direct Upload"| UT
```

## 2. Frontend Routing Topology

```mermaid
graph LR
    classDef route fill:#0284c7,stroke:#0369a1,stroke-width:2px,color:#fff
    classDef component fill:#475569,stroke:#334155,stroke-width:2px,color:#fff
    classDef boundary fill:#b91c1c,stroke:#991b1b,stroke-width:2px,color:#fff
    
    %% Root Layouts
    Layout["app/(dashboard)/layout.tsx"]:::route
    
    subgraph "Identity & Analytics"
        Account["/account"]:::route
        Users["/users"]:::route
        Home["/home (KPI Widget)"]:::route
    end
    
    subgraph "BIM & Visual Subsystems"
        Clash["/clash-detection"]:::route
        LOD["/lod-checker"]:::route
        Families["/families"]:::route
    end
    
    subgraph "Workflow Automation"
        Tasks["/tasks"]:::route
        TrelloRoute["/trello"]:::route
        Exam["/exam"]:::route
        Sim["/sim-automation"]:::route
    end
    
    Settings["/settings (Admin)"]:::route

    %% Resilience Wrappers
    ErrorBoundary["PanelErrorBoundary"]:::boundary
    Skeleton["PageSkeleton Suspense"]:::boundary

    Layout --> Account & Users & Home
    Layout --> Clash & LOD & Families
    Layout --> Tasks & TrelloRoute & Exam & Sim
    Layout --> Settings
    
    Tasks & Clash & LOD & Families -.->|"Wrapped securely by"| ErrorBoundary
    Tasks & Clash & LOD & Families -.->|"Suspense fallback"| Skeleton
    
    %% Key Components
    Clash --> WikiEditor["WikiEditor.tsx (tiptap)"]:::component
    LOD --> Canvas["LodGraphCanvas.tsx (framer-motion)"]:::component
```

## 3. Backend & Utility Domain Map

```mermaid
graph TD
    classDef router fill:#0d9488,stroke:#0f766e,stroke-width:2px,color:#fff
    classDef lib fill:#334155,stroke:#1e293b,stroke-width:2px,color:#fff
    
    RootRouter{{"root.ts (tRPC Base)"}}
    
    subgraph "Identity & Authorization"
        Auth["users.ts"]:::router
        Settings["settings.ts"]:::router
        AuthGuard["lib/server/google-service-auth.ts"]:::lib
    end

    subgraph "Workspace Proxies"
        Gmail["gmail.ts"]:::router
        Cal["calendar.ts"]:::router
        Chat["chat.ts"]:::router
        EvtGoogle["lib/google/*"]:::lib
    end

    subgraph "Engineering Domains"
        APS["aps-search.ts"]:::router
        LODR["lod.ts"]:::router
        Clash["clash.ts"]:::router
        EvtEvents["lib/events/*"]:::lib
    end

    subgraph "Operations"
        Trello["trello.ts"]:::router
        Tasks["tasks.ts"]:::router
        KPI["kpi.ts"]:::router
        EvtTrello["lib/trello/*"]:::lib
    end
    
    RootRouter --> Auth & Gmail & APS & Trello
    RootRouter --> Settings & Cal & LODR & Tasks
    RootRouter --> Chat & Clash & KPI
    
    Gmail & Cal & Chat -.->|"Leverages"| EvtGoogle
    APS & LODR & Clash -.->|"Dispatches"| EvtEvents
    Trello & Tasks -.->|"Interacts"| EvtTrello
```

## 4. Structural Paradigms & Conventions

```mermaid
mindmap
  root((LECG Dashboard
  Post-Sprint State))
    Security & Routing
      Explicit PUBLIC_PATHS
      Zero-trust Webhooks
      Bypassed Healthchecks
    Performance Optimization
      Proxy Google Drive Images
      pgvector PostgreSQL Lookups
      framer-motion physics
    Reliability
      Strict Zod Type Enforcement
      Panel Error Boundaries
      Skeleton CLS Prevention
    Real-Time Architecture
      Yjs WebSocket CRDTs
      React Query Hydration
      Server-Sent Event Tick
    Repository Hygiene
      Domain-isolated lib/ structures
      Zero TODO/FIXME markers
      AST-validated strict exports
```
