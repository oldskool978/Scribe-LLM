import os
import sys
import stat
import json
import shutil
import argparse
import subprocess
import time
from pathlib import Path

__REAL_STDOUT_FD = os.dup(1)
__REAL_STDOUT = os.fdopen(__REAL_STDOUT_FD, 'w')
os.dup2(sys.stderr.fileno(), 1)
sys.stdout = sys.stderr

def send_json_payload(data: dict):
    __REAL_STDOUT.write(f"[DATA] {json.dumps(data)}\n")
    __REAL_STDOUT.flush()

PROJECT_ROOT = Path(__file__).parent.parent.resolve()
TARGET_DIR = Path(os.environ.get("SCRIBE_LMCPP_DIR", PROJECT_ROOT / "LMCPP"))
OUTPUT_DIR = Path(os.environ.get("SCRIBE_MODELS_DIR", PROJECT_ROOT / "models"))
STAGING_DIR = Path(os.environ.get("SCRIBE_STAGING_DIR", PROJECT_ROOT / "staging_acquisition"))
LOCAL_HF_CACHE = Path(os.environ.get("SCRIBE_HF_CACHE", PROJECT_ROOT / ".hf_cache"))

os.environ["HF_HOME"] = str(LOCAL_HF_CACHE)
os.environ["HF_HUB_CACHE"] = str(LOCAL_HF_CACHE)
os.environ["HF_HUB_DISABLE_IMPLICIT_TOKEN"] = "1"
os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"

CALIBRATION_CORPUS_DATA = r"""The sun is bright. The water is cold. The rock is hard. The fire is hot. A tree grows from the ground. Rain falls from the sky. Animals look for food to eat. People build houses with wood and stone. Work requires time and energy. A heavy stone is hard to move. A sharp knife cuts clean. A good tool helps do work faster.

<context>
<vfs_state>
<file name="sort_engine.py">
def quicksort(arr):
    if len(arr) <= 1:
        return arr
    pivot = arr[len(arr) // 2]
    left = [x for x in arr if x < pivot]
    middle = [x for x in arr if x == pivot]
    right = [x for x in arr if x > pivot]
    return quicksort(left) + middle + quicksort(right)
</file>
</vfs_state>

<latent_state_summary>
The conservation of energy principle states that the total energy of an isolated system remains constant over time. Energy can neither be created nor destroyed; rather, it can only be transformed or transferred from one form to another. In classical thermodynamics, the first law is expressed differentially as dU = dQ - dW, where dU represents the change in internal energy, dQ represents heat added, and dW represents work done by the system.
</latent_state_summary>
</context>

<directive>
Analyze the provided sorting sequence and verify the operational complexity coordinates under variable input bounds.
</directive>

<think>
We evaluate the structural execution profile of the sorting algorithm step-by-step. The split-point choice maps to an expected average-case time complexity of O(n log n). The execution trace isolates individual slices down to baseline constraints.
</think>
<status>resolved</status>

| Measurement Parameter | Target Threshold | Upper Bound Limit | Baseline Standard |
|---|---|---|---|
| Temperature Channel  | 273.15            | 373.15            | 298.15            |
| Pressure Field        | 101.325           | 202.650           | 101.325           |
| Velocity Vector       | 0.000             | 15.450            | 1.250             |

<context>
<vfs_state>
<file name="tree_traversal.py">
class Node:
    def __init__(self, key):
        self.left = None
        self.right = None
        self.val = key

def inorder_traversal(root, result):
    if root:
        inorder_traversal(root.left, result)
        result.append(root.val)
        inorder_traversal(root.right, result)
</file>
</vfs_state>

<latent_state_summary>
The second law of thermodynamics establishes the concept of entropy as a physical property of a thermodynamic system. It dictates that the total entropy of an isolated system can never decrease over time; closed systems spontaneously evolve toward thermodynamic equilibrium, the state of maximum entropy. This implies that natural processes are irreversible, producing a net entropy generation expressed as dS >= 0.
</latent_state_summary>
</context>

<directive>
Interrogate the structural binary tree context layout and extract the contiguous scalar coordinates.
</directive>

<rlm_exec>
import json
tree_data = [10, 20, 30, 40, 50]
print(json.dumps({"traversal_sequence": tree_data}))
</rlm_exec>
<rlm_result>
{"traversal_sequence": [10, 20, 30, 40, 50]}
</rlm_result>
<status>resolved</status>

{
    "target_schema": "cognitive_chat.json",
    "system_telemetry": {
        "status_code": 200,
        "is_active": true,
        "metrics_array": [0.124, -0.541, 0.451],
        "bounds_evaluation": {
            "lower_limit": 0.001,
            "upper_limit": 0.999
        }
    }
}

<context>
<vfs_state>
<file name="matrix_ops.py">
def multiply_matrices(matrix_a, matrix_b):
    rows_a, cols_a = len(matrix_a), len(matrix_a[0])
    rows_b, cols_b = len(matrix_b), len(matrix_b[0])
    result = [[0.0 for _ in range(cols_b)] for _ in range(rows_a)]
    for i in range(rows_a):
        for j in range(cols_b):
            for k in range(cols_a):
                result[i][j] += matrix_a[i][k] * matrix_b[k][j]
    return result
</file>
</vfs_state>

<latent_state_summary>
In probability theory and statistical mechanics, the central limit theorem establishes that, given certain conditions, the arithmetic mean of a sufficiently large number of iterates of independent random variables, each with a well-defined expected value and well-defined variance, will be approximately normally distributed, regardless of the underlying distribution. This continuous distribution is characterized by the Gaussian probability density function.
</latent_state_summary>
</context>

<directive>
Derive transformations across continuous coordinate domains using standard analytical field equations.
</directive>

<think>
Analyze the physical and mathematical invariants governing signal processing and information state tracking loops.

The fundamental definition of the continuous Fourier transform maps a time-domain signal into a continuous frequency-domain representation:
$$F(\omega) = \int_{-\infty}^{\infty} f(t) e^{-i \omega t} dt$$

The absolute mathematical representation of Shannon information entropy defines the measure of expected uncertainty contained within a discrete probability distribution:
$$H(X) = -\sum_{i=1}^{n} P(x_i) \log_2 P(x_i)$$

The standard normal distribution function, also known as the Gaussian distribution, characterizes a symmetric continuous probability density function:
$$f(x) = \frac{1}{\sigma \sqrt{2\pi}} e^{-\frac{(x-\mu)^2}{2\sigma^2}}$$

Maxwell's electromagnetic field formulation establishes the absolute foundational relationship between electric fields, magnetic fields, electric charge, and electric current:
$$\oint_{C} \mathbf{B} \cdot d\mathbf{l} = \mu_0 \iint_{S} \mathbf{J} \cdot d\mathbf{A} + \mu_0 \epsilon_0 \frac{\partial}{\partial t} \iint_{S} \mathbf{E} \cdot d\mathbf{A}$$

The relative informational entropy drift between two distinct probability distributions is precisely measured by the Kullback-Leibler divergence formula:
$$D_{KL}(P \parallel Q) = \sum_{x \in \mathcal{X}} P(x) \log \left( \frac{P(x)}{Q(x)} \right)$$
</think>

<artifact identifier="compiled_artifact.py" language="python">
def verify_predicate_logic(all_elements_satisfy, target_element):
    if all_elements_satisfy and target_element is not None:
        return True
    return False
</artifact>
<status>resolved</status>

Linear transformation operations preserve the mathematical properties of vector addition and scalar multiplication inside continuous coordinate vector spaces. If statement A implies statement B, and statement B implies statement C, then statement A implies statement C by pure hypothetical syllogism."""

