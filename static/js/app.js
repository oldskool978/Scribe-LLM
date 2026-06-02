// Copyright (c) 2026 Hector Nunez. Licensed under PolyForm Shield License 1.0.0. See LICENSE.md.

class MultimodalProcessor {
    static MAX_DIMENSION = 1024;
    static TARGET_QUALITY = 0.85;

    static async quantizeImage(file) {
        return new Promise(async (resolve, reject) => {
            try {
                const bitmap = await createImageBitmap(file);
                let { width, height } = bitmap;
                
                if (width > this.MAX_DIMENSION || height > this.MAX_DIMENSION) {
                    const ratio = Math.min(this.MAX_DIMENSION / width, this.MAX_DIMENSION / height);
                    width = Math.round(width * ratio);
                    height = Math.round(height * ratio);
                }
                
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d', { alpha: false });
                
                ctx.drawImage(bitmap, 0, 0, width, height);
                bitmap.close(); 
                
                canvas.toBlob((blob) => {
                    if (!blob) return reject(new Error("Blob serialization fault."));
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result);
                    reader.onerror = () => reject(new Error("Blob buffer read fault."));
                    reader.readAsDataURL(blob);
                }, 'image/jpeg', this.TARGET_QUALITY);

            } catch (err) {
                reject(new Error("Asynchronous quantization matrix failed."));
            }
        });
    }
}

class ScribeOrchestrator {
    constructor() {
        this.state = {
            engineStatus: 'offline', 
            isInferring: false,
            isHalting: false, 
            abortController: null,
            stagedMedia: [],
            currentNativeCtx: 8192,
            hardwareTelemetry: null,
            manifest: null,
            activeModal: null,
            statusStream: null, 
            sseRetryCount: 0, 
            conversation: [
                { 
                    role: "system", 
                    content: "You are a highly capable AI assistant.",
                    msgId: null
                }
            ],
            availableModels: [], 
            errorAcknowledged: false,
            userOverrides: {
                layers: false,
                ctx: false,
                threads: false
            }
        };

        this.dom = {
            backdrop: document.getElementById('modal-backdrop'),
            modalTopology: document.getElementById('modal-hardware-topology'),
            modalPhysics: document.getElementById('modal-inference-physics'),
            modalAcquisition: document.getElementById('modal-model-acquisition'),
            btnOpenHardware: document.getElementById('btn-open-hardware'),
            btnOpenPhysics: document.getElementById('btn-open-physics'),
            btnOpenAcquisition: document.getElementById('btn-open-acquisition'),
            closeModalBtns: document.querySelectorAll('.close-modal-btn'),
            modelSelector: document.getElementById('model-selector'),
            modelSpinner: document.getElementById('model-spinner'),
            btnMasterPower: document.getElementById('btn-master-power'),
            ctxSlider: document.getElementById('param-ctx'),
            ctxDisplay: document.getElementById('val-ctx-display'),
            layersSlider: document.getElementById('param-layers'),
            layersDisplay: document.getElementById('val-layers-display'),
            threadsSlider: document.getElementById('param-threads'),
            threadsDisplay: document.getElementById('val-threads-display'),
            batchSelect: document.getElementById('param-batch'),
            kvSelector: document.getElementById('kv-selector'), 
            faToggle: document.getElementById('param-fa'),
            mlockToggle: document.getElementById('param-mlock'),
            mmapToggle: document.getElementById('param-mmap'),
            statusInd: document.getElementById('status-indicator'),
            statusText: document.getElementById('status-text'),
            metaArch: document.getElementById('meta-arch'),
            metaVram: document.getElementById('meta-vram'),
            metaRam: document.getElementById('meta-ram'),
            compositorNode: document.getElementById('compositor-node'),
            input: document.getElementById('chat-input'),
            submitBtn: document.getElementById('btn-submit'),
            attachBtn: document.getElementById('btn-attach'),
            fileInput: document.getElementById('hidden-file-input'),
            stagingTray: document.getElementById('media-staging-tray'),
            dropOverlay: document.getElementById('drop-zone-overlay'),
            sysBanner: document.getElementById('system-banner'),
            cogToggle: document.getElementById('toggle-cognition'),
            paramPreset: document.getElementById('param-preset'),
            paramTemp: document.getElementById('param-temp'),
            paramMaxTokens: document.getElementById('param-maxtokens'),
            paramMinP: document.getElementById('param-minp'),
            paramTopK: document.getElementById('param-topk'),
            paramRepPen: document.getElementById('param-reppen'),
            paramDry: document.getElementById('param-dry'),
            labelLayers: document.querySelector('label[for="param-layers"]'),
            labelCtx: document.querySelector('label[for="param-ctx"]')
        };

        this.synthesizeStateMatrix();
        this.sanitizeLegacyDOM();
        this.bindEvents();
        this.bootSequence();

        setInterval(() => {
            if (this.state.engineStatus === 'offline' || this.state.engineStatus === 'error') {
                this.fetchSystemTelemetry();
            }
        }, 5000);
    }

