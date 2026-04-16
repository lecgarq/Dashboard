/**
 * Ensures a wiki section key is uniquely prefixed with the project ID
 * and prevents double-prefixing.
 * 
 * @param projectId The current project ID
 * @param section The raw section name or already-prefixed key
 * @returns A sanitized, project-unique section key
 */
export function ensureUniqueSection(projectId: string, section: string): string {
  if (!section) return section;
  
  // If it already starts with the project ID followed by a dash, return it as is
  if (section.startsWith(`${projectId}-`)) {
    return section;
  }
  
  // Otherwise prefix it
  return `${projectId}-${section}`;
}


