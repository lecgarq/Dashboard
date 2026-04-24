# Debug Session: Dedicated GPU Rendering

## Symptom
The user is concerned about the rendering engine for `AccUsersGraph.tsx`. They noticed that the graph relies on standard CPU/Integrated GPU processing rather than explicitly leveraging a dedicated GPU (e.g., via CUDA, WebGPU, or Vulkan), which is limiting performance for high-node-count visualizations.

**When:** Observing the interactive user graph (ACC Users Graph) in the browser.
**Expected:** The graph uses low-level hardware acceleration (WebGPU/WebGL) to handle thousands of nodes efficiently.
**Actual:** The graph uses HTML5 Canvas 2D API (`canvas.getContext("2d")`), which is accelerated by the browser but lacks low-level control, often falling back to integrated graphics or experiencing CPU-bound frame drops, especially coupled with main-thread force simulation.

## Hypotheses

| # | Hypothesis | Likelihood | Status |
|---|------------|------------|--------|
| 1 | The current HTML5 Canvas API does not invoke the dedicated GPU on the user's system due to lack of WebGL/WebGPU context. | 90% | UNTESTED |
| 2 | The force simulation running on the main thread is causing high CPU usage, making the user think the GPU is not being utilized. | 80% | UNTESTED |

## Attempts

*(Pending User Feedback)*