    synthesizeStateMatrix() {
        if (document.getElementById('scribe-state-matrix')) return;
        const style = document.createElement('style');
        style.id = 'scribe-state-matrix';
        style.textContent = `
            .compositor-locked { opacity: 0.3 !important; pointer-events: none !important; transition: opacity var(--transition-fluid); }
            .text-warning { color: var(--status-inferring) !important; transition: color var(--transition-snappy); }
            .text-critical { color: var(--status-error) !important; transition: color var(--transition-snappy); }
            .text-standard { color: var(--text-primary) !important; transition: color var(--transition-snappy); }
            .text-muted { color: var(--text-secondary) !important; transition: color var(--transition-snappy); }
            .sys-hidden { display: none !important; }
            .mode-halt { stroke: var(--status-error) !important; fill: var(--status-error) !important; transition: all 0.2s ease; }
            .mode-halt:hover { opacity: 0.8; }
        `;
        document.head.appendChild(style);
    }

    sanitizeLegacyDOM() {
        if (this.dom.compositorNode) {
            this.dom.compositorNode.style.opacity = '';
            this.dom.compositorNode.style.pointerEvents = '';
        }
    }

    async bootSequence() {
        await this.fetchChatManifest();
        await this.fetchSystemTelemetry();
        this.startStateStream();
    }

    async fetchChatManifest() {
        try {
            const res = await fetch('grammars/chat_base.json');
            if (res.ok) {
                const manifest = await res.json();
                this.state.manifest = manifest;
                if (manifest.system_directives) {
                    this.state.conversation[0].content = manifest.system_directives;
                }
            }
        } catch (e) {}
    }

    async fetchSystemTelemetry() {
        try {
            const data = await window.ScribeGateway.fetchSystemTelemetry();
            this.state.hardwareTelemetry = data;
            
            if (data.vram_total > 0) {
                const totalGB = (data.vram_total / 1024).toFixed(1);
                const freeGB = (data.vram_free / 1024).toFixed(1);
                this.dom.metaVram.textContent = `${data.accelerator} [${freeGB}/${totalGB} GB Free]`;
            } else {
                this.dom.metaVram.textContent = data.accelerator;
            }

            if (data.ram_total > 0) {
                const totalRAM = (data.ram_total / 1024).toFixed(1);
                const freeRAM = (data.ram_free / 1024).toFixed(1);
                this.dom.metaRam.textContent = `${freeRAM} / ${totalRAM} GB Available`;
            } else {
                this.dom.metaRam.textContent = "Offline / Probing...";
            }

            this.state.availableModels = data.models || [];
            
            const oldVal = this.dom.modelSelector.value;
            this.dom.modelSelector.innerHTML = '<option value="" disabled selected>Select a Neural Core...</option>';
            
            this.state.availableModels.forEach(modelObj => {
                const opt = document.createElement('option');
                opt.value = modelObj.name;
                opt.textContent = modelObj.name;
                this.dom.modelSelector.appendChild(opt);
            });
            
            if (oldVal && this.state.availableModels.find(m => m.name === oldVal)) {
                this.dom.modelSelector.value = oldVal;
            }
            this.dom.modelSelector.disabled = false;

            if (this.state.availableModels.length > 0 && !this.dom.modelSelector.value) {
                this.dom.modelSelector.value = this.state.availableModels[0].name;
                this.dom.modelSelector.dispatchEvent(new Event('change'));
            }

            if (this.dom.modelSelector.value) {
                this._calculateSafeHardwareBounds();
            }

        } catch (error) {
            this.setStatus('Gateway Offline', 'status-error');
        }
    }

    startStateStream() {
        if (this.state.statusStream) {
            this.state.statusStream.close();
        }

        this.state.statusStream = new EventSource('/api/status/stream');

        this.state.statusStream.onmessage = (event) => {
            try {
                this.state.sseRetryCount = 0; 
                const state = JSON.parse(event.data);
                this.processEngineState(state);
            } catch (e) {}
        };

        this.state.statusStream.onerror = () => {
            this.processEngineState({ status: 'offline', error_msg: "Connection to Node Agent lost." });
            this.state.statusStream.close();
            
            const backoffMs = Math.min(30000, 1000 * Math.pow(1.5, this.state.sseRetryCount));
            this.state.sseRetryCount++;
            setTimeout(() => this.startStateStream(), backoffMs);
        };
    }

