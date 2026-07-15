# Domain Lexicon & Business Logic

This document defines the business domain for the LECG Dashboard. When researching, planning, or ideating, use this business context instead of generic SaaS terminology.

## Core Concepts

### ACC (Autodesk Construction Cloud)
The central source of truth for all construction data and documents.
- **The Pain Point:** Folder permissions and module access in ACC are notoriously opaque. Managing cross-company permissions across hundreds of folders creates massive risk (e.g., subcontractors accidentally getting editor rights to confidential design folders).
- **Dashboard Goal:** Make ACC permissions instantly visible, auditable, and cross-filterable without needing to click through 50 screens in the Autodesk UI.

### Forma (Forma Proposals)
Forma is used for early-stage conceptual design, but in this dashboard, `/forma-proposal` acts as a **draft editor for role hierarchies and permissions**.
- **The Pain Point:** Translating early design roles into hard ACC permissions is manual and error-prone.
- **Dashboard Goal:** Allow users to draft, diff, and export role-permission matrices locally before pushing them to ACC or templates.

### MTY / Templates (`/template-mty`)
MTY refers to the Monterrey office/standards or master templates.
- **The Pain Point:** Every project reinvents its folder structure and permission scheme.
- **Dashboard Goal:** Standardize role access across projects by visualizing what a "standard" role (e.g., "BIM Coordinator") is legally allowed to touch across the standard folder terrain.

### LOD (Level of Development) & Clash (`/lod-checker`, `/clash-detection`)
- **LOD:** Defines how detailed a 3D model element is. The pain point is validating that models meet contractual LOD requirements at specific project phases.
- **Clash:** When a pipe hits a beam in the 3D model. The pain point is the volume of clashes and tracking who is responsible for resolving them across trades.

## Ideation Rules

When brainstorming new features for this dashboard:
1. **Never invent engagement features** (e.g., "email drips," "user onboarding flows"). This is an internal workshop presentation tool.
2. **Focus on Visibility vs. Risk:** The best features surface hidden risks (e.g., a heatmap of cross-company permission bleeding).
3. **Respect the Database:** Do not predict features that require external data APIs unless the Prisma DB already supports it. We read existing data; we do not build new data engineering pipelines.
