# Viewer API (v7) — Complete Reference

> Source: `VIEWER API/` — 160 JSON files
> Official docs: https://aps.autodesk.com/en/docs/viewer/v7/developers_guide/overview/

---

## Overview

The Viewer is a **client-side JavaScript library** that renders 2D/3D models in the browser using WebGL. It displays SVF2 derivatives created by the Model Derivative API. It includes a rich set of built-in tools (measurement, section, explode, markup) and is fully extensible.

## CDN URL

```html
<!-- CSS -->
<link rel="stylesheet" href="https://developer.api.autodesk.com/modelderivative/v2/viewers/7.*/style.min.css">
<!-- JS -->
<script src="https://developer.api.autodesk.com/modelderivative/v2/viewers/7.*/viewer3D.min.js"></script>
```

---

## Initialization

### Basic Setup
```javascript
const options = {
  env: 'AutodeskProduction',
  api: 'streamingV2',               // use streaming for SVF2
  getAccessToken: (callback) => {
    callback(accessToken, 3600);     // token + expiry in seconds
  }
};

Autodesk.Viewing.Initializer(options, () => {
  const viewer = new Autodesk.Viewing.GuiViewer3D(
    document.getElementById('viewer-container')
  );
  viewer.start();
  loadModel(viewer, 'urn:dXJuOmFkc2...');
});
```

### Loading a Model
```javascript
function loadModel(viewer, documentId) {
  Autodesk.Viewing.Document.load(documentId, (doc) => {
    const defaultModel = doc.getRoot().getDefaultGeometry();
    viewer.loadDocumentNode(doc, defaultModel, {
      keepCurrentModels: true  // for multi-model loading
    });
  }, (errorCode, errorMsg) => {
    console.error('Document load failed:', errorCode, errorMsg);
  });
}
```

### Loading Multiple Models (Aggregated View)
```javascript
const av = new Autodesk.Viewing.AggregatedView();
av.init(document.getElementById('container'), { viewerConfig: {} });

const docs = await Promise.all(urns.map(urn =>
  new Promise((resolve, reject) =>
    Autodesk.Viewing.Document.load(urn, resolve, reject)
  )
));

const bubbles = docs.map(doc => doc.getRoot().getDefaultGeometry());
av.setNodes(bubbles);
```

---

## Core Classes (Viewing namespace)

| Class | Purpose |
|-------|---------|
| `GuiViewer3D` | Full viewer with default toolbar, panels, and navigation tools |
| `Viewer3D` | Headless viewer — no UI, for custom interfaces |
| `Document` | Loads and parses a translated model's manifest |
| `BubbleNode` | Represents a node in the viewable tree (3D views, 2D sheets) |
| `AggregatedView` | Manages loading/unloading multiple models in one scene |
| `Model` | Represents a loaded model — get fragments, properties, bounds |
| `Navigation` | Camera control — orbit, pan, zoom, fit-to-view |
| `Extension` | Base class for all viewer extensions |
| `ExtensionManager` | Load/unload/get extensions |
| `ToolController` | Manages input tools (orbit, pan, selection) |
| `ToolInterface` | Base class for custom tools |
| `OverlayManager` | Add/remove Three.js overlay scenes |
| `Profile` / `ProfileManager` | Viewer configuration profiles |
| `PropertySet` | Query properties of model elements |
| `HotkeyManager` | Register keyboard shortcuts |
| `FeatureFlags` | Enable/disable experimental features |

---

## UI Classes

| Class | Purpose |
|-------|---------|
| `ToolBar` | The main toolbar container |
| `Button` | A toolbar button |
| `ComboButton` | Dropdown button |
| `ControlGroup` | Group of toolbar buttons |
| `RadioButtonGroup` | Mutually exclusive button group |
| `DockingPanel` | Floating panel (base for all panels) |
| `PropertyPanel` | Shows selected element's properties |
| `ModelStructurePanel` | Model browser tree |
| `SettingsPanel` | Viewer settings |
| `DataTable` | Tabular data display |
| `Tree` | Hierarchical tree UI |
| `Filterbox` | Search/filter input |
| `ObjectContextMenu` | Right-click context menu |

---

## Built-in Extensions (33 total)

### Navigation & Camera

| Extension ID | Class | Purpose |
|---|---|---|
| `Autodesk.BimWalk` | `BimWalkExtension` | First-person walkthrough mode |
| `Autodesk.Viewing.FusionOrbit` | `FusionOrbitExtension` | Fusion-style orbit navigation |
| `Autodesk.GoHome` | `GoHomeExtension` | Reset camera to home view |
| `Autodesk.NavTools` | `NavToolsExtension` | Pan, orbit, zoom tools |
| `Autodesk.RollCamera` | `RollCameraExtension` | Camera roll control |
| `Autodesk.FullScreen` | `FullScreenExtension` | Fullscreen toggle |
| `Autodesk.ViewCubeUi` | `ViewCubeUi` | ViewCube orientation widget |
| `Autodesk.Minimap` | `MinimapExtension` | 2D minimap overlay |

### Measurement & Analysis

| Extension ID | Class | Purpose |
|---|---|---|
| `Autodesk.Measure` | `MeasureExtension` | Distance, angle, area measurement |
| `Autodesk.Snapping` | `SnappingExtension` | Snap-to-geometry for precision |
| `Autodesk.Section` | `SectionExtension` | Cross-section cutting planes |
| `Autodesk.Explode` | `ExplodeExtension` | Exploded view of assemblies |

### Markup & Annotation