    processEngineState(agentState) {
        if (agentState.available_models) {
            const newModelNames = agentState.available_models.map(m => m.name).join('|');
            const oldModelNames = this.state.availableModels.map(m => m.name).join('|');
            
            if (newModelNames !== oldModelNames) {
                const currentVal = this.dom.modelSelector.value;
                this.state.availableModels = agentState.available_models;
                
                this.dom.modelSelector.innerHTML = '<option value="" disabled selected>Select a Neural Core...</option>';
                this.state.availableModels.forEach(modelObj => {
                    const opt = document.createElement('option');
                    opt.value = modelObj.name;
                    opt.textContent = modelObj.name;
                    this.dom.modelSelector.appendChild(opt);
                });
                
                if (currentVal && this.state.availableModels.find(m => m.name === currentVal)) {
                    this.dom.modelSelector.value = currentVal;
                } else if (this.state.availableModels.length > 0 && !currentVal) {
                    this.dom.modelSelector.value = this.state.availableModels[0].name;
                    this.dom.modelSelector.dispatchEvent(new Event('change'));
                }
                this.dom.modelSelector.disabled = this.state.engineStatus !== 'offline';
            }
        }

        if (this.state.engineStatus === agentState.status && agentState.status !== 'booting') return; 
        this.state.engineStatus = agentState.status;

        switch (agentState.status) {
            case 'ready':
                this.setStatus('Core Operational', 'status-ready');
                this.dom.compositorNode.classList.remove('compositor-locked');
                this.dom.input.disabled = false;
                this._updatePlaceholder();
                this.dom.sysBanner.classList.add('sys-hidden');
                this.dom.btnMasterPower.classList.remove('power-booting');
                this.dom.btnMasterPower.classList.add('power-active');
                this.dom.btnMasterPower.title = "Teardown Environment";
                this.dom.btnMasterPower.disabled = false;
                this.dom.modelSpinner.classList.add('hidden');
                this._lockHardwareInputs(true);
                this.state.errorAcknowledged = false;
                this._autoResizeInput();
                break;

            case 'booting':
                let logStr = "Allocating Memory...";
                if (agentState.logs && agentState.logs.length > 0) {
                    logStr = agentState.logs[agentState.logs.length - 1];
                    logStr = logStr.replace(/llama_model_load: |llama_kv_cache_init: /g, '');
                    if (logStr.length > 35) logStr = logStr.substring(0, 32) + '...';
                }
                
                this.setStatus(logStr, 'status-inferring');
                this.dom.btnMasterPower.classList.add('power-booting');
                this.dom.btnMasterPower.classList.remove('power-active');
                this.dom.btnMasterPower.title = "Ignition Matrix Locked...";
                this.dom.btnMasterPower.disabled = true;
                this.dom.modelSpinner.classList.remove('hidden');
                this._lockHardwareInputs(true);
                break;

            case 'offline':
                this.setStatus('Agent Idle', 'status-offline');
                if (this.dom.modelSelector.value === "") this.dom.metaArch.textContent = "Offline";
                this._lockCompositor();
                this.dom.btnMasterPower.classList.remove('power-booting');
                this.dom.btnMasterPower.classList.remove('power-active');
                this.dom.btnMasterPower.title = "Ignite Neural Core";
                this.dom.btnMasterPower.disabled = this.dom.modelSelector.value === "";
                this.dom.modelSpinner.classList.add('hidden');
                this._lockHardwareInputs(false);
                this.state.errorAcknowledged = false;
                this.state.isInferring = false;
                this.state.isHalting = false;
                this._autoResizeInput();
                break;

            case 'error':
                this.setStatus('Allocation Fault', 'status-error');
                this.dom.metaArch.textContent = "Fault Detected";
                this._lockCompositor();
                this.dom.btnMasterPower.classList.remove('power-booting');
                this.dom.btnMasterPower.classList.add('power-active');
                this.dom.btnMasterPower.title = "Teardown Faulty Environment";
                this.dom.btnMasterPower.disabled = false;
                this.dom.modelSpinner.classList.add('hidden');
                
                if (!this.state.errorAcknowledged) {
                    alert(`Engine Fault Intercepted:\n\n${agentState.error_msg}\n\nAction: Teardown environment, adjust bounds, and reignite.`);
                    this.state.errorAcknowledged = true;
                }
                break;
        }
    }

    _lockHardwareInputs(isLocked) {
        this.dom.modelSelector.disabled = isLocked;
        this.dom.ctxSlider.disabled = isLocked;
        this.dom.layersSlider.disabled = isLocked;
        this.dom.threadsSlider.disabled = isLocked;
        this.dom.batchSelect.disabled = isLocked;
        if (this.dom.kvSelector) this.dom.kvSelector.disabled = isLocked;
        this.dom.faToggle.disabled = isLocked;
        this.dom.mlockToggle.disabled = isLocked;
        this.dom.mmapToggle.disabled = isLocked;
    }

    _lockCompositor() {
        this.dom.compositorNode.classList.add('compositor-locked');
        this.dom.input.disabled = true;
        this.dom.input.placeholder = "Core offline. Select Neural Core and engage Top Nav Power Toggle...";
        this.dom.sysBanner.classList.remove('sys-hidden');
    }

    _updatePlaceholder() {
        if (this.state.engineStatus !== 'ready') return;
        if (this.dom.cogToggle.checked) {
            this.dom.input.placeholder = "Enter task for Deep Cognition Synthesis...";
        } else {
            this.dom.input.placeholder = "Transmit instruction...";
        }
    }

    _enforceDynamicContextBounds() {
        const maxSafeIdx = window.ScribePhysics.getMaxSafeContextIndex(this.dom.cogToggle.checked);
        this.dom.ctxSlider.max = maxSafeIdx;
        
        if (parseInt(this.dom.ctxSlider.value) > maxSafeIdx) {
            this.dom.ctxSlider.value = maxSafeIdx;
            this._updateCtxDisplay(maxSafeIdx);
            if (!this.state.userOverrides.ctx) {
                this.dom.labelCtx.classList.remove('text-muted', 'text-standard');
                this.dom.labelCtx.classList.add('text-warning');
                this.dom.labelCtx.title = "Context dynamically throttled for MCTS parallel slot safety.";
            }
        }
    }