def print_log(msg: str):
    sys.stderr.write(f"{msg}\n")
    sys.stderr.flush()

def ensure_hf_lib():
    try:
        import huggingface_hub
        return huggingface_hub
    except ImportError:
        print_log("[SYSTEM ERROR] Python 'huggingface_hub' library missing from localized environment.")
        sys.exit(1)

def remove_readonly(func, path, *args, **kwargs):
    for _ in range(8):
        try:
            os.chmod(path, stat.S_IWRITE)
            func(path)
            return
        except Exception:
            time.sleep(0.2)

def execute_gc(state: str):
    import gc; gc.collect()
    if state == "pre_flight":
        try:
            shutil.rmtree(STAGING_DIR, onerror=remove_readonly)
        except Exception:
            pass
    elif state == "post_success":
        print_log("[PHASE 5] Executing Aggressive Storage Reallocation (Purging Dead Blobs)...")
        time.sleep(1.0)
        try:
            shutil.rmtree(STAGING_DIR, onerror=remove_readonly)
        except Exception:
            pass
        try:
            shutil.rmtree(LOCAL_HF_CACHE, onerror=remove_readonly)
        except Exception:
            pass
    elif state == "post_fail":
        print_log("[CLEANUP] Preserving .hf_cache for future download resumption...")
        try:
            shutil.rmtree(STAGING_DIR, onerror=remove_readonly)
        except Exception:
            pass

