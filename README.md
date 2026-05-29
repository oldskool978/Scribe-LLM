# Scribe-LLM: The Ephemeral Control Plane & Cognitive Matrix

<div align="center">
    
*Intelligence Orchestration, at its finest.*

[![Status: Production Ready](https://img.shields.io/badge/Status-Production_Ready-10b981?style=flat-square)](#)
[![Architecture: Monolithic_LSP](https://img.shields.io/badge/Architecture-Monolithic_LSP-818cf8?style=flat-square)](#)
[![Topology: Hermetic](https://img.shields.io/badge/Topology-Hermetic-2563eb?style=flat-square)](#)

</div>

---

## 🌐 Macro Identity & Topology
Scribe-LLM is a high-performance, fully air-gapped local orchestration engine and AI execution workspace designed to bridge the gap between probabilistic transformer models and deterministic software control layers. Rather than treating local weights as simple chat completion endpoints, Scribe-LLM treats them as atomic data transformation engines executing inside stateful, Directed Acyclic Graph (DAG) logic flows.

Built natively on standard Python primitives for the backend runtime and a custom web components matrix for the layout interface, the ecosystem runs entirely on local host hardware with zero external third-party framework overhead, secondary network layers, or cloud analytics dependencies.

---

## 🧠 Core Mechanics & Theoretical Foundations

### 1. Parallel Trajectory Steering (DisCIPL)
* **Core Mechanics:** Implements advanced tree-search nodes (`MCTSNodeStrategy`) that fork generation tasks into parallel concurrent validation tracks (`candidatesCount`) across multi-step depths. A dedicated critic schema validation loop evaluates intermediate content, programmatically culls low-scoring logical branches, and resamples optimal trajectories.
* **Academic Lineage:** Developed directly from the **DisCIPL** paradigm (*Divergent Chain-of-Thought Inference via Parallelized Leverage* / *Self-Steering Language Models*, Grand et al., 2025; MIT / Yale), forcing mathematical rigor onto open-ended local outputs by steering token streams through runtime verification layers.

### 2. Telemetry-Driven Stream Continuation 
* **Core Mechanics:** Completely eliminates fragile client-side string-scraping heuristics (such as bracket counting or regex text splitting) to check for truncation errors. Scribe captures low-level chunk metadata signals (`finish_reason`) directly from the incoming inference stream. If an intentional output naturally ends on a trailing character (e.g., an open brace {}), the engine lets it stand. If an execution cut-off happens mid-turn (`finish_reason: "length"`), the system freezes the history array, appends the partial generation as an assistant role prefix, and continues typing instantly from the exact last character without losing its place or re-entering planning cycles.
* **Academic Lineage:** Aligned with **Grammar-Constrained Decoding (GCD) Optimization** principles (Hamilton & Mimno, 2025; Cornell University), resolving token-clipping errors while maintaining perfect Key-Value (KV) cache continuity.

### 3. Hardened Tool Recursion & Symbolic Sandboxing (RLM)
* **Core Mechanics:** Leverages the `RLMNodeStrategy` to allow models to analyze, break down, and recursively query local data structures over a private register matrix. Code tasks execute inside an air-gapped web worker sandbox (`_evaluateInWorkerSandbox`) with deeply frozen JavaScript prototype chains and shadowed network communication layers to make data exfiltration impossible.
* **Academic Lineage:** Built upon the **Recursive Language Models (RLM)** framework (Zhang et al., 2026; MIT CSAIL) combined with recursive reasoning paradigms for compact systems (Jolicoeur-Martineau, 2025; Samsung SAIL Montréal), expanding functional execution horizons by letting models continuously inspect and iterate on their own tool-use loops.

### 4. Viscoelastic Attention & Memory Protection
* **Core Mechanics:** Employs a context bounds optimization manager (`ContextMatrix.enforceContextBounds`) that calculates physical memory limits before every execution cycle. When boundaries are breached, the matrix applies intelligent compression pipelines to condense historical conversation drift, while system core instructions and prompt anchors remain securely locked inside VRAM cache segments.
* **Academic Lineage:** Inspired by the **Attention Compression (CSA/HCA)** architectures pioneered in *DeepSeek-V4* (DeepSeek-AI, 2025), enabling long-range context handling without losing track of foundational system instructions.

### 5. Native AST Lexical Math Integration & Pushdown Tokestream Parsing
* **Core Mechanics:** Completely eliminates macro-text placeholding and volatile text-swapping hacks. Scribe utilizes a native tokenization compiler extension directly embedded inside the markdown lexer loop. Mathematical delimiters ($, $$, \(, \[) are intercepted at the character level before markdown parsing occurs, isolating raw expressions into immutable token nodes. This guarantees total immunity against syntax-character collisions (such as underscores _ or asterisks *) while passing uncorrupted text parameters to KaTeX with absolute byte-fidelity.
* **Visual Frame Throttling:** Handled by a single-pass pushdown automaton (`_lexicalStreamParse`) that tracks inline and block boundaries character-by-character, managing dynamic interface component windows natively and rendering streaming tokens on animation frames (`requestAnimationFrame`) to ensure zero layout thrashing or selection loss.

---

## ⚙️ The GGUFicator Matrix: Model Acquisition & Custom Forge

Scribe-LLM hosts an integrated, headless model management and tensor manipulation workspace that handles the entire lifecycle of model acquisition:
* **Interactive Registry Probing:** Connects to remote model repositories to dynamically discover, filter, and map model properties, tracking file footprints and structural metadata layers before downloading.
* **Direct Payload Distribution:** Deploys background worker channels to download pre-quantized model configurations safely into local workspace repositories.
* **The Custom Quantization Forge:** Transforms raw source weights (such as `.safetensors` files) into optimized local configurations. The workspace automatically downloads source artifacts, processes tensor files down to advanced quantization profiles (K-Quants and high-density I-Quants like IQ3_M or IQ4_XS), and injects appropriate template layers to guarantee clean decoding performance.

---

## 📂 Subsystem Topology Map

```text
Scribe-LLM/
├── server.py                 # Core backend daemon, hardware profiler, and request proxy
├── start.bat                 # Zero-dependency ignition bootstrap script for Windows
├── requirements.txt          # Explicit package dependency manifest definition array
├── models/                   # Local GGUF neural core weight file storage directory
├── LMCPP/                    # High-performance C++ core inference binaries
├── acquisition_engine/       # Quantization forge scripts and file workers
└── static/
    ├── index.html            # Main desktop application interface layout
    ├── grammars/             # DAG blueprints, JSON validation schemas, and node logic
    └── js/
        ├── app.js            # Main UI orchestrator, context compiler, and override manager
        ├── api_gateway.js    # Concurrency multiplexer handling socket communication rules
        ├── physics_engine.js # Resource profiling calculator mapping VRAM/RAM budgets
        ├── neural_engine.js  # Stateful graph logic engine, context manager, and RLM runners
        └── compositor.js     # Lexical streaming layout renderer and math isolation matrix
```

---

## 🚀 Deployment & Hydration Protocol

Scribe-LLM is engineered as an entirely relocatable, self-contained workspace environment. It utilizes an OS-gnostic, hermetic bootstrapping engine that automates target core extraction and isolates execution layers from the host system dependencies.

### 1. Pre-Flight Architecture Constraints
* **State Cleanliness:** No pre-existing system-wide software tracking packages, compilation toolchains, or global virtual environments are required.
* **Network Capabilities:** Direct standard library network streams are deployed for asset fetching, avoiding rate-limiting barriers or external CLI configuration requirements.

### 2. Structural Workspace Provisioning
Initialize the self-healing control plane by launching the core provisioner from the workspace root. The orchestrator automatically maps internal dependency topologies, detects local hardware compute engines, and binds isolated runtimes.

```bash
# Execute standard hydration track using default interactive prompt sequence
python setup.py

# Force clean-room purge of compilation layers and lock environment track to explicit distribution version
python setup.py --python 3.14.5 --update
```

### 3. Execution Control Matrix
* `--python [version]`: Forces absolute runtime track pinning (`3.10.11` through `3.14.5`), fetching static standalone binaries directly into local containment storage frames (`.venv/`).
* `--update`: Triggers immediate, non-destructive extraction purges across local artifact boundaries and compilation environments, refreshing state blocks while preserving model checkpoint storage (`models/`).

### 4. Deterministic Lockdown & Ignition
Upon successful execution, the pipeline serializes the environment state space into an immutable configuration lock file (`constraints.lock`). This locks down package constraints to guarantee zero upstream dependency drift over long-term operations.

Launch the local system interface container using the tailored environment bootstrap script created for the host operating system context:

```bash
# Windows Infrastructure Launch Sequence
.\start.bat

# POSIX Infrastructure Launch Sequence (Linux / macOS)
./start.sh
```

---

## 🎛️ Operator Overrides vs. Adaptive Space

Scribe-LLM balances automated adjustments with explicit operator control:
* **Adaptive Defaults:** The interface leaves options like context sizes and offload layers in their default state. The core physics engine scales variables automatically as you swap models, ensuring optimal performance based on real-time resource availability.
* **Manual Overrides:** Interacting with any configuration slider activates a manual override flag (`userOverrides: true`), locking your choices in. The background engine respects your locked settings, dynamically modifying the remaining parameters to keep memory allocations stable and protect the system from crashes.
* **The Optimization Reset:** To clear manual adjustments and return to system optimization, simply double-click any slider label row. The parameter snaps back to its mathematically ideal calculated value automatically.

---

## 📚 Academic Foundations Reference Index

* **Self-Steering & Sequential Monte Carlo (SMC):** Grand, G., Tenenbaum, J. B., Mansinghka, V. K., Lew, A. K., & Andreas, J. (2025). *Self-Steering Language Models*. (MIT / Yale). 
* **Recursive Language Models (RLM):** Zhang, A. L., Kraska, T., & Khattab, O. (2026). *Recursive Language Models*. (MIT CSAIL).
* **Recursive Reasoning with Tiny Networks:** Jolicoeur-Martineau, A. (2025). *Less is More: Recursive Reasoning with Tiny Networks*. (Samsung SAIL Montréal).
* **Grammar-Constrained Decoding (GCD) Optimization:** Hamilton, S., & Mimno, D. (2025). *Lost in Space: Optimizing Tokens for Grammar-Constrained Decoding*. (Cornell University).
* **Attention Compression (CSA/HCA):** DeepSeek-AI (2025). *DeepSeek-V4: Towards Highly Efficient Million-Token Context Intelligence*.