    _calculateSafeHardwareBounds() {
        if (!this.state.hardwareTelemetry || !this.dom.modelSelector.value) return;

        const modelObj = this.state.availableModels.find(m => m.name === this.dom.modelSelector.value);
        if (!modelObj) return;

        const config = {
            requestedCtxIdx: this.state.userOverrides.ctx ? parseInt(this.dom.ctxSlider.value) : "auto",
            isCognitive: this.dom.cogToggle.checked,
            kvQuant: this.dom.kvSelector ? this.dom.kvSelector.value : "auto",
            useFA: this.dom.faToggle ? this.dom.faToggle.checked : true
        };

        const projection = window.ScribePhysics.calculateHardwareMatrix(this.state.hardwareTelemetry, modelObj, config);
        if (!projection) return;

        if (!this.state.userOverrides.ctx && projection.adjustedContextSize) {
            const targetIdx = window.ScribePhysics.CONTEXT_BOUNDS.indexOf(projection.adjustedContextSize);
            if (targetIdx !== -1) {
                this.dom.ctxSlider.value = targetIdx;
                this._updateCtxDisplay(targetIdx);
            }
        }

        this.dom.layersSlider.max = projection.maxLayers;
        let currentSliderVal = parseInt(this.dom.layersSlider.value);

        if (!this.state.userOverrides.layers) {
            this.dom.layersSlider.value = projection.optimalLayers;
            this.dom.layersDisplay.textContent = projection.optimalLayers;
            currentSliderVal = projection.optimalLayers;
        }

        let archText = `${modelObj.name.split('.')[0]}`;
        if (modelObj.expert_count && modelObj.expert_count > 0) {
            archText += ` (MoE: ${modelObj.expert_used}/${modelObj.expert_count})`;
        } else {
            archText += ` (Dense)`;
        }

        const isRamOffloaded = currentSliderVal > projection.optimalLayers;
        const isAsymmetricIntervention = projection.recommendedSlots < (config.isCognitive ? 6 : 1) || projection.recommendedKvQuant !== config.kvQuant;

        if (isRamOffloaded || isAsymmetricIntervention) {
            this.dom.labelLayers.classList.remove('text-muted', 'text-standard');
            this.dom.labelLayers.classList.add('text-critical');
            
            const offloaded = currentSliderVal - projection.optimalLayers;
            this.dom.labelLayers.title = `${offloaded} layers mapped to System RAM. Asymmetric constraints active.`;
            
            let interventionText = " [RAM Offload Active";
            if (isAsymmetricIntervention) {
                interventionText += ` | Slots Clamped: ${projection.recommendedSlots} | KV: ${projection.recommendedKvQuant.toUpperCase()}`;
            }
            interventionText += "]";

            this.dom.metaArch.textContent = archText + interventionText;
            this.dom.metaArch.classList.remove('text-standard');
            this.dom.metaArch.classList.add('text-warning');
        } else {
            this.dom.labelLayers.classList.remove('text-critical', 'text-warning');
            this.dom.labelLayers.classList.add(this.state.userOverrides.layers ? 'text-standard' : 'text-muted');
            this.dom.labelLayers.title = this.state.userOverrides.layers ? "Manual override engaged. Double-click to resolve." : "Hardware bounds mathematically optimal.";
            
            this.dom.metaArch.textContent = archText;
            this.dom.metaArch.classList.remove('text-warning', 'text-critical');
            this.dom.metaArch.classList.add('text-standard');
        }
    }

    _updateCtxDisplay(idx) {
        const val = window.ScribePhysics.CONTEXT_BOUNDS[idx];
        if (this.dom.ctxDisplay) {
            this.dom.ctxDisplay.textContent = val;
            if (this.state.currentNativeCtx && val > this.state.currentNativeCtx) {
                this.dom.ctxDisplay.classList.remove('text-standard');
                this.dom.ctxDisplay.classList.add('text-warning');
            } else {
                this.dom.ctxDisplay.classList.remove('text-warning');
                this.dom.ctxDisplay.classList.add('text-standard');
            }
        }
    }

    setStatus(text, stateClass) {
        this.dom.statusText.textContent = text;
        this.dom.statusInd.className = `status-badge ${stateClass}`;
    }

    openModal(modalElement) {
        this.dom.backdrop.classList.remove('hidden');
        modalElement.classList.remove('hidden');
        this.state.activeModal = modalElement;
    }

    closeAllModals(force = false) {
        if (!force && this.state.engineStatus === 'booting') return;
        
        this.dom.backdrop.classList.add('hidden');
        this.dom.modalTopology.classList.add('hidden');
        this.dom.modalPhysics.classList.add('hidden');
        this.dom.modalAcquisition.classList.add('hidden');
        this.state.activeModal = null;
    }

