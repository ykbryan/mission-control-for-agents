# LOOKER_CANVAS_SPEC.md - Agent Dashboard Canvas Research Packet

## 1. Library Recommendation

**Recommended Library:** `React Flow`
*   **Reasoning:** `React Flow` is purpose-built for creating interactive node-based editors and diagrams, which perfectly aligns with the requirement to display agents as distinct, draggable, and interactive entities on a canvas. It offers out-of-box functionalities for dragging, zooming, and panning, and a robust API for handling node and edge interactions. While `react-zoom-pan-pinch` provides general-purpose pan/zoom capabilities, it does not offer the inherent node-graph structure and utilities that `React Flow` does, making the latter a more direct and efficient solution for this specific problem.
*   **Next.js Compatibility:** `React Flow` is a React library and is fully compatible with Next.js applications.

## 2. Data Transformation Strategy (Agent Data to React Flow Nodes)

The existing agent data (names, status, capabilities) can be directly transformed into `React Flow` nodes as follows:

*   **Node Structure:** Each agent will correspond to a single `React Flow` node object. A basic node object typically includes:
    *   `id`: A unique identifier for the node. This should map directly to the agent's unique ID.
    *   `position`: An `{ x: number, y: number }` object defining the node's initial coordinates on the canvas. These can be algorithmically generated (e.g., a grid layout, or a simple stacked layout) or loaded from a saved user layout.
    *   `data`: An object containing the agent's specific data to be displayed within the node or used for interactions.

*   **Mapping Agent Data to Node Data:**
    *   **Agent Name:** Will be the primary display text within the node.
    *   **Agent Status:** Can be used to visually differentiate nodes (e.g., via different background colors, border styles, or icons). This can be achieved by assigning a `type` to the node or by passing a `status` property to the `data` object and conditionally styling the custom node component.
    *   **Agent Capabilities:** Can be displayed as small tags or icons within the node, or as part of a tooltip that appears on hover.

## 3. Node Click Interaction and Secure Data Loading

Clicking a node on the canvas will trigger the following process to securely load agent details into the `InspectorPanel`:

1.  **Click Event Listener:** `React Flow` provides an `onNodeClick` prop that can be attached to the `ReactFlow` component. When a node is clicked, this handler receives the clicked node's data, including its `id`.
2.  **Frontend Rendering (InspectorPanel):** Upon successful selection, the frontend state (e.g., `selectedAgentId`) will be updated. The `InspectorPanel` component will react to this state change and render the markdown content for `MEMORY.md`, `IDENTITY.md`, and the `AgentLogStream` for that specific agent id.
