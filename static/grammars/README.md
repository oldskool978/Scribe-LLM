# Scribe-LLM Cognitive Blueprints (DAG-VFS)

This directory contains the JSON Execution Blueprints that drive the `neural_engine.js` REPL. 
These blueprints dictate the Virtual File System (VFS), memory isolation, Monte Carlo Tree Search (MCTS) branch evaluations, Recursive Language Modeling (RLM) iterations, and dynamic hardware inference scaling, achieving a zero-entropy, model-agnostic intelligence loop.

## Architectural Paradigms

1. **The Virtual File System (VFS):** Ephemeral memory registers instantiated per-loop. Prevents context poisoning by isolating thoughts, critic evaluations, and drafts from the primary UI chat state.
2. **Directed Acyclic Graph (DAG):** Complex reasoning is mapped to isolated inference nodes, preventing hallucination cascades.
3. **Tri-Buffer Stratification System:** - **Buffer A (Episodic Memory):** Maintains conversational turns but mathematically excises intermediate internal monologues and sandbox traces to maximize context horizon.
   - **Buffer B (Ephemeral VFS Map):** Maintains an active, decoupled map of all generated files across cognitive loops.
   - **Buffer C (Focal Anchor):** The absolute final message injected before inference, guaranteeing attention momentum convergence on the immediate task.
4. **MCTS (Zero-Cost KV Caching):** Leverages continuous batching to spawn simultaneous generative trajectories, evaluated by an internal Critic node to select the mathematically optimal path.
5. **Recursive Language Models (RLM):** An iterative loop architecture where the model utilizes a secure, air-gapped Web Worker sandbox to systematically explore data via programmatic operations before reaching a conclusion.
6. **Hardware Telemetry Sync:** Blueprints dynamically poll physical accelerator boundaries (VRAM/RAM offloads) to scale parallel slots and force memory constraints, preventing Page-Fault Thrashing and OOM halts.
7. **Autonomous Multi-Part Dispatch:** Engineering DAGs gracefully handle code sequences that exceed token horizons by sealing partial artifacts into Buffer B, flushing the KV cache, and initiating a silent continuation loop automatically.

---

## Blueprint Topologies (The Atlas)

* `router.json`: **Intent Classification Matrix.** Zero-shot deterministic routing mapping user prompts to specific execution graphs.
* `chat_base.json`: **Standard Interface.** Baseline auto-regression for standard interactions.
* `cognitive_base.json`: **Step-by-Step Resolver.** Latent space expansion forcing a reasoning block prior to synthesis.
* `cognitive_chat.json`: **Analytical MCTS Engine.** Spawns parallel inference trajectories for complex logic, deploying a programmatic Critic Node to prune dead-end paths.
* `cognitive_code.json`: **Multi-Part Engineering DAG.** Operates across Architecture Planning, Code Implementation, and Synthesis. Supports Autonomous Multi-Part Dispatch.
* `cognitive_rlm.json`: **Recursive Extractor.** Executes within a strict Read-Eval-Print Loop (REPL), executing JavaScript snippets via `<rlm_exec>` blocks to search the VFS iteratively.

---

## Blueprint Root Structure

The root object defines the global boundaries and initial VFS allocations for the graph.

| Key | Type | Description |
| :--- | :--- | :--- |
| `_start_node` | String | The ID of the first node to execute in the `_nodes` dictionary. |
| `_max_cycles` | Integer | The absolute iteration limit before the engine forces an emergency halt (Infinite Loop Protection). |
| `_memory_struct` | Array | The exact memory registers to allocate in the ephemeral VFS (e.g., `["_user_request", "_thought", "_code"]`). |
| `_system_root_instruction` | String | The global system prompt anchoring the DAG's persona throughout the loop. |
| `_context_template` | String | (Optional) The template for assembly ensuring Attention Momentum Inversion: e.g., `<directive>\n{{INSTRUCTION}}\n</directive>\n\n<context>\n{{MEMORY}}\n</context>`. |
| `_nodes` | Object | The dictionary of atomic execution nodes. |

---

## Execution Node Structure

Each node represents an atomic inference pass. Nodes can operate in distinct `_mode` paradigms depending on the required compute vector.

| Key | Type | Description |
| :--- | :--- | :--- |
| `_mode` | String | `"standard"`, `"mcts"`, `"infill"`, `"rlm"`, or `"router"`. Defaults to `"standard"`. |
| `_task_instruction` | String | The microscopic, highly-targeted instruction for this specific node. Implementations MUST use absolute positive directives. |
| `_read_memory` | Array | The exact VFS registers this node is allowed to see. **Crucial for context economy.** |
| `_write_memory` | String | The VFS register where the `<EOS>` terminated output will be saved. |
| `_write_mode` | String | `"overwrite"` (default) or `"append"`. |
| `_json_schema` | Object/Null | A strict JSON Schema to force the logits bias into a structured output (via llama.cpp native support). |
| `_grammar_rule` | String/Null | A strict GBNF string to force the logits bias into a specific schema. |
| `_inference_parameters` | Object | Overrides for this pass: `{"temperature": 0.1, "min_p": 0.05, "max_tokens": 4096}`. |
| `_next_step_logic` | Object | The DAG routing logic to determine the next execution node. |

---

## Specialized Node Modes

### MCTS (Monte Carlo Tree Search)
Used for critical reasoning where multiple trajectories must be evaluated simultaneously.
* `_candidates`: (Integer) The number of parallel branches to spawn (e.g., `3`). *Note: Parallel slots are dynamically throttled by the Physics Engine during RAM-offloaded execution.*
* `_max_depth`: (Integer) The maximum depth of sequential trajectory refinement.
* `_evaluator_instruction`: (String) The strict rubric the internal Critic Node will use to mathematically select the optimal branch index.

### RLM (Recursive Language Model)
Used for iterative, programmatic data exploration. Connects to the airtight Javascript Worker Sandbox.
* `_max_rlm_cycles`: (Integer) The maximum number of self-prompting execution loops before forced convergence.

### Infill (Latent Space Mutation)
Used for Fill-In-The-Middle (FIM) code editing or structural text mutation.
* `_infill_prefix`: (String) VFS register containing the leading context.
* `_infill_suffix`: (String) VFS register containing the trailing context.

---

## Dynamic DAG Transitions (`_next_step_logic`)

The graph moves between nodes based on the output of the current node.

**1. Absolute Routing (Unconditional)**
```json
"_next_step_logic": {
    "_default_": "SYNTHESIS_NODE"
}
```

**2. Exact String Matching**
If a node is forced by `_json_schema` to output specific categorical classifications.
```json
"_next_step_logic": {
    "CODE_REQUIRED": "WRITE_CODE_NODE",
    "NO_CODE": "EXIT_SUCCESS",
    "_default_": "EXIT_SUCCESS"
}
```

**3. Evaluated Logic (JavaScript Sandboxing)**
Dynamically parses the output string to evaluate boolean conditions. `_output_` represents the generated text.
```json
"_next_step_logic": {
    "_condition_": "_output_.includes('```python')",
    "_if_true_": "TEST_CODE_NODE",
    "_if_false_": "REWRITE_CODE_NODE",
    "_default_": "EXIT_SUCCESS"
}
```

*Note: Routing to `"EXIT_SUCCESS"` terminates the DAG, destroys the ephemeral VFS, initiates final UI synthesis, and triggers garbage collection.*