    bindEvents() {
        this.dom.btnOpenHardware.addEventListener('click', () => this.openModal(this.dom.modalTopology));
        this.dom.btnOpenPhysics.addEventListener('click', () => this.openModal(this.dom.modalPhysics));
        this.dom.btnOpenAcquisition.addEventListener('click', () => this.openModal(this.dom.modalAcquisition));
        
        this.dom.closeModalBtns.forEach(btn => {
            btn.addEventListener('close', () => this.closeAllModals());
            btn.addEventListener('click', () => this.closeAllModals());
        });

        this.dom.backdrop.addEventListener('click', () => this.closeAllModals());

        this.dom.layersSlider.addEventListener('input', (e) => {
            this.state.userOverrides.layers = true;
            this.dom.layersDisplay.textContent = e.target.value;
            this._calculateSafeHardwareBounds();
        });
        
        this.dom.ctxSlider.addEventListener('input', (e) => {
            this.state.userOverrides.ctx = true;
            this._updateCtxDisplay(e.target.value);
            this.dom.labelCtx.classList.remove('text-muted', 'text-standard');
            this.dom.labelCtx.classList.add('text-warning');
            this.dom.labelCtx.title = "Double-click to reset to optimal bounds";
            this._calculateSafeHardwareBounds();
        });

        this.dom.batchSelect.addEventListener('change', () => {
            this._calculateSafeHardwareBounds();
        });

        if (this.dom.kvSelector) {
            this.dom.kvSelector.addEventListener('change', () => {
                this._calculateSafeHardwareBounds();
            });
        }

        if (this.dom.labelLayers) {
            this.dom.labelLayers.addEventListener('dblclick', () => {
                this.state.userOverrides.layers = false;
                this.dom.modelSelector.dispatchEvent(new Event('change'));
            });
        }
        
        if (this.dom.labelCtx) {
            this.dom.labelCtx.addEventListener('dblclick', () => {
                this.state.userOverrides.ctx = false;
                this.dom.labelCtx.classList.remove('text-warning', 'text-critical');
                this.dom.labelCtx.classList.add('text-muted');
                this.dom.labelCtx.title = "";
                this.dom.modelSelector.dispatchEvent(new Event('change'));
            });
        }

        this.dom.modelSelector.addEventListener('change', (e) => {
            const selectedName = e.target.value;
            this.dom.btnMasterPower.disabled = selectedName === "";
            
            const modelObj = this.state.availableModels.find(m => m.name === selectedName);
            if (modelObj && this.state.hardwareTelemetry) {
                this.state.currentNativeCtx = modelObj.native_ctx || 8192;
                
                if (!this.state.userOverrides.ctx) {
                    const optimalBounds = window.ScribePhysics.calculateHardwareMatrix(this.state.hardwareTelemetry, modelObj, {
                        requestedCtxIdx: "auto",
                        isCognitive: this.dom.cogToggle.checked,
                        kvQuant: this.dom.kvSelector ? this.dom.kvSelector.value : "auto",
                        useFA: this.dom.faToggle ? this.dom.faToggle.checked : true
                    });
                    
                    if (optimalBounds && optimalBounds.adjustedContextSize) {
                        const targetIdx = window.ScribePhysics.CONTEXT_BOUNDS.indexOf(optimalBounds.adjustedContextSize);
                        if (targetIdx !== -1) {
                            this.dom.ctxSlider.value = targetIdx;
                            this._updateCtxDisplay(targetIdx);
                        }
                    } else {
                        const defaultIdx = window.ScribePhysics.resolveDefaultContextIndex(this.state.currentNativeCtx);
                        this.dom.ctxSlider.value = defaultIdx;
                        this._updateCtxDisplay(defaultIdx);
                    }
                }
                
                this.dom.layersSlider.max = modelObj.max_layers || 99;
                this._enforceDynamicContextBounds();
                this._calculateSafeHardwareBounds();
            }
        });

        if (this.dom.threadsSlider) {
            this.dom.threadsSlider.addEventListener('input', (e) => this.dom.threadsDisplay.textContent = e.target.value);
        }

        this.dom.btnMasterPower.addEventListener('click', async (e) => {
            e.preventDefault();
            if (this.state.engineStatus === 'ready' || this.state.engineStatus === 'error') {
                try { await window.ScribeGateway.haltEngine(); } 
                catch (e) {}
            } else if (this.state.engineStatus === 'offline') {
                const model = this.dom.modelSelector.value;
                if (!model) return;

                const modelObj = this.state.availableModels.find(m => m.name === model);
                const projectionConfig = {
                    requestedCtxIdx: this.state.userOverrides.ctx ? parseInt(this.dom.ctxSlider.value) : "auto",
                    isCognitive: this.dom.cogToggle.checked,
                    kvQuant: this.dom.kvSelector ? this.dom.kvSelector.value : "auto",
                    useFA: this.dom.faToggle ? this.dom.faToggle.checked : true
                };
                
                let finalSlots = this.dom.cogToggle.checked ? 6 : 1;
                let finalKv = this.dom.kvSelector ? this.dom.kvSelector.value : "auto";
                let finalCtxSize = window.ScribePhysics.CONTEXT_BOUNDS[parseInt(this.dom.ctxSlider.value)];
                
                if (modelObj && this.state.hardwareTelemetry) {
                    const projection = window.ScribePhysics.calculateHardwareMatrix(this.state.hardwareTelemetry, modelObj, projectionConfig);
                    if (projection) {
                        finalSlots = projection.recommendedSlots;
                        finalKv = projection.recommendedKvQuant;
                        finalCtxSize = projection.adjustedContextSize;
                    }
                }

                try {
                    this.dom.btnMasterPower.classList.add('power-booting');
                    this.dom.btnMasterPower.disabled = true;
                    this._lockCompositor();

                    const config = {
                        model: model, 
                        ctx_size: finalCtxSize, 
                        gpu_layers: parseInt(this.dom.layersSlider.value),
                        threads: parseInt(this.dom.threadsSlider.value),
                        batch_size: parseInt(this.dom.batchSelect.value),
                        parallel_slots: finalSlots, 
                        flash_attn: this.dom.faToggle.checked, 
                        mlock: this.dom.mlockToggle.checked,
                        no_mmap: this.dom.mmapToggle.checked,
                        kv_quant: finalKv 
                    };

                    window.ScribeGateway.config = config;
                    await window.ScribeGateway.bootEngine(config);
                } catch (e) {}
            }
        });

        this.dom.paramPreset.addEventListener('change', (e) => {
            const profile = window.ScribePhysics.getProfile(e.target.value);
            if (profile) {
                this.dom.paramTemp.value = profile.temp;
                this.dom.paramMinP.value = profile.minp;
                this.dom.paramTopK.value = profile.topk;
                this.dom.paramRepPen.value = profile.reppen;
                
                if (this.dom.paramDry) this.dom.paramDry.value = profile.dry || 0.0;
                
                document.getElementById('val-temp').textContent = profile.temp.toFixed(2);
                document.getElementById('val-minp').textContent = profile.minp.toFixed(2);
                document.getElementById('val-topk').textContent = profile.topk;
                document.getElementById('val-reppen').textContent = profile.reppen.toFixed(2);
                
                const dryValEl = document.getElementById('val-dry');
                if (dryValEl) dryValEl.textContent = (profile.dry || 0.0).toFixed(2);
            }
        });

        ['param-temp', 'param-minp', 'param-topk', 'param-reppen', 'param-dry', 'param-maxtokens'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('input', (e) => {
                if (id !== 'param-maxtokens') {
                    this.dom.paramPreset.value = 'custom';
                }
                
                let displayVal = el.value;
                if (id === 'param-temp' || id === 'param-minp' || id === 'param-reppen' || id === 'param-dry') {
                    displayVal = parseFloat(el.value).toFixed(2);
                }
                
                const valTarget = document.getElementById(`val-${id.split('-')[1]}`);
                if (valTarget) valTarget.textContent = displayVal;
            });
        });

