# Architecture - LECG Dashboard

> A high-fidelity, completely visual map of the LECG Dashboard topology, built purely with structural flowcharts.

## 1. Global Platform Topology
*A C4-style architectural view showing how the React client, Node.js backend, Python ML inference, and external clouds physically interconnect.*

```mermaid
flowchart TB
    %% Thematic Colors & Astonishing Shapes
    classDef ui fill:#0284c7,stroke:#bae6fd,stroke-width:3px,color:#fff,rx:20,ry:20
    classDef api fill:#4f46e5,stroke:#c7d2fe,stroke-width:3px,color:#fff,rx:20,ry:20
    classDef db fill:#059669,stroke:#a7f3d0,stroke-width:3px,color:#fff,rx:20,ry:20
    classDef external fill:#7c3aed,stroke:#e9d5ff,stroke-width:3px,color:#fff,rx:20,ry:20
    classDef ai fill:#ca8a04,stroke:#fef08a,stroke-width:3px,color:#fff,rx:20,ry:20

    User((👤 Users))
    
    subgraph Frontend [🖥️ Client Presentation]
        direction LR
        UI(["⚛️ Next.js 16 UI"]):::ui
        State(["⚡ TanStack Caching"]):::ui
        Sync(["🤝 Yjs Engine"]):::ui
    end
    
    subgraph Backend [⚙️ Application Gateway]
        direction TB
        RPC(["🔌 tRPC API (root.ts)"]):::api
        Auth(["🔒 NextAuth 5.0"]):::api
        Sockets(["📡 WebSockets"]):::api
    end
    
    subgraph DataSpace [🗄️ Persistence Layer]
        direction LR
        ORM(["🪢 Prisma 7.7.0"]):::db
        PG[(🐘 PostgreSQL)]:::db
        Vector[(📊 pgvector Indices)]:::db
    end
    
    subgraph Inference [🧠 ML Semantic Engine]
        direction LR
        Python{{"🐍 Python Engine"}}:::ai
        Model(["👁️ Siglip Vision Model"]):::ai
    end
    
    subgraph Cloud [🌐 External Cloud Web]
        direction LR
        APS(["🏗️ Autodesk Cloud"]):::external
        GCP(["📨 Google Workspace"]):::external
        Trello(["📋 Trello API"]):::external
    end

    %% Interactions
    User -->|"Interacts"| Frontend
    
    UI -.->|"Mutates & Queries"| RPC
    Sync -->|"CRDT Sync"| Sockets
    
    RPC ==> Auth
    Auth ==> ORM
    ORM ==> PG
    ORM ==> Vector
    
    RPC -->|"HTTP Offload"| Python
    Python ==> Model
    
    RPC -.->|"Proxy OAuth"| Cloud
```

## 2. Next.js Routing Map
*A highly organized breakdown of the App Router, showing exactly how the 11 specific dashboard systems branch out from the structural root layout.*

```mermaid
flowchart LR
    %% Modern Branch Styling
    classDef root fill:#0f172a,stroke:#475569,stroke-width:4px,color:#fff
    classDef page fill:#0369a1,stroke:#bae6fd,stroke-width:2px,color:#fff,rx:8,ry:8
    classDef feature fill:#1d4ed8,stroke:#93c5fd,stroke-width:3px,color:#fff,rx:8,ry:8

    Root{"🏠 Base Hub Layout"}:::root

    %% Primary Branches
    Root ==> B1["👤 Identity Branches"]:::feature
    Root ==> B2["🏗️ BIM Branches"]:::feature
    Root ==> B3["📋 Workflow Branches"]:::feature

    %% Identity
    B1 --> P_Home(["/home\nKPI Statistics Dash"]):::page
    B1 --> P_Account(["/account\nClient Configuration"]):::page
    B1 --> P_Settings(["/settings\nAdmin Enclave"]):::page
    B1 --> P_Users(["/users\nAccess Roles"]):::page

    %% BIM
    B2 --> P_Families(["/families\nPostgres Component DB"]):::page
    B2 --> P_Clash(["/clash-detection\nCollaboration Editor"]):::page
    B2 --> P_LOD(["/lod-checker\nVisual Vector Search"]):::page

    %% Workflow
    B3 --> P_Tasks(["/tasks\nInternal Kanban"]):::page
    B3 --> P_Trello(["/trello\nExternal Webhooks"]):::page
    B3 --> P_Exam(["/exam\nTraining Simulation"]):::page
```

## 3. The Backend Router Matrix
*A visualization of exactly how the core `tRPC` api branches into domain-isolated subsystems to handle specific logic without circular dependencies.*

```mermaid
flowchart TD
    %% Specialized Hub Look
    classDef base fill:#1e293b,stroke:#f8fafc,stroke-width:4px,color:#fff
    classDef core fill:#4f46e5,stroke:#c7d2fe,stroke-width:2px,color:#fff
    classDef logic fill:#059669,stroke:#a7f3d0,stroke-width:2px,color:#fff
    
    TRPC{{"🌐 tRPC Gateway Interface"}}:::base
    
    subgraph CoreSystem [🔐 Core System Module]
        direction LR
        U([users.ts]):::core
        S([settings.ts]):::core
        K([kpi.ts]):::core
    end
    
    subgraph GoogleProxies [📧 Google Proxies]
        direction LR
        GM([gmail.ts]):::logic
        Ca([calendar.ts]):::logic
        Ch([chat.ts]):::logic
    end
    
    subgraph AECL[🏗️ AEC Engineering logic]
        direction LR
        AP([aps-search.ts]):::logic
        FA([families.ts]):::logic
        LD([lod.ts]):::logic
        CL([clash.ts]):::logic
    end

    subgraph ProcessHandlers [📋 Process Handlers]
        direction LR
        TR([trello.ts]):::logic
        TS([tasks.ts]):::logic
        EX([exam.ts]):::logic
    end

    TRPC -->|"Admin Or Client"| CoreSystem
    TRPC -->|"G-Workspace OAuth"| GoogleProxies
    TRPC -->|"Heuristic Data"| AECL
    TRPC -->|"Mutation Webhooks"| ProcessHandlers
```