| Extension ID | Class | Purpose |
|---|---|---|
| `Autodesk.Viewing.MarkupsCore` | `MarkupsCore` | Freehand, arrows, text, rectangles, clouds |
| `Autodesk.Edit2D` | `Edit2DExtension` | 2D shape drawing & editing overlay |

### Model & Scene

| Extension ID | Class | Purpose |
|---|---|---|
| `Autodesk.Viewing.SceneBuilder` | `SceneBuilder` | Add custom Three.js geometry to the scene |
| `Autodesk.ModelBuilder` | `ModelBuilder` | Build models from scratch |
| `Autodesk.glTF` | `glTF` | Load glTF 2.0 models |
| `Autodesk.DocumentBrowser` | `DocumentBrowser` | Switch between views/sheets |
| `Autodesk.CrossFadeEffects` | `CrossFadeEffects` | Transition effects between views |
| `Autodesk.SplitScreen` | `SplitScreenExtension` | Side-by-side model comparison |
| `Autodesk.PDF` | `PDFExtension` | Render PDFs in viewer |

### Rendering & Display

| Extension ID | Class | Purpose |
|---|---|---|
| `Autodesk.NPR` | `NPR` | Non-photorealistic rendering (sketch style) |
| `Autodesk.Wireframes` | `WireframesExtension` | Wireframe display mode |
| `Autodesk.LayerManager` | `LayerManagerExtension` | Layer visibility control |

### Utilities

| Extension ID | Class | Purpose |
|---|---|---|
| `Autodesk.PropertiesManager` | `PropertiesManagerExtension` | Properties panel management |
| `Autodesk.ModelStructure` | `ModelStructureExtension` | Model browser tree |
| `Autodesk.ViewerSettings` | `ViewerSettingsExtension` | Settings panel |
| `Autodesk.Hyperlink` | `HyperlinkExtension` | Clickable links in model |
| `Autodesk.Popout` | `PopoutExtension` | Pop out viewer to new window |
| `Autodesk.ZoomWindow` | `ZoomWindow` | Zoom to rectangular region |
| `Autodesk.GestureDocumentNavigation` | `GestureDocumentNavigationExtension` | Touch gesture navigation |
| `Autodesk.Animation` | `AnimationExtension` | Keyframe animations |

### Loading an Extension
```javascript
viewer.loadExtension('Autodesk.Measure').then((ext) => {
  ext.activate('distance');  // activate distance tool
});
```

---

## Key Events

| Event | Fires When |
|-------|-----------|
| `Autodesk.Viewing.GEOMETRY_LOADED_EVENT` | Model geometry fully loaded |
| `Autodesk.Viewing.OBJECT_TREE_CREATED_EVENT` | Object tree (hierarchy) ready |
| `Autodesk.Viewing.SELECTION_CHANGED_EVENT` | User selects/deselects elements |
| `Autodesk.Viewing.CAMERA_CHANGE_EVENT` | Camera moves |
| `Autodesk.Viewing.EXTENSION_LOADED_EVENT` | Extension loaded |
| `Autodesk.Viewing.MODEL_ADDED_EVENT` | New model added to viewer |
| `Autodesk.Viewing.ISOLATE_EVENT` | Elements isolated/shown |
| `Autodesk.Viewing.HIDE_EVENT` | Elements hidden |
| `Autodesk.Viewing.FIT_TO_VIEW_EVENT` | Camera fit to selection |

```javascript
viewer.addEventListener(Autodesk.Viewing.SELECTION_CHANGED_EVENT, (event) => {
  console.log('Selected dbIds:', event.dbIdArray);
  if (event.dbIdArray.length > 0) {
    viewer.getProperties(event.dbIdArray[0], (props) => {
      console.log('Properties:', props);
    });
  }
});
```

---

## Key Viewer3D Methods

| Method | Purpose |
|--------|---------|
| `start()` | Initialize the viewer |
| `finish()` | Destroy the viewer |
| `loadDocumentNode(doc, node)` | Load a model from a Document |
| `loadModel(url, options)` | Load model from URL |
| `unloadModel(model)` | Remove a model |
| `select(dbIds)` | Select elements by ID |
| `isolate(dbIds)` | Isolate elements (hide others) |
| `hide(dbIds)` | Hide specific elements |
| `show(dbIds)` | Show hidden elements |
| `showAll()` | Show everything |
| `fitToView(dbIds)` | Zoom to fit selected elements |
| `getProperties(dbId, callback)` | Get properties of an element |
| `search(text, callback)` | Search properties for text |
| `setThemingColor(dbId, color)` | Color-code an element |
| `clearThemingColors()` | Reset all theming |
| `getScreenShot(w, h, callback)` | Capture viewer as image |
| `setViewFromFile(doc, viewId)` | Switch to a specific view |
| `navigation.setPosition(pos)` | Set camera position |
| `navigation.getPosition()` | Get camera position |

---

## Writing Custom Extensions

```javascript
class MyExtension extends Autodesk.Viewing.Extension {
  constructor(viewer, options) {
    super(viewer, options);
  }

  load() {
    console.log('MyExtension loaded');
    this.viewer.addEventListener(
      Autodesk.Viewing.SELECTION_CHANGED_EVENT,
      this.onSelection.bind(this)
    );
    return true;
  }

  unload() {
    this.viewer.removeEventListener(
      Autodesk.Viewing.SELECTION_CHANGED_EVENT,
      this.onSelection
    );
    return true;
  }

  onSelection(event) {
    // Custom logic on selection
  }
}

Autodesk.Viewing.theExtensionManager.registerExtension('MyExtension', MyExtension);
viewer.loadExtension('MyExtension', { option1: 'value' });
```