        this.dom.cogToggle.addEventListener('change', () => {
            this._updatePlaceholder();
            this._enforceDynamicContextBounds();
            this._calculateSafeHardwareBounds();
        });
        
        this.dom.input.addEventListener('input', () => this._autoResizeInput());
        this.dom.input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) { 
                e.preventDefault(); 
                if (!this.state.isInferring && !this.state.isHalting) this.executeInference(); 
            }
        });
        
        this.dom.submitBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (this.state.isHalting) return; 
            
            if (this.state.isInferring) {
                this.state.isHalting = true;
                if (this.state.abortController) this.state.abortController.abort();
            } else {
                this.executeInference();
            }
        });

        this.dom.attachBtn.addEventListener('click', () => this.dom.fileInput.click());
        this.dom.fileInput.addEventListener('change', (e) => this.handleFiles(e.target.files));
        window.addEventListener('dragover', (e) => { e.preventDefault(); this.dom.dropOverlay.classList.remove('hidden'); });
        window.addEventListener('dragleave', (e) => { if (e.relatedTarget === null) this.dom.dropOverlay.classList.add('hidden'); });
        window.addEventListener('drop', (e) => {
            e.preventDefault();
            this.dom.dropOverlay.classList.add('hidden');
            if (e.dataTransfer.files.length) this.handleFiles(e.dataTransfer.files);
        });
        this.dom.input.addEventListener('paste', (e) => {
            try {
                const items = (e.clipboardData || e.originalEvent.clipboardData).items;
                const files = [];
                for (let item of items) { if (item.type.indexOf('image') === 0) files.push(item.getAsFile()); }
                if (files.length > 0) this.handleFiles(files);
            } catch (err) {}
        });
    }

    _autoResizeInput() {
        this.dom.input.style.height = 'auto';
        this.dom.input.style.height = `${Math.min(this.dom.input.scrollHeight, 200)}px`;
        const hasContent = this.dom.input.value.trim() !== '' || this.state.stagedMedia.length > 0;
        
        if (this.state.isInferring) {
            this.dom.submitBtn.disabled = this.state.isHalting;
            this.dom.submitBtn.classList.add('mode-halt');
            this.dom.submitBtn.title = this.state.isHalting ? "Severing Connection..." : "Sever Cognitive Trajectory";
        } else {
            this.dom.submitBtn.disabled = !hasContent || this.state.engineStatus !== 'ready';
            this.dom.submitBtn.classList.remove('mode-halt');
            this.dom.submitBtn.title = "Transmit Instruction";
        }
    }

    async handleFiles(files) {
        if (this.state.engineStatus !== 'ready') return;
        for (let file of files) {
            if (!file.type.startsWith('image/')) continue;
            try {
                const b64 = await MultimodalProcessor.quantizeImage(file);
                this.state.stagedMedia.push(b64);
                this.renderStagingTray();
            } catch (e) {}
        }
        this._autoResizeInput();
    }

    renderStagingTray() {
        this.dom.stagingTray.innerHTML = '';
        if (this.state.stagedMedia.length === 0) {
            this.dom.stagingTray.classList.add('hidden');
            return;
        }
        this.dom.stagingTray.classList.remove('hidden');
        this.state.stagedMedia.forEach((b64, index) => {
            const thumb = document.createElement('div');
            thumb.className = 'staged-thumbnail';
            thumb.style.backgroundImage = `url(${b64})`;
            const removeBtn = document.createElement('button');
            removeBtn.innerHTML = '×';
            removeBtn.onclick = () => {
                this.state.stagedMedia.splice(index, 1);
                this.renderStagingTray();
                this._autoResizeInput();
            };
            thumb.appendChild(removeBtn);
            this.dom.stagingTray.appendChild(thumb);
        });
    }

    pushConversationState(role, content, msgId = null) {
        this.state.conversation.push({ role: role, content: content, msgId: msgId });
    }

    getConversationState() {
        return [...this.state.conversation];
    }

    async _prepareStandardContext() {
        let activeMaxCtx = 8192;
        if (window.ScribeGateway?.config?.ctx_size) {
            activeMaxCtx = parseInt(window.ScribeGateway.config.ctx_size, 10);
        } else {
            const ctxDisplay = this.dom.ctxDisplay;
            if (ctxDisplay && ctxDisplay.innerText) {
                const parsed = parseInt(ctxDisplay.innerText.replace(/,/g, '').replace(/[^0-9]/g, ''));
                if (!isNaN(parsed) && parsed > 0) activeMaxCtx = parsed;
            }
        }

        const sysMsg = this.state.conversation[0];
        let history = this.state.conversation.slice(1);
        
        const windowSize = 20; 
        if (history.length > windowSize) history = history.slice(-windowSize);

        let safeMessages = [sysMsg, ...history];
        const requestedMaxTokens = parseInt(this.dom.paramMaxTokens.value) || 2048;
        const executionFloor = 512;

        const dynamicMargin = activeMaxCtx > 16384 ? 0.95 : 0.90;
        const absoluteMaxSafe = Math.floor(activeMaxCtx * dynamicMargin);

        while (true) {
            let normalizedMessages = safeMessages.map(m => {
                let normalizedContent = m.content;
                if (m.msgId && window.Compositor && window.Compositor.messageRegistry && window.Compositor.messageRegistry.has(m.msgId)) {
                    const registryText = window.Compositor.messageRegistry.get(m.msgId);
                    if (typeof m.content === 'string') {
                        normalizedContent = registryText;
                    } else if (Array.isArray(m.content)) {
                        normalizedContent = m.content.map(item => {
                            if (item.type === 'text') {
                                return { ...item, text: registryText };
                            }
                            return item;
                        });
                    }
                }
                return { role: m.role, content: normalizedContent };
            });

            let textContent = normalizedMessages.map(m => {
                if (typeof m.content === 'string') return m.content;
                if (Array.isArray(m.content)) return m.content.map(c => c.text || '').join(' ');
                return '[MULTIMODAL]';
            }).join('\n\n');

            let currentCount = 0;
            try {
                const tokenData = await window.ScribeGateway.tokenize(textContent);
                currentCount = Math.floor(tokenData.tokens.length * 1.15) + 128; 
            } catch (e) {
                currentCount = Math.floor(textContent.length / 3.5);
            }

            let availableHeadroom = absoluteMaxSafe - currentCount;

            if (safeMessages.length > 1 && (availableHeadroom < executionFloor || currentCount >= absoluteMaxSafe)) {
                if (safeMessages.length > 2) {
                    safeMessages.splice(1, 2);
                } else {
                    safeMessages.splice(1, 1);
                }
            } else {
                let safeMaxTokens = Math.min(requestedMaxTokens, Math.max(executionFloor, availableHeadroom));
                if (availableHeadroom < executionFloor) {
                    safeMaxTokens = Math.max(64, availableHeadroom);
                }
                return { safeMessages: normalizedMessages, safeMaxTokens };
            }
        }
    }

    async executeInference() {
        if (this.state.engineStatus !== 'ready') return;
        
        const text = this.dom.input.value.trim();
        if (text === '' && this.state.stagedMedia.length === 0) return;
        if (this.state.isInferring || this.state.isHalting) return;

        this.state.isInferring = true;
        this.state.abortController = new AbortController();
        this._autoResizeInput();
        
        this.dom.input.value = '';
        
        const visualContext = [...this.state.stagedMedia];
        this.state.stagedMedia = [];
        this.renderStagingTray();

        const isCognitiveMode = this.dom.cogToggle.checked;
        let contentPayload = text;
        if (visualContext.length > 0) {
            contentPayload = [];
            if (text !== '') contentPayload.push({ type: "text", text: text });
            visualContext.forEach(b64 => {
                contentPayload.push({ type: "image_url", image_url: { url: b64 } });
            });
        }

        const userMsgId = window.Compositor.appendMessage('user', text, visualContext);
        this.pushConversationState("user", contentPayload, userMsgId);
        let assistantNodeId = null;

        try {
            if (isCognitiveMode) {
                if (!window.NeuralEngine) throw new Error("Cognitive Engine offline. Check scripts.");
                
                const blueprint = await window.NeuralEngine.executeCognitiveLoop(text, visualContext, this.state.abortController.signal);
                if (blueprint && blueprint.prose) {
                    this.pushConversationState("assistant", blueprint.prose, null);
                }
            } else {
                this.setStatus('Computing Graph...', 'status-inferring');
                let contextBounds = await this._prepareStandardContext();

                const payload = {
                    messages: contextBounds.safeMessages,
                    temperature: parseFloat(this.dom.paramTemp.value),
                    max_tokens: contextBounds.safeMaxTokens,
                    min_p: parseFloat(this.dom.paramMinP.value),
                    top_p: 1.0, 
                    top_k: parseInt(this.dom.paramTopK.value), 
                    repeat_penalty: parseFloat(this.dom.paramRepPen.value),
                    stream: true
                };

                if (this.dom.paramDry) {
                    payload.dry_multiplier = parseFloat(this.dom.paramDry.value);
                }

                assistantNodeId = window.Compositor.appendMessage('assistant', '', []);
                
                const streamResult = await window.ScribeGateway.streamChat(
                    payload,
                    (token) => {
                        window.Compositor.streamToken(assistantNodeId, token);
                        const chatHistory = document.getElementById('chat-history');
                        if (chatHistory) chatHistory.scrollTop = chatHistory.scrollHeight;
                    },
                    this.state.abortController.signal
                );
                
                let finalResponse = streamResult.content;
                let currentFinishReason = streamResult.finish_reason;
                let continuationCount = 0;
                const maxContinuations = 5; 

                while (currentFinishReason === 'length' && continuationCount < maxContinuations) {
                    continuationCount++;
                    
                    this.state.conversation.push({ role: "assistant", content: finalResponse, msgId: assistantNodeId });
                    const contextHorizon = await this._prepareStandardContext();
                    this.state.conversation.pop(); 

                    if (contextHorizon.safeMaxTokens < 64) break;

                    const nextPayload = {
                        messages: contextHorizon.safeMessages,
                        temperature: payload.temperature,
                        max_tokens: contextHorizon.safeMaxTokens,
                        min_p: payload.min_p,
                        top_p: 1.0,
                        top_k: payload.top_k,
                        repeat_penalty: payload.repeat_penalty,
                        stream: true
                    };
                    if (payload.dry_multiplier) nextPayload.dry_multiplier = payload.dry_multiplier;

                    const nextResult = await window.ScribeGateway.streamChat(
                        nextPayload,
                        (token) => {
                            finalResponse += token;
                            window.Compositor.streamToken(assistantNodeId, token);
                            const chatHistory = document.getElementById('chat-history');
                            if (chatHistory) chatHistory.scrollTop = chatHistory.scrollHeight;
                        },
                        this.state.abortController.signal
                    );

                    currentFinishReason = nextResult.finish_reason;
                }

                this.pushConversationState("assistant", finalResponse, assistantNodeId);
                window.Compositor.finalizeMessage(assistantNodeId);
            }
        } catch (error) {
            console.error("Inference Cycle Fault:", error);
            if (assistantNodeId) {
                window.Compositor.finalizeMessage(assistantNodeId);
            }
            if (error.name === 'AbortError' || error.message.includes('aborted')) {
                const errNodeId = window.Compositor.appendMessage('assistant', '', []);
                window.Compositor.streamToken(errNodeId, `\n\n**[Severance Matrix]:** Cognitive trajectory aborted by operator.`);
                window.Compositor.finalizeMessage(errNodeId);
            } else {
                const errNodeId = window.Compositor.appendMessage('assistant', '', []);
                window.Compositor.streamToken(errNodeId, `\n\n**[System Fault]:** Inference interrupted. ${error.message}`);
                window.Compositor.finalizeMessage(errNodeId);
            }
        } finally {
            this.state.isInferring = false;
            this.state.abortController = null;
            this.state.isHalting = false; 
            this._autoResizeInput();
            
            if (this.state.engineStatus === 'ready') {
                this.setStatus('Core Operational', 'status-ready');
            }
            this.dom.input.focus();
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.Scribe = new ScribeOrchestrator();
});