# Scribe-LLM: An Ephemeral Control Plane & Cognitive Matrix

<div align="center">
    
*Local Orchestration Engine and Stateful Execution Workspace*

[![Status: Production Ready](https://img.shields.io/badge/Status-Production_Ready-10b981?style=flat-square)](#)
[![Architecture: Monolithic_LSP](https://img.shields.io/badge/Architecture-Monolithic_LSP-818cf8?style=flat-square)](#)
[![Topology: Hermetic](https://img.shields.io/badge/Topology-Hermetic-2563eb?style=flat-square)](#)

</div>

---

## 🌐 Macro Identity & Topology
Scribe-LLM is a locally containerized orchestration engine and execution workspace designed to interface probabilistic transformer models with deterministic software control layers. Rather than treating local weights as stateless chat endpoints, Scribe-LLM processes model outputs as atomic data transformations executing within structured, Directed Acyclic Graph (DAG) logic flows.

The backend runtime is constructed using standard Python primitives, while the interface utilizes a decoupled web components architecture. The ecosystem runs entirely on local host hardware without dependencies on external frameworks, secondary network transport layers, or remote telemetry collection.

---

## 🧠 Core Mechanics & Theoretical Foundations

### 1. Parallel Trajectory Steering (DisCIPL)
* **Core Mechanics:** Implements tree-search nodes (`MCTSNodeStrategy`) that fork generation tasks into parallel validation tracks (`candidatesCount`) across multi-step execution depths. A dedicated structural verification loop evaluates intermediate outputs, pruning low-scoring logical branches and resampling optimal trajectories.
* **Academic Lineage:** Derived from the **DisCIPL** framework (*Divergent Chain-of-Thought Inference via Parallelized Leverage* / *Self-Steering Language Models*, Grand et al., 2025; MIT / Yale), enforcing structural constraints on open-ended inference by steering token streams through runtime verification layers.

### 2. Telemetry-Driven Stream Continuation 
* **Core Mechanics:** Bypasses client-side string-parsing heuristics (such as bracket counting or regular expression evaluation) to identify truncation. Scribe captures low-level chunk metadata signals (`finish_reason`) directly from the incoming inference stream. If an output naturally terminates on a trailing sequence, the state is preserved as-is. If an execution cut-off occurs due to context exhaustion (`finish_reason: "length"`), the system commits the generation history, appends the partial generation as an assistant role prefix, and resumes inference immediately from the last emitted token without losing cache state or repeating planning phases.
* **Academic Lineage:** Formulated in alignment with **Grammar-Constrained Decoding (GCD) Optimization** principles (Hamilton & Mimno, 2025; Cornell University), resolving token-clipping errors while maintaining Key-Value (KV) cache continuity.

### 3. Isolated Tool Recursion & Symbolic Sandboxing (RLM)
* **Core Mechanics:** Utilizes the `RLMNodeStrategy` to enable models to inspect, decompose, and recursively query local data structures over an internal register matrix. Executable operations run within an isolated web worker sandbox (`_evaluateInWorkerSandbox`) with frozen JavaScript prototype chains and shadowed network layers to prevent arbitrary execution outside the workspace container.
* **Academic Lineage:** Positioned atop the **Recursive Language Models (RLM)** architecture (Zhang et al., 2026; MIT CSAIL) combined with recursive reasoning paradigms for constrained architectures (Jolicoeur-Martineau, 2025; Samsung SAIL Montréal), expanding functional execution limits by enabling models to inspect and iterate on their own tool execution loops.

### 4. Attention Optimization & Memory Management
* **Core Mechanics:** Employs a context bounds optimization manager (`ContextMatrix.enforceContextBounds`) that calculates hardware memory allocations before every execution cycle. When boundaries are reached, the matrix applies compression workflows to condense historical conversation layers, while foundational system instructions and prompt anchors remain persistently pinned within VRAM cache allocations.
* **Academic Lineage:** Formulated from the **Attention Compression (CSA/HCA)** concepts developed in *DeepSeek-V4* (DeepSeek-AI, 2025), enabling long-range context evaluation while retaining baseline system directives.

### 5. Native AST Lexical Math Integration & Pushdown Tokestream Parsing
* **Core Mechanics:** Eliminates macro-text placeholding and post-processing text-swapping operations. Scribe utilizes an inline character-level interceptor embedded directly within the live streaming lexer loop. Mathematical delimiters (`$`, `$$`, `\(`, `\[`) are isolated at the raw byte level during token stream arrival, capturing expressions into immutable node blocks before markdown parsing occurs. This prevents syntax-character collisions (such as underscores `_` or asterisks `*` interrupting mathematical formatting) while passing pristine parameters directly to KaTeX.
* **Visual Frame Throttling:** Governed by a single-pass, character-by-character pushdown automaton (`_lexicalStreamParse`) that tracks inline and block boundary depths on a native state stack. This state machine manages interface component rendering on line-buffered increments and updates streaming tokens on animation frames (`requestAnimationFrame`), mitigating layout thrashing and preserving text selection state during generation.

---

## 📂 Subsystem Topology Map

```text
Scribe-LLM/
├── server.py                 # Core backend daemon, hardware profiler, and request routing
├── start.*                   # Zero-dependency operating system dependant bootstrap
├── requirements.txt          # Explicit package dependency manifest definition array
├── models/                   # Storage directory for local GGUF models and associated layers
├── LMCPP/                    # High-performance C++ core inference binaries
├── acquisition_engine/       # Quantization forge scripts and file execution workers
└── static/
    ├── index.html            # Primary web application interface layout
    ├── grammars/             # DAG blueprints, JSON validation schemas, and node logic
    └── js/
        ├── app.js            # Main UI orchestrator, context compiler, and state manager
        ├── api_gateway.js    # Concurrency multiplexer handling socket communication rules
        ├── physics_engine.js # Resource profiling calculator mapping VRAM/RAM budgets
        ├── neural_engine.js  # Stateful graph logic engine, context manager, and RLM runners
        └── compositor.js     # Lexical streaming layout renderer and math isolation matrix
```

---

## 🚀 Deployment & Environment Hydration

Scribe-LLM is engineered as a relocatable, self-contained workspace environment. It utilizes an OS-independent bootstrapping process that isolates execution dependencies from the host environment.

### 1. Pre-Flight Architecture Constraints
◦ Environment Isolation: No globally installed compilation toolchains, runtime management packages, or system-wide virtual environments are required.
◦ Network Channels: Utilizes standard library network streams for asset retrieval, bypassing external CLI utility dependencies or global configuration hooks.

### 2. Structural Workspace Provisioning
Initialize the control plane by launching the provisioner from the workspace root. The orchestrator maps internal dependency topologies, evaluates local hardware compute backends, and binds isolated runtimes.

```bash
# Execute standard hydration track using default interactive prompt sequence
python setup.py

# Purge existing compilation layers and bind environment to an explicit distribution track
python setup.py --python 3.14.5 --update
```

### 3. Execution Control Parameters
* `--python [version]`: Enforces runtime track pinning (`3.10.11` through `3.14.5`), fetching static standalone binaries directly into local containment frames (`.venv/`).
* `--update`: Initiates a non-destructive extraction and purge across internal compilation boundaries, updating runtime states while preserving local model weights (`models/`).

### 4. Verification & Ignition
Upon successful execution, the pipeline serializes the environment state space into an immutable configuration lock file (`constraints.lock`). This locks down package constraints to guarantee zero upstream dependency drift over long-term operations.

Launch the local system interface container using the environment bootstrap script tailored for the host operating system context:

```bash
# Windows Infrastructure Launch Sequence
.\start.bat

# POSIX Infrastructure Launch Sequence (Linux / macOS)
./start.sh
```

---

## 🎛️ Operator Overrides vs. Adaptive Parameter Tuning

Scribe-LLM balances automated execution configurations with precise operator boundaries:
* **Adaptive Allocation:** The system leaves operational variables like context windows and layer offloading in their baseline states by default. The resource profiler evaluates hardware capacity in real time, scaling these parameters dynamically during model swaps to optimize memory stability.
* **Manual Overrides:** Adjusting any configuration slider registers an explicit override flag (`userOverrides: true`), forcing the parameter into a static state. The background resource engine respects these locked constraints, dynamically rebalancing the remaining variable attributes to maintain memory boundary safety and prevent allocation faults.
* **Parameter Reset:** To clear manual adjustments and return to system optimization, double-click the label row of any modified slider. The parameter clears its override flag and snaps back to its mathematically calculated baseline.

---

## 📚 Academic Foundations Reference Index

* **Self-Steering & Sequential Monte Carlo (SMC):** Grand, G., Tenenbaum, J. B., Mansinghka, V. K., Lew, A. K., & Andreas, J. (2025). *Self-Steering Language Models*. (MIT / Yale). 
* **Recursive Language Models (RLM):** Zhang, A. L., Kraska, T., & Khattab, O. (2026). *Recursive Language Models*. (MIT CSAIL).
* **Recursive Reasoning with Tiny Networks:** Jolicoeur-Martineau, A. (2025). *Less is More: Recursive Reasoning with Tiny Networks*. (Samsung SAIL Montréal).
* **Grammar-Constrained Decoding (GCD) Optimization:** Hamilton, S., & Mimno, D. (2025). *Lost in Space: Optimizing Tokens for Grammar-Constrained Decoding*. (Cornell University).
* **Attention Compression (CSA/HCA):** DeepSeek-AI (2025). *DeepSeek-V4: Towards Highly Efficient Million-Token Context Intelligence*.
