---
phase: 1
plan: 1
wave: 1
gap_closure: true
---

# Fix: HTML Content Extraction

## Problem
The Yjs server currently extracts raw XML from the collaborative state. This may lead to visual drift or formatting issues when viewing the content in non-collaborative parts of the application.

## Root Cause
Simple xmlFragment.toString() call in the store hook.

## Tasks

<task type="auto">
  <name>Implement HTML Extraction in Yjs Server</name>
  <files>
    <file>scripts/yjs-server.mjs</file>
  </files>
  <action>
    1. Integrate a basic ProseMirror/Tiptap schema-based serializer or a more robust XML-to-HTML mapping.
    2. Since the full Tiptap environment is unavailable on the server, use a simplified approach to ensure common tags (paragraphs, headings, lists) are correctly serialized to HTML.
    3. Update the store hook to use this serializer.
  </action>
  <verify>Check the database 'content' field after an edit to ensure it contains valid HTML instead of raw XML.</verify>
  <done>Wiki content is stored as clean, compatible HTML.</done>
</task>
