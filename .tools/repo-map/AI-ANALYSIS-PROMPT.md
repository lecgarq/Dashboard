Analyze the generated repo-map artifacts.

Start with:
- .tools/repo-map/manifest.json
- .tools/repo-map/architecture-summary.md
- .tools/repo-map/dependency-cruiser.json
- .tools/repo-map/ast-grep-report.json

Only open Repomix files when needed. Prefer the smallest useful slice first:
- .tools/repo-map/repomix/app.xml
- .tools/repo-map/repomix/components.xml
- .tools/repo-map/repomix/server.xml
- .tools/repo-map/repomix/scripts.xml
- .tools/repo-map/repomix/config.xml

Produce:

1. Current architecture map
2. Main app domains/features
3. Data flow from UI to API/server to database
4. Dependency boundary violations
5. Circular imports and exact refactor plan
6. Files that are too large or too coupled
7. Duplicated responsibilities
8. Dead/low-confidence cleanup candidates
9. Recommended folder structure
10. Priority cleanup roadmap

Be conservative. Do not suggest deleting files unless there is strong evidence from imports, references, tests, generated reports, and runtime relevance.

Classify each recommendation as:
- Safe
- Medium risk
- Needs manual verification
