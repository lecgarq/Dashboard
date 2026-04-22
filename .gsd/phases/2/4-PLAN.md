---
phase: 2
plan: 4
wave: 1
---

# Plan 2.4: Media UX Refinement (Image/Video/GIF)

## Objective
Refine the handling of images, videos, and GIFs to provide a more "premium" feel, including better resizing, captions, and lazy loading.

## Context
- `components/clash/WikiEditor.tsx`
- `tiptap-extension-resize-image`

## Tasks

<task type="auto">
  <name>Enhance Image Resizing & Captions</name>
  <files>components/clash/WikiEditor.tsx</files>
  <action>
    - Configure `tiptap-extension-resize-image` to support captions.
    - Add custom styling for image borders and shadow effects.
  </action>
  <verify>grep "caption" components/clash/WikiEditor.tsx</verify>
  <done>Images support captions and have improved visual styling.</done>
</task>

<task type="auto">
  <name>Implement Video/GIF Native Block</name>
  <files>components/clash/wiki-editor/nodes/VideoNode.tsx</files>
  <action>
    - Create a `VideoNode` for local/UploadThing video files and GIFs.
    - Support autoplay for GIFs and custom controls for videos.
  </action>
  <verify>Test-Path components/clash/wiki-editor/nodes/VideoNode.tsx</verify>
  <done>Videos and GIFs are handled by a specialized node with appropriate controls.</done>
</task>

## Success Criteria
- [ ] Images have captions and better resizing behavior.
- [ ] GIFs autoplay by default.
- [ ] Videos are playable directly within the wiki.