def inspect_config_topology(config_path: Path) -> dict:
    topology = {"is_moe": False, "is_multimodal": False, "has_mtp": False, "vocab_type": None, "is_pre_quantized": False}
    if not config_path.exists():
        return topology
    try:
        with open(config_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
            
            sub_configs = [data]
            for sub_key in ["thinker_config", "talker_config", "text_config", "vision_config", "audio_config", "speaker_encoder_config"]:
                sub_val = data.get(sub_key)
                if isinstance(sub_val, dict):
                    sub_configs.append(sub_val)
                    for inner_key in ["vision_config", "audio_config", "text_config"]:
                        if isinstance(sub_val.get(inner_key), dict):
                            sub_configs.append(sub_val[inner_key])

            archs = data.get("architectures", [])
            arch_str = "".join(archs).lower()

            for cfg in sub_configs:
                if (
                    cfg.get("num_local_experts", 0) > 0 or 
                    cfg.get("n_experts", 0) > 0 or
                    cfg.get("num_experts", 0) > 0 or
                    cfg.get("n_routed_experts", 0) > 0 or
                    cfg.get("expert_model") is not None
                ):
                    topology["is_moe"] = True
                    
                multimodal_anchors = ["vision_config", "vision_encoder", "audio_config", "whisper_config", "speaker_encoder_config", "image_size", "num_mel_bins"]
                if any(k in cfg for k in multimodal_anchors):
                    topology["is_multimodal"] = True

            if "mixtral" in arch_str or "deepseek" in arch_str or "moe" in arch_str:
                topology["is_moe"] = True

            if "omni" in arch_str or "vl" in arch_str or "tts" in arch_str or "asr" in arch_str:
                topology["is_multimodal"] = True
                
            if "mtp" in arch_str or "multitoken" in arch_str:
                topology["has_mtp"] = True
                
            config_flat = json.dumps(data).lower()
            if (
                "quantization_config" in config_flat or
                "nvfp4" in config_flat or
                "fp8" in config_flat or
                "gptq" in config_flat or
                "awq" in config_flat
            ):
                topology["is_pre_quantized"] = True
                
            model_type = data.get("model_type", "").lower()
            if "gemma" in model_type:
                topology["vocab_type"] = "bpe"
    except (json.JSONDecodeError, KeyError) as e:
        print_log(f"[WARNING] Structural anomaly detected in topology config: {e}")
    except Exception as e:
        print_log(f"[WARNING] Unhandled exception processing repository metadata: {e}")
    return topology

def run_probe(repo_id: str, token: str):
    hf = ensure_hf_lib()
    api = hf.HfApi(token=token)
    try:
        repo_info = api.model_info(repo_id=repo_id, files_metadata=True)
        files = [f for f in repo_info.siblings]
        
        gguf_files = [{"name": f.rfilename, "size": f.size} for f in files if f.rfilename.endswith('.gguf')]
        is_moe, is_multimodal, has_mtp, requires_jinja = False, False, False, False
        is_pre_quantized = False
        vocab_type = None
        
        if any(f.rfilename == "config.json" for f in files):
            try:
                config_path = hf.hf_hub_download(repo_id=repo_id, filename="config.json", token=token, cache_dir=LOCAL_HF_CACHE)
                top = inspect_config_topology(Path(config_path))
                is_moe = top["is_moe"]
                is_multimodal = top["is_multimodal"]
                has_mtp = top["has_mtp"]
                vocab_type = top["vocab_type"]
                is_pre_quantized = top["is_pre_quantized"]
            except Exception:
                pass
            
        if any(f.rfilename == "tokenizer_config.json" for f in files):
            try:
                tok_path = hf.hf_hub_download(repo_id=repo_id, filename="tokenizer_config.json", token=token, cache_dir=LOCAL_HF_CACHE)
                with open(tok_path, 'r', encoding='utf-8') as f:
                    tok_data = json.load(f)
                    if "chat_template" in tok_data:
                        requires_jinja = True
            except Exception:
                pass

        safetensors_files = [f for f in files if f.rfilename.endswith(".safetensors")]
        bin_files = [f for f in files if f.rfilename.endswith(".bin")]
        gguf_files_check = [f for f in files if f.rfilename.endswith(".gguf")]

        if safetensors_files:
            repo_size_bytes = sum(f.size for f in safetensors_files if f.size is not None)
        elif bin_files:
            repo_size_bytes = sum(f.size for f in bin_files if f.size is not None)
        elif gguf_files_check:
            repo_size_bytes = sum(f.size for f in gguf_files_check if f.size is not None)
        else:
            repo_size_bytes = sum(f.size for f in files if f.size is not None)
        
        send_json_payload({
            "status": "success",
            "is_gguf_repo": len(gguf_files) > 0,
            "gguf_files": gguf_files,
            "is_moe": is_moe,
            "is_multimodal": is_multimodal,
            "has_mtp": has_mtp,
            "vocab_type": vocab_type,
            "requires_jinja": requires_jinja,
            "is_pre_quantized": is_pre_quantized,
            "repo_size_bytes": repo_size_bytes
        })
        
    except Exception as e:
        send_json_payload({"status": "error", "message": str(e)})
        sys.exit(1)
    finally:
        execute_gc("post_fail")

class DAGContext:
    def __init__(self, repo_id: str, token: str, profile: str, requires_jinja: bool, is_direct: bool):
        self.repo_id = repo_id
        self.token = token
        self.profile = profile.upper() if profile else "BF16"
        self.requires_jinja = requires_jinja
        self.is_direct = is_direct
        
        self.safe_repo_name = repo_id.replace("/", "_")
        self.safe_basename = repo_id.split('/')[-1].replace("/", "_")
        self.model_staging_dir = STAGING_DIR / self.safe_repo_name
        
        self.native_types = ["F16", "F32", "BF16", "F8_E4M3", "F8_E5M2", "AUTO"]
        self.is_native_pass = self.profile in self.native_types
        self.base_out_type = self.profile.lower() if self.is_native_pass else "auto"
        
        self.requires_imatrix = not self.is_native_pass and (
            self.profile.startswith("IQ") or 
            self.profile in ["Q2_K", "Q3_K_S", "Q3_K_M", "Q3_K_L", "Q4_0", "Q4_1", "Q4_K_S", "Q4_K_M"]
        )
        
        self.out_base = OUTPUT_DIR / f"{self.safe_basename}-{self.base_out_type.upper()}.gguf"
        self.out_quant = OUTPUT_DIR / f"{self.safe_basename}-{self.profile}.gguf"
        self.imatrix_path = self.model_staging_dir / "scribe_computed.imatrix"
        self.corpus_path = self.model_staging_dir / "scribe_entropy_corpus.txt"
        
        self.topology = {}
        self.hermetic_env = {}
        self.captured_base_shards = []

class DAGExecutionEngine:
    def __init__(self, ctx: DAGContext):
        self.ctx = ctx
        self.completed_early = False

    def execute(self):
        self.node_preflight_validation()
        if self.completed_early:
            print_log("[DAG ENGINE] Target permutation verified in structural storage. Resolution closed.")
            return
            
        self.node_immutable_download()
        self.node_base_conversion()
        
        if not self.ctx.is_native_pass:
            if self.ctx.requires_imatrix:
                self.node_fixed_entropy_corpus()
                self.node_importance_matrix_compiler()
            self.node_shard_differential_quantizer()
            self.node_zero_leak_cleanup()

    def node_preflight_validation(self):
        print_log("[DAG NODE 1] Initializing Pre-Flight State Space Verification Matrix...")
        LOCAL_HF_CACHE.mkdir(exist_ok=True, parents=True)
        STAGING_DIR.mkdir(exist_ok=True, parents=True)
        OUTPUT_DIR.mkdir(exist_ok=True, parents=True)
        
        if self.ctx.is_direct:
            out_file = OUTPUT_DIR / self.ctx.profile
            if out_file.exists():
                print_log(f"[SUCCESS] Direct payload target '{self.ctx.profile}' verified in payload bay.")
                self.completed_early = True
            return

        if not self.ctx.is_native_pass and self.ctx.out_quant.exists():
            print_log(f"[SUCCESS] Target high-density artifact '{self.ctx.out_quant.name}' already exists.")
            self.completed_early = True
            return
            
        if self.ctx.is_native_pass and self.ctx.out_base.exists():
            print_log(f"[SUCCESS] Target native precision artifact '{self.ctx.out_base.name}' already exists.")
            self.completed_early = True
            return

    def node_immutable_download(self):
        if self.completed_early: return
        print_log("[DAG NODE 2] Launching Immutable Local Repository Download Vector...")
        hf = ensure_hf_lib()
        
        if self.ctx.is_direct:
            print_log(f"  -> Path A: Executing Direct Payload Fetch for '{self.ctx.profile}'")
            hf.hf_hub_download(
                repo_id=self.ctx.repo_id, 
                filename=self.ctx.profile, 
                token=self.ctx.token, 
                cache_dir=LOCAL_HF_CACHE,
                local_dir=OUTPUT_DIR,
                local_dir_use_symlinks=False
            )
            print_log("[SUCCESS] Direct transfer sequence finalized.")
            self.completed_early = True
            return

        print_log("  -> Path B: Initiating Snapshot Ingestion for Base Layer Tensors...")
        api = hf.HfApi(token=self.ctx.token)
        repo_info = api.model_info(repo_id=self.ctx.repo_id, files_metadata=True)
        
        safetensors_files = [f for f in repo_info.siblings if f.rfilename.endswith(".safetensors")]
        bin_files = [f for f in repo_info.siblings if f.rfilename.endswith(".bin")]

        if safetensors_files:
            repo_size_bytes = sum(f.size for f in safetensors_files if f.size is not None)
            ignore_patterns = ["*.msgpack", "*.h5", "*.ot", "*.bin"]
        elif bin_files:
            repo_size_bytes = sum(f.size for f in bin_files if f.size is not None)
            ignore_patterns = ["*.msgpack", "*.h5", "*.ot"]
        else:
            repo_size_bytes = sum(f.size for f in repo_info.siblings if f.size is not None)
            ignore_patterns = ["*.msgpack", "*.h5", "*.ot"]

        hf.snapshot_download(
            repo_id=self.ctx.repo_id,
            local_dir=self.ctx.model_staging_dir,
            cache_dir=LOCAL_HF_CACHE,
            token=self.ctx.token,
            ignore_patterns=ignore_patterns
        )
        
        self.ctx.topology = inspect_config_topology(self.ctx.model_staging_dir / "config.json")
        
        if self.ctx.topology.get("is_pre_quantized") and not self.ctx.is_native_pass:
            print_log("  -> Pre-quantized layout found. Forcing internal python dequantization by modifying output flag to F16.")
            self.ctx.base_out_type = "f16"
            self.ctx.out_base = OUTPUT_DIR / f"{self.ctx.safe_basename}-F16.gguf"
            
        multiplier = 4.2 if self.ctx.topology["is_moe"] else (3.2 if self.ctx.topology["is_multimodal"] else 2.5)
        required_space = repo_size_bytes * multiplier
        free_space = shutil.disk_usage(PROJECT_ROOT).free

        if required_space > free_space:
            raise RuntimeError(f"Hardware Exhaustion Risk: Required contiguous free allocation ~{required_space / (1024**3):.2f}GB. Available workspace allocation: {free_space / (1024**3):.2f}GB. Halting Graph execution.")

    def node_base_conversion(self):
        if self.completed_early:
            return
        print_log("[DAG NODE 3] Initializing Base Architecture Core Tensor Conversion...")
        
        paths = [
            str(TARGET_DIR),
            str(TARGET_DIR / "gguf-py"),
            str(TARGET_DIR / "conversion"),
            str(TARGET_DIR / "convert")
        ]
        
        base_pythonpath = os.environ.get("PYTHONPATH", "")
        if base_pythonpath:
            clean_paths = []
            for p in base_pythonpath.split(os.pathsep):
                p_norm = os.path.normpath(p).lower()
                if not any(bad in p_norm for bad in (r"\python", r"\conda", r"\miniconda", r"appdata\roaming")):
                    clean_paths.append(p)
            paths.extend(clean_paths)

        bootstrap_payload = (
            "import sys, types, runpy, os, re\n"
            f"for p in {json.dumps(paths)}:\n"
            "    if p not in sys.path: sys.path.insert(0, p)\n"
            "class UniversalMock:\n"
            "    def __init__(self, name='__mock__'):\n"
            "        object.__setattr__(self, '__name__', name)\n"
            "    def __getattr__(self, name):\n"
            "        if name.startswith('__') and name.endswith('__'): raise AttributeError(name)\n"
            "        return UniversalMock(name)\n"
            "    def __call__(self, *args, **kwargs):\n"
            "        return UniversalMock()\n"
            "    def __bool__(self):\n"
            "        return False\n"
            "    def __iter__(self):\n"
            "        return iter([])\n"
            "    def __getitem__(self, key):\n"
            "        return self\n"
            "    def __setattr__(self, name, value): pass\n"
            "    def __setitem__(self, key, value): pass\n"
            "    def __mro_entries__(self, bases):\n"
            "        return (object,)\n"
            "    def __repr__(self):\n"
            "        return f'<UniversalMock {self.__name__}>'\n"
            "class SubsystemInterceptorModule(types.ModuleType):\n"
            "    def __init__(self, name):\n"
            "        super().__init__(name)\n"
            "        self.__path__ = []\n"
            "    def __getattr__(self, name):\n"
            "        if name.startswith('__') and name.endswith('__'): raise AttributeError(name)\n"
            "        return UniversalMock(name)\n"
            "class HermeticSubsystemImportHook:\n"
            "    def __init__(self, prefixes):\n"
            "        self.prefixes = prefixes\n"
            "        self.modules = {}\n"
            "    def find_spec(self, fullname, path, target=None):\n"
            "        if any(fullname == p or fullname.startswith(p + '.') for p in self.prefixes):\n"
            "            from importlib.machinery import ModuleSpec\n"
            "            return ModuleSpec(fullname, self, is_package=True)\n"
            "        return None\n"
            "    def create_module(self, spec):\n"
            "        if spec.name not in self.modules:\n"
            "            self.modules[spec.name] = SubsystemInterceptorModule(spec.name)\n"
            "        return self.modules[spec.name]\n"
            "    def exec_module(self, module): pass\n"
            "sys.meta_path.insert(0, HermeticSubsystemImportHook([\n"
            "    'torch.distributed',\n"
            "    'torch._C._distributed_c10d'\n"
            "]))\n"
            "def _apply_conversion_polyills():\n"
            "    try:\n"
            "        import gguf\n"
            "        from conversion.base import ModelBase\n"
            "        _orig_init = ModelBase.__init__\n"
            "        def _poly_init(self, *args, **kwargs):\n"
            "            _orig_init(self, *args, **kwargs)\n"
            "            if getattr(self, 'fuse_gate_up_exps', False):\n"
            "                t_map = getattr(self, 'tensor_map', None)\n"
            "                if t_map is not None and gguf.MODEL_TENSOR.FFN_GATE_UP_EXP not in t_map.mapping:\n"
            "                    self.fuse_gate_up_exps = False\n"
            "        ModelBase.__init__ = _poly_init\n"
            "        _orig_modify = ModelBase.modify_tensors\n"
            "        def _poly_modify(self, data_torch, name, bid):\n"
            "            t_map = getattr(self, 'tensor_map', None)\n"
            "            if getattr(self, 'fuse_gate_up_exps', False) and t_map is not None:\n"
            "                if gguf.MODEL_TENSOR.FFN_GATE_UP_EXP not in t_map.mapping:\n"
            "                    self.fuse_gate_up_exps = False\n"
            "            if not getattr(self, 'fuse_gate_up_exps', False):\n"
            "                if name.endswith(('mlp.experts.gate_proj.weight', 'mlp.experts.gate_proj')):\n"
            "                    yield (self.format_tensor_name(gguf.MODEL_TENSOR.FFN_GATE_EXP, bid, '.weight'), data_torch)\n"
            "                    return\n"
            "                if name.endswith(('mlp.experts.up_proj.weight', 'mlp.experts.up_proj')):\n"
            "                    yield (self.format_tensor_name(gguf.MODEL_TENSOR.FFN_UP_EXP, bid, '.weight'), data_torch)\n"
            "                    return\n"
            "                if name.endswith(('mlp.experts.down_proj.weight', 'mlp.experts.down_proj')):\n"
            "                    yield (self.format_tensor_name(gguf.MODEL_TENSOR.FFN_DOWN_EXP, bid, '.weight'), data_torch)\n"
            "                    return\n"
            "            yield from _orig_modify(self, data_torch, name, bid)\n"
            "        ModelBase.modify_tensors = _poly_modify\n"
            "    except Exception:\n"
            "        pass\n"
            "    try:\n"
            "        import torch\n"
            "        from conversion.qwen import Qwen2MoeModel\n"
            "        _orig_qwen2_modify = Qwen2MoeModel.modify_tensors\n"
            "        def _poly_qwen2_modify(self, data_torch, name, bid):\n"
            "            is_unbundled = bool(re.search(r'\\.experts\\.\\d+\\.', name))\n"
            "            if is_unbundled:\n"
            "                n_exp = self.find_hparam(['num_local_experts', 'num_experts'])\n"
            "                if bid is not None:\n"
            "                    if self._experts is None:\n"
            "                        self._experts = [{} for _ in range(self.block_count)]\n"
            "                    self._experts[bid][name] = data_torch\n"
            "                    if len(self._experts[bid]) >= n_exp * 3:\n"
            "                        for w_name in ['down_proj', 'gate_proj', 'up_proj']:\n"
            "                            datas = []\n"
            "                            for xid in range(n_exp):\n"
            "                                ename = f'model.layers.{bid}.mlp.experts.{xid}.{w_name}.weight'\n"
            "                                if ename not in self._experts[bid]:\n"
            "                                    ename = f'thinker.model.layers.{bid}.mlp.experts.{xid}.{w_name}.weight'\n"
            "                                if ename in self._experts[bid]:\n"
            "                                    datas.append(self._experts[bid][ename])\n"
            "                                    del self._experts[bid][ename]\n"
            "                            if len(datas) == n_exp:\n"
            "                                data_torch = torch.stack(datas, dim=0)\n"
            "                                merged_name = f'model.layers.{bid}.mlp.experts.{w_name}.weight'\n"
            "                                yield from ModelBase.modify_tensors(self, data_torch, merged_name, bid)\n"
            "                        return\n"
            "                    else:\n"
            "                        return\n"
            "            if name.endswith(('mlp.experts.gate_proj.weight', 'mlp.experts.up_proj.weight', 'mlp.experts.down_proj.weight')):\n"
            "                yield from ModelBase.modify_tensors(self, data_torch, name, bid)\n"
            "                return\n"
            "            yield from _orig_qwen2_modify(self, data_torch, name, bid)\n"
            "        Qwen2MoeModel.modify_tensors = _poly_qwen2_modify\n"
            "    except Exception:\n"
            "        pass\n"
            "    try:\n"
            "        from conversion.qwen3vl import Qwen3OmniMmprojModel, MmprojModel\n"
            "        def _poly_omni_filter(cls, item):\n"
            "            name, gen = item\n"
            "            if name.startswith('lm_head.') or name.startswith('mtp.'): return None\n"
            "            if name.startswith('thinker.visual.'): name = name.replace('thinker.visual.', 'visual.', 1)\n"
            "            elif name.startswith('model.visual.'): name = name.replace('model.visual.', 'visual.', 1)\n"
            "            elif name.startswith('thinker.audio_tower.'): name = name.replace('thinker.audio_tower.', 'audio_tower.', 1)\n"
            "            if not name.startswith('visual.') and not name.startswith('audio_tower.'): return None\n"
            "            return MmprojModel.filter_tensors((name, gen))\n"
            "        Qwen3OmniMmprojModel.filter_tensors = classmethod(_poly_omni_filter)\n"
            "    except Exception:\n"
            "        pass\n"
            "_apply_conversion_polyills()\n"
            "runpy.run_path(sys.argv.pop(1), run_name='__main__')\n"
        )

        cmd_convert = [
            sys.executable, "-u", "-c", bootstrap_payload,
            str(TARGET_DIR / "convert_hf_to_gguf.py"),
            str(self.ctx.model_staging_dir), "--outfile", str(self.ctx.out_base), "--outtype", self.ctx.base_out_type
        ]
        
        if self.ctx.topology.get("is_moe"):
            cmd_convert.append("--fuse-gate-up-exps")
        if self.ctx.topology.get("has_mtp"):
            cmd_convert.append("--no-mtp")
            
        self.ctx.hermetic_env = os.environ.copy()
        self.ctx.hermetic_env.pop("PYTHONHOME", None)
        self.ctx.hermetic_env["PYTHONPATH"] = os.pathsep.join(paths)

        existing_files = set(OUTPUT_DIR.iterdir())

        process = subprocess.Popen(
            cmd_convert, 
            cwd=str(TARGET_DIR),
            env=self.ctx.hermetic_env,
            stdout=subprocess.PIPE, 
            stderr=subprocess.STDOUT, 
            text=True, 
            encoding='utf-8', 
            errors='replace'
        )
        for line in process.stdout:
            print_log(line.strip())
        process.wait()
        
        if process.returncode != 0: 
            raise RuntimeError(f"Base architectural transformation failed with exit code: {process.returncode}")

        current_files = set(OUTPUT_DIR.iterdir())
        self.ctx.captured_base_shards = sorted([f for f in (current_files - existing_files) if f.is_file()])
        
        if not self.ctx.captured_base_shards:
            raise FileNotFoundError("Footprint tracking failure: Base compiler did not write structural output files.")

        existing_files = set(OUTPUT_DIR.iterdir())

        if self.ctx.topology.get("is_multimodal"):
            target_mmproj_name = OUTPUT_DIR / f"{self.ctx.safe_basename}-mmproj.gguf"
            print_log("[DAG NODE 3b] Executing Secondary Multi-Modal Projector Extraction Pass...")
            
            cmd_projector = [
                sys.executable, "-u", "-c", bootstrap_payload,
                str(TARGET_DIR / "convert_hf_to_gguf.py"),
                str(self.ctx.model_staging_dir), "--outfile", str(target_mmproj_name),
                "--outtype", "f16", "--mmproj"
            ]
            
            proj_process = subprocess.Popen(cmd_projector, cwd=str(TARGET_DIR), env=self.ctx.hermetic_env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
            for line in proj_process.stdout:
                print_log(line.strip())
            proj_process.wait()
            
            if proj_process.returncode == 0:
                print_log(f"[SUCCESS] Vision/Audio projection matrices bound to payload bay: {target_mmproj_name.name}")
            else:
                print_log(f"[ERROR] Multimodal projector extraction failed with code: {proj_process.returncode}")

        if self.ctx.topology.get("has_mtp"):
            target_mtp_name = OUTPUT_DIR / f"mtp-{self.ctx.safe_basename}-{self.ctx.profile}.gguf"
            print_log("[DAG NODE 3c] Executing Secondary Speculative MTP Shard Extraction Pass...")
            
            cmd_mtp = [
                sys.executable, "-u", "-c", bootstrap_payload,
                str(TARGET_DIR / "convert_hf_to_gguf.py"),
                str(self.ctx.model_staging_dir), "--outfile", str(target_mtp_name),
                "--outtype", self.ctx.base_out_type, "--mtp"
            ]
            
            mtp_process = subprocess.Popen(cmd_mtp, cwd=str(TARGET_DIR), env=self.ctx.hermetic_env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
            for line in mtp_process.stdout:
                print_log(line.strip())
            mtp_process.wait()
            
            if mtp_process.returncode == 0:
                print_log(f"[SUCCESS] Speculative MTP draft arrays bound to payload bay: {target_mtp_name.name}")
            else:
                print_log(f"[ERROR] Speculative MTP draft extraction failed with code: {mtp_process.returncode}")

    def node_fixed_entropy_corpus(self):
        if self.completed_early: return
        print_log("[DAG NODE 4] Deploying Fixed-Entropy Synthetic Calibration Corpus Matrix...")
        try:
            with open(self.ctx.corpus_path, 'w', encoding='utf-8') as f:
                f.write(CALIBRATION_CORPUS_DATA.strip())
        except Exception as e:
            raise RuntimeError(f"Failed to forge local calibration corpus matrix file: {str(e)}")

    def node_importance_matrix_compiler(self):
        if self.completed_early: return
        print_log("[DAG NODE 5] Compiling High-Fidelity Importance Weights via llama-imatrix...")
        
        imatrix_bin = TARGET_DIR / ("llama-imatrix.exe" if os.name == 'nt' else "llama-imatrix")
        if not imatrix_bin.exists():
            print_log("[WARNING] llama-imatrix binary missing from execution environment. Bypassing activation optimization pass.")
            self.ctx.requires_imatrix = False
            return

        cpu_cores = os.cpu_count() or 4
        optimal_threads = min(16, max(1, cpu_cores // 2))
        if cpu_cores > 32:
            optimal_threads = 16

        primary_shard = self.ctx.captured_base_shards[0]
        cmd_imatrix = [
            str(imatrix_bin), 
            "-m", str(primary_shard), 
            "-f", str(self.ctx.corpus_path), 
            "-o", str(self.ctx.imatrix_path),
            "-t", str(optimal_threads)
        ]
        
        process = subprocess.Popen(
            cmd_imatrix, 
            cwd=str(TARGET_DIR),
            env=self.ctx.hermetic_env,
            stdout=subprocess.PIPE, 
            stderr=subprocess.STDOUT, 
            text=True, 
            encoding='utf-8', 
            errors='replace'
        )
        for line in process.stdout: print_log(line.strip())
        process.wait()
        
        if process.returncode != 0:
            print_log(f"[WARNING] Importance matrix derivation exited with code {process.returncode}. Falling back to standard quantization parameters.")
            self.ctx.requires_imatrix = False

    def node_shard_differential_quantizer(self):
        if self.completed_early: return
        print_log(f"[DAG NODE 6] Forging Target High-Density Tensor Array Profile ({self.ctx.profile})...")
        
        quant_bin = TARGET_DIR / ("llama-quantize.exe" if os.name == 'nt' else "llama-quantize")
        primary_shard = self.ctx.captured_base_shards[0]
        
        cmd_quant = [str(quant_bin)]
        
        if self.ctx.requires_imatrix and self.ctx.imatrix_path.exists():
            print_log("  -> Injecting computed activation matrices into compression layers.")
            cmd_quant.extend(["--imatrix", str(self.ctx.imatrix_path)])
            
        cmd_quant.extend([str(primary_shard), str(self.ctx.out_quant), self.ctx.profile])
        
        process = subprocess.Popen(
            cmd_quant, 
            cwd=str(TARGET_DIR),
            env=self.ctx.hermetic_env,
            stdout=subprocess.PIPE, 
            stderr=subprocess.STDOUT, 
            text=True, 
            encoding='utf-8', 
            errors='replace'
        )
        for line in process.stdout: print_log(line.strip())
        process.wait()
        
        if process.returncode != 0: 
            raise RuntimeError(f"Quantization compression engine failed with exit status: {process.returncode}")

    def node_zero_leak_cleanup(self):
        if self.completed_early: return
        print_log("[DAG NODE 7] Executing Clean-Room Storage Reclamation Loop...")
        for shard in self.ctx.captured_base_shards:
            try:
                if shard.exists(): shard.unlink()
            except Exception as e:
                print_log(f"  -> [CLEANUP WARNING] Non-fatal exception unlinking base file: {str(e)}")

def run_execute(repo_id: str, token: str, profile: str, requires_jinja: bool, is_direct: bool):
    execute_gc("pre_flight")
    success = False
    try:
        ctx = DAGContext(repo_id, token, profile, requires_jinja, is_direct)
        engine = DAGExecutionEngine(ctx)
        engine.execute()
        print_log("[SUCCESS] Pipeline execution complete.")
        success = True
    except Exception as e:
        print_log(f"[ERROR] Pipeline aborted: {str(e)}")
        sys.exit(1)
    finally:
        execute_gc("post_success" if success else "post_fail")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--action", choices=["probe", "execute"], required=True)
    parser.add_argument("--repo", required=True)
    parser.add_argument("--token", required=False, default=None)
    parser.add_argument("--profile", required=False)
    parser.add_argument("--jinja", action="store_true")
    parser.add_argument("--direct", action="store_true")
    
    args = parser.parse_args()
    token = args.token if args.token and args.token != "null" else None
    
    if args.action == "probe":
        run_probe(args.repo, token)
    elif args.action == "execute":
        run_execute(args.repo, token, args.profile, args.jinja, args.direct)
