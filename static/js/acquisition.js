// Copyright (c) 2026 Hector Nunez. Licensed under PolyForm Shield License 1.0.0. See LICENSE.md.

class AcquisitionSubsystem {
    constructor() {
        this.hfToken = localStorage.getItem('scribe_hf_token') || null;
        this.selectedRepo = null;
        this.repoState = null; 
        this.isCompiling = false; 
        this.telemetryStream = null;
        this.editorPool = new Map();
        this.observedNodes = new Map();
        
        this.dom = {
            btnOpen: document.getElementById('btn-open-acquisition'),
            modal: document.getElementById('modal-model-acquisition'),
            authStatusBox: document.getElementById('acq-auth-status'),
            searchInput: document.getElementById('acq-search-input'),
            btnSearch: document.getElementById('acq-btn-search'),
            searchResults: document.getElementById('acq-search-results'),
            quantSelect: document.getElementById('acq-quant-select'),
            projectionBox: document.getElementById('acq-projection-box'),
            projectionValue: document.getElementById('acq-projection-value'),
            btnExecute: document.getElementById('acq-btn-execute'),
            executeText: document.getElementById('acq-execute-text'),
            spinner: document.getElementById('acq-spinner'),
            connStatus: document.getElementById('acq-connection-status'),
            terminal: document.getElementById('acq-terminal-output')
        };

        this.editorObserver = new ResizeObserver((entries) => {
            window.requestAnimationFrame(() => {
                entries.forEach(entry => {
                    const editorId = entry.target.dataset.editorId;
                    if (editorId && this.editorPool.has(editorId)) {
                        const editor = this.editorPool.get(editorId);
                        if (editor) editor.resize();
                    }
                });
            });
        });

        this.init();
    }

    init() {
        this.synthesizeLocalCSS();
        this.synthesizeAuthField();
        this.synthesizeReadmeModal();
        this.bindEvents();
    }

    synthesizeLocalCSS() {
        if (document.getElementById('acq-dynamic-styles')) return;
        const style = document.createElement('style');
        style.id = 'acq-dynamic-styles';
        style.textContent = `
            .acq-token-input { background: transparent; border: 1px solid var(--border-focus); color: var(--status-ready); font-family: var(--font-code); font-size: 0.7rem; border-radius: var(--radius-sm); padding: 2px 6px; width: 140px; outline: none; transition: border-color 0.2s; }
            .acq-token-input:focus { border-color: var(--status-ready); }
            .acq-modal-flex-center { align-items: center; justify-content: center; display: flex; }
            .acq-light-modal { position: relative; transform: none; top: 0; left: 0; background: var(--light-bg, #fdfbf7); border: 1px solid var(--light-border, #e7e5e4); }
            .acq-light-header { background: var(--light-panel, #ffffff); border-bottom: 1px solid var(--light-border, #e7e5e4); }
            .acq-title-group { display: flex; align-items: center; gap: 8px; }
            .acq-title-text { font-family: var(--font-code); text-transform: none; letter-spacing: 0; color: var(--light-text, #292524); }
            .acq-close-btn { color: var(--light-muted, #78716c); }
            .acq-close-btn:hover { color: var(--status-error); background-color: rgba(239, 68, 68, 0.1); border-color: transparent; }
            .model-card { padding: 12px; background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); cursor: pointer; transition: all var(--transition-snappy); display: flex; justify-content: space-between; align-items: center; }
            .model-card:hover { border-color: var(--border-focus); background: var(--bg-surface-elevated); }
            .model-card.active { border-color: var(--accent-primary); background: rgba(99, 102, 241, 0.05); }
            .model-card-content { flex: 1; min-width: 0; }
            .model-card-title { font-family: var(--font-code); font-size: 0.85rem; font-weight: 600; color: var(--text-primary); word-break: break-all; }
            .model-card-stats { font-size: 0.75rem; color: var(--text-secondary); margin-top: 6px; }
            .readme-loading-state { text-align: center; color: var(--light-muted, #78716c); padding: 40px; font-style: italic; }
            .readme-error-state { text-align: center; color: var(--status-error); padding: 40px; font-family: var(--font-code); }
        `;
        document.head.appendChild(style);
    }

    synthesizeAuthField() {
        this.dom.authStatusBox.innerHTML = `
            <div style="display: flex; gap: 8px; align-items: center;">
                <input type="password" id="acq-token-input" class="acq-token-input" 
                       placeholder="HF Token (Optional)" 
                       title="Required only for gated or private repositories.">
                <button id="acq-btn-set-token" class="icon-btn" style="padding: 2px 8px; font-size: 0.75rem; border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); color: var(--text-secondary); cursor: pointer; transition: all 0.2s;">Set</button>
            </div>
        `;
        const tokenInput = document.getElementById('acq-token-input');
        const btnSet = document.getElementById('acq-btn-set-token');
        
        if (this.hfToken) {
            tokenInput.value = this.hfToken;
            btnSet.textContent = "Active";
            btnSet.style.color = "var(--status-ready)";
            btnSet.style.borderColor = "var(--status-ready)";
        }
        
        btnSet.addEventListener('click', () => {
            const val = tokenInput.value.trim();
            if (val) {
                this.hfToken = val;
                localStorage.setItem('scribe_hf_token', val);
                btnSet.textContent = "Saved";
                btnSet.style.color = "var(--status-ready)";
                btnSet.style.borderColor = "var(--status-ready)";
                setTimeout(() => { btnSet.textContent = "Active"; }, 2000);
            } else {
                this.hfToken = null;
                localStorage.removeItem('scribe_hf_token');
                btnSet.textContent = "Cleared";
                btnSet.style.color = "var(--text-muted)";
                btnSet.style.borderColor = "var(--border-subtle)";
                setTimeout(() => { btnSet.textContent = "Set"; btnSet.style.color = "var(--text-secondary)"; }, 2000);
            }
        });
    }

    synthesizeReadmeModal() {
        if (document.getElementById('scribe-readme-modal')) return;
        
        const modalHtml = `
            <div id="scribe-readme-modal" class="modal-backdrop tier-2 hidden acq-modal-flex-center">
                <div class="control-modal expanded-modal acq-light-modal">
                    <header class="modal-header acq-light-header">
                        <div class="acq-title-group">
                            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>
                            <h2 id="readme-modal-title" class="acq-title-text">Manifest Viewer</h2>
                        </div>
                        <button id="readme-close-btn" class="icon-btn acq-close-btn">
                            <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        </button>
                    </header>
                    <div id="readme-modal-body" class="modal-body markdown-body gguf-light-markdown"></div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        
        document.getElementById('readme-close-btn').addEventListener('click', () => {
            this.purgeReadmeEditors();
            document.getElementById('scribe-readme-modal').classList.add('hidden');
        });
    }

    purgeReadmeEditors() {
        this.editorPool.forEach((editor, id) => {
            if (id.startsWith('acq-ace-')) {
                try {
                    if (this.observedNodes.has(id)) {
                        this.editorObserver.unobserve(this.observedNodes.get(id));
                        this.observedNodes.delete(id);
                    }
                    editor.destroy();
                    editor.container.remove();
                } catch (e) {}
                this.editorPool.delete(id);
            }
        });
    }

    async openReadmeViewer(repoId) {
        this.purgeReadmeEditors();
        const modal = document.getElementById('scribe-readme-modal');
        const title = document.getElementById('readme-modal-title');
        const body = document.getElementById('readme-modal-body');
        
        title.textContent = repoId;
        body.innerHTML = '<div class="readme-loading-state">Fetching repository manifest...</div>';
        modal.classList.remove('hidden');

        try {
            const res = await fetch(`https://huggingface.co/${repoId}/raw/main/README.md`);
            if (!res.ok) throw new Error('README.md manifest not found in this repository.');
            
            const markdownText = await res.text();
            const rawHtml = window.marked.parse(markdownText);
            
            body.innerHTML = window.DOMPurify.sanitize(rawHtml, {
                ADD_TAGS: ['details', 'summary', 'artifact'],
                ADD_ATTR: ['data-tex', 'data-lang', 'data-filename']
            });

            body.querySelectorAll('a').forEach(anchor => {
                anchor.setAttribute('target', '_blank');
                anchor.setAttribute('rel', 'noopener noreferrer');
            });

            this.interceptAndInitializeAce(body);
            
        } catch (error) {
            body.innerHTML = `<div class="readme-error-state">[SYSTEM ERROR] ${error.message}</div>`;
        }
    }

    interceptAndInitializeAce(containerNode) {
        const codeBlocks = containerNode.querySelectorAll('pre code');
        
        codeBlocks.forEach((codeBlock, index) => {
            const pre = codeBlock.parentElement;
            const langRaw = codeBlock.className.replace('language-', '').toLowerCase();
            const lang = this.mapLanguageToAceMode(langRaw);
            const codeContent = codeBlock.textContent;

            const wrapper = document.createElement('div');
            wrapper.className = 'scribe-ace-wrapper';
            const editorId = `acq-ace-${Date.now()}-${index}`;
            wrapper.dataset.editorId = editorId;

            const actionBar = document.createElement('div');
            actionBar.className = 'ace-action-bar';
            
            const langLabel = document.createElement('span');
            langLabel.className = 'ace-lang-label';
            langLabel.textContent = langRaw || 'text';

            const copyBtn = document.createElement('button');
            copyBtn.className = 'ace-copy-btn';
            copyBtn.textContent = 'Copy Code';
            copyBtn.onclick = () => {
                navigator.clipboard.writeText(codeContent).then(() => {
                    copyBtn.textContent = 'Copied!';
                    copyBtn.classList.add('success');
                    setTimeout(() => {
                        copyBtn.textContent = 'Copy Code';
                        copyBtn.classList.remove('success');
                    }, 2000);
                });
            };

            actionBar.appendChild(langLabel);
            actionBar.appendChild(copyBtn);

            const editorDiv = document.createElement('div');
            editorDiv.className = 'scribe-ace-editor';
            editorDiv.id = editorId;

            wrapper.appendChild(actionBar);
            wrapper.appendChild(editorDiv);

            pre.parentNode.replaceChild(wrapper, pre);
            this.editorObserver.observe(wrapper);
            this.observedNodes.set(editorId, wrapper);

            window.requestAnimationFrame(() => {
                if (window.ace) {
                    const editor = window.ace.edit(editorId);
                    this.editorPool.set(editorId, editor);
                    editor.setTheme("ace/theme/monokai");
                    editor.session.setMode(`ace/mode/${lang}`);
                    editor.setValue(codeContent, -1);
                    editor.setReadOnly(true);
                    editor.setOptions({
                        maxLines: 40,
                        minLines: 2,
                        showPrintMargin: false,
                        highlightActiveLine: false,
                        highlightGutterLine: false,
                        fontFamily: "var(--font-code)",
                        fontSize: "0.85rem",
                        wrap: true
                    });
                    window.requestAnimationFrame(() => {
                        editor.resize(true);
                    });
                } else {
                    const fallbackPre = document.createElement('pre');
                    fallbackPre.textContent = codeContent;
                    wrapper.replaceChild(fallbackPre, editorDiv);
                }
            });
        });
    }

    mapLanguageToAceMode(lang) {
        const modeMap = {
            'js': 'javascript',
            'py': 'python',
            'bash': 'sh',
            'shell': 'sh',
            'ts': 'typescript',
            'yml': 'yaml'
        };
        return modeMap[lang] || lang || 'text';
    }

    bindEvents() {
        this.dom.btnOpen.addEventListener('click', () => {
            if (window.Scribe && window.Scribe.openModal) window.Scribe.openModal(this.dom.modal);
        });

        this.dom.btnSearch.addEventListener('click', () => this.executeSearch());
        this.dom.searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this.executeSearch();
        });

        this.dom.quantSelect.addEventListener('change', () => this.updateProjection());
        
        this.dom.btnExecute.addEventListener('click', () => {
            if (this.isCompiling) {
                this.abortPipeline();
            } else {
                this.executeAcquisition();
            }
        });
    }

    async executeSearch() {
        const query = this.dom.searchInput.value.trim();
        if (!query) return;

        this.dom.btnSearch.disabled = true;
        this.dom.searchResults.innerHTML = '<div class="empty-state">Querying HuggingFace Hub...</div>';
        
        if (!this.isCompiling) {
            this.dom.quantSelect.innerHTML = '<option value="">Select a repository to probe bounds...</option>';
            this.dom.quantSelect.disabled = true;
            this.dom.btnExecute.disabled = true;
            this.dom.projectionBox.classList.add('hidden');
            this.selectedRepo = null;
        }

        try {
            const res = await fetch(`https://huggingface.co/api/models?search=${encodeURIComponent(query)}&limit=15&sort=downloads&direction=-1`);
            if (!res.ok) throw new Error(`Hub API Error: ${res.status}`);
            const models = await res.json();
            
            if (models.length === 0) {
                this.dom.searchResults.innerHTML = '<div class="empty-state">No repositories found matching the query.</div>';
                return;
            }

            this.dom.searchResults.innerHTML = '';
            models.forEach(model => {
                const card = document.createElement('div');
                card.className = 'model-card';
                if (this.selectedRepo === model.id) card.classList.add('active');
                
                const safeId = window.DOMPurify.sanitize(model.id);
                const downloads = (model.downloads || 0).toLocaleString();
                
                const cardContent = document.createElement('div');
                cardContent.className = 'model-card-content';
                
                const titleDiv = document.createElement('div');
                titleDiv.className = 'model-card-title';
                titleDiv.textContent = safeId;
                
                const statsDiv = document.createElement('div');
                statsDiv.className = 'model-card-stats';
                statsDiv.innerHTML = `&#8595; ${downloads} Downloads`;
                
                cardContent.appendChild(titleDiv);
                cardContent.appendChild(statsDiv);
                
                const infoBtn = document.createElement('button');
                infoBtn.className = 'icon-btn info-btn';
                infoBtn.title = "View Documentation";
                infoBtn.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;
                
                card.appendChild(cardContent);
                card.appendChild(infoBtn);

                infoBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.openReadmeViewer(model.id);
                });

                card.addEventListener('click', () => {
                    if (this.isCompiling) {
                        this.terminalLog("[WARN] Pipeline layout configuration locked during active compilation.");
                        return;
                    }
                    document.querySelectorAll('#acq-search-results .model-card').forEach(c => c.classList.remove('active'));
                    card.classList.add('active');
                    this.executeProbe(model.id);
                });

                this.dom.searchResults.appendChild(card);
            });

        } catch (error) {
            this.dom.searchResults.innerHTML = `<div class="empty-state" style="color: var(--status-error);">[SYSTEM ERROR] ${error.message}</div>`;
        } finally {
            this.dom.btnSearch.disabled = false;
        }
    }

    async executeProbe(repoId) {
        if (this.isCompiling) return;
        
        this.selectedRepo = repoId;
        this.dom.quantSelect.innerHTML = '<option value="">Probing architecture topologies...</option>';
        this.dom.quantSelect.disabled = true;
        this.dom.btnExecute.disabled = true;
        this.dom.projectionBox.classList.add('hidden');

        try {
            const res = await fetch('/api/acquisition/probe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ repo: repoId, token: this.hfToken })
            });

            const data = await res.json();
            if (data.status !== 'success') throw new Error(data.message);

            this.repoState = data;
            this.populateQuantDropdown();

        } catch (error) {
            this.dom.quantSelect.innerHTML = `<option value="">Probe Failed: ${error.message}</option>`;
        }
    }

    populateQuantDropdown() {
        this.dom.quantSelect.innerHTML = '';
        const isGgufRepo = this.repoState.is_gguf_repo;

        if (isGgufRepo) {
            const optgroup = document.createElement('optgroup');
            optgroup.label = "Direct Payload Transfer (Pre-Quantized)";
            
            this.repoState.gguf_files.sort((a, b) => a.name.localeCompare(b.name)).forEach(file => {
                const opt = document.createElement('option');
                opt.value = file.name;
                opt.dataset.direct = "true";
                opt.dataset.exactSize = file.size; 
                opt.textContent = file.name;
                optgroup.appendChild(opt);
            });
            this.dom.quantSelect.appendChild(optgroup);
            this.terminalLog(`[PROBE] Target identified as pre-quantized repository. Direct Transfer routing prioritized.`);
            this.dom.quantSelect.parentElement.previousElementSibling.textContent = "Select Pre-Quantized Artifact to Transfer";
        } else {
            const qGroup = document.createElement('optgroup');
            qGroup.label = "Standard K-Quants (Recommended)";
            [
                { val: "Q4_K_M", label: "Q4_K_M (Optimal Balance)", bpw: 4.5 },
                { val: "Q4_K_S", label: "Q4_K_S (Compact Balanced)", bpw: 4.15 },
                { val: "Q5_K_M", label: "Q5_K_M (High Fidelity)", bpw: 5.5 },
                { val: "Q6_K", label: "Q6_K (Max Quality)", bpw: 6.5 },
                { val: "Q8_0", label: "Q8_0 (Near Lossless)", bpw: 8.5 }
            ].forEach(q => this._createOption(qGroup, q.val, q.label, q.bpw, false));

            const iqGroup = document.createElement('optgroup');
            iqGroup.label = "Advanced Matrix-Guided I-Quants";
            [
                { val: "IQ4_NL", label: "IQ4_NL (Non-Linear Optimal)", bpw: 4.5 },
                { val: "IQ4_XS", label: "IQ4_XS (Dense Optimized)", bpw: 4.25 },
                { val: "IQ3_M", label: "IQ3_M (Balanced Compression)", bpw: 3.5 },
                { val: "IQ3_K_L", label: "IQ3_K_L (High-Density Structural)", bpw: 3.75 },
                { val: "IQ3_XXS", label: "IQ3_XXS (Extreme High-Density)", bpw: 3.0 },
                { val: "IQ2_S", label: "IQ2_S (Low-Bit Structural)", bpw: 2.5 },
                { val: "IQ2_XXS", label: "IQ2_XXS (Minimum Bound)", bpw: 2.2 }
            ].forEach(q => this._createOption(iqGroup, q.val, q.label, q.bpw, false));

            const legacyGroup = document.createElement('optgroup');
            legacyGroup.label = "Standard Integer Quants (Legacy)";
            [
                { val: "Q4_0", label: "Q4_0 (Standard 4-Bit Classic)", bpw: 4.2 },
                { val: "Q4_1", label: "Q4_1 (High-Entropy Linear 4-Bit)", bpw: 4.7 },
                { val: "Q2_K", label: "Q2_K (Legacy Minimum Resource Profile)", bpw: 2.6 }
            ].forEach(q => this._createOption(legacyGroup, q.val, q.label, q.bpw, false));

            const fp8Group = document.createElement('optgroup');
            fp8Group.label = "Hardware Floating Point (FP8)";
            [
                { val: "F8_E4M3", label: "F8_E4M3 (High Precision Weights)", bpw: 8.0 },
                { val: "F8_E5M2", label: "F8_E5M2 (Wider Dynamic Range)", bpw: 8.0 }
            ].forEach(q => this._createOption(fp8Group, q.val, q.label, q.bpw, false));

            const unqGroup = document.createElement('optgroup');
            unqGroup.label = "Native Base Artifacts (Unquantized)";
            [
                { val: "AUTO", label: "AUTO (Original Precision)", bpw: 16.0 },
                { val: "BF16", label: "BF16 (BFloat16)", bpw: 16.0 },
                { val: "F16", label: "F16 (Float16)", bpw: 16.0 }
            ].forEach(q => this._createOption(unqGroup, q.val, q.label, q.bpw, false));

            this.dom.quantSelect.appendChild(qGroup);
            this.dom.quantSelect.appendChild(iqGroup);
            this.dom.quantSelect.appendChild(legacyGroup);
            this.dom.quantSelect.appendChild(fp8Group);
            this.dom.quantSelect.appendChild(unqGroup);
            
            const archFlag = this.repoState.is_moe ? 'High-Density MoE' : 'Dense';
            this.terminalLog(`[PROBE] Interrogated ${archFlag} Raw Tensors. Hardware Forge routed for custom compilation.`);
            this.dom.quantSelect.parentElement.previousElementSibling.textContent = "Select Target Profile for Custom Forge";
        }

        this.dom.quantSelect.disabled = false;
        this.dom.btnExecute.disabled = false;
        this.updateProjection();
    }

    _createOption(group, value, label, bpw, isDirect) {
        const opt = document.createElement('option');
        opt.value = value;
        opt.textContent = label;
        opt.dataset.direct = isDirect;
        opt.dataset.bpw = bpw;
        group.appendChild(opt);
    }

    updateProjection() {
        if (!this.repoState || !this.selectedRepo || this.dom.quantSelect.selectedIndex === -1) return;
        
        const selectedOpt = this.dom.quantSelect.options[this.dom.quantSelect.selectedIndex];
        const isDirect = selectedOpt.dataset.direct === "true";

        if (isDirect) {
            const exactSizeBytes = parseInt(selectedOpt.dataset.exactSize) || 0;
            if (exactSizeBytes > 0) {
                const exactGB = exactSizeBytes / (1024 ** 3);
                this.dom.projectionValue.textContent = `Exact: ${exactGB.toFixed(2)} GB`;
                this.dom.projectionValue.style.color = "var(--status-ready)";
            } else {
                this.dom.projectionValue.textContent = "Exact (Direct Transfer)";
                this.dom.projectionValue.style.color = "var(--status-ready)";
            }
        } else {
            const bpw = parseFloat(selectedOpt.dataset.bpw) || 4.5;
            const baseSizeBytes = this.repoState.repo_size_bytes || 0;
            const sourcePrecision = this.repoState.source_precision || "F16";
            
            if (baseSizeBytes > 0) {
                // Adaptive divisor based on source model weights precision limits
                let precisionDivisor = 2; 
                if (sourcePrecision === "F32") precisionDivisor = 4;
                if (sourcePrecision === "F8") precisionDivisor = 1;

                const estimatedParams = baseSizeBytes / precisionDivisor;
                const projectedBytes = (estimatedParams * bpw) / 8;
                const projectedGB = projectedBytes / (1024 ** 3);
                
                this.dom.projectionValue.textContent = `~${projectedGB.toFixed(2)} GB`;
                this.dom.projectionValue.style.color = projectedGB > 20 ? "var(--status-error)" : "var(--status-inferring)";
                
                if (this.repoState.is_moe) {
                    this.dom.projectionValue.textContent += " (MoE Density Vector)";
                }
            } else {
                this.dom.projectionValue.textContent = "Unknown Dimensions";
                this.dom.projectionValue.style.color = "var(--text-muted)";
            }
        }
        this.dom.projectionBox.classList.remove('hidden');
    }

    async executeAcquisition() {
        if (window.Scribe && window.Scribe.state && window.Scribe.state.engineStatus !== 'offline' && window.Scribe.state.engineStatus !== 'error') {
            alert("Hardware Mutex Locked: You must teardown the active neural core (Top Right Nav) before initializing tensor compilation. Compiling while inferencing will trigger an Out-of-Memory crash.");
            return;
        }

        if (this.dom.quantSelect.selectedIndex === -1) return;
        const selectedOpt = this.dom.quantSelect.options[this.dom.quantSelect.selectedIndex];
        const isDirect = selectedOpt.dataset.direct === "true";
        const profile = selectedOpt.value;

        this.isCompiling = true;
        this.dom.quantSelect.disabled = true;
        
        this.dom.btnExecute.style.backgroundColor = "var(--status-error)";
        this.dom.executeText.textContent = "Abort Pipeline";
        this.dom.spinner.classList.remove('hidden');
        this.dom.terminal.textContent = "";

        try {
            const res = await fetch('/api/acquisition/start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    repo: this.selectedRepo,
                    token: this.hfToken,
                    profile: profile,
                    is_direct: isDirect,
                    requires_jinja: this.repoState.requires_jinja
                })
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Subservice execution failed.");

            this.dom.connStatus.textContent = "Socket Active";
            this.dom.connStatus.className = "terminal-status connected";
            
            this.initTelemetryStream();

        } catch (error) {
            this.terminalLog(`[SYSTEM ERROR] ${error.message}`);
            this.resetExecuteState();
        }
    }

    async abortPipeline() {
        this.dom.btnExecute.disabled = true;
        this.dom.executeText.textContent = "Aborting...";
        
        try {
            await fetch('/api/acquisition/stop', { method: 'POST' });
        } catch (e) {
            this.terminalLog(`[SYSTEM ERROR] Failed to abort backend process.`);
        } finally {
            this.resetExecuteState();
        }
    }

    initTelemetryStream() {
        if (this.telemetryStream) {
            this.telemetryStream.close();
        }
        
        this.telemetryStream = new EventSource('/api/acquisition/stream');

        this.telemetryStream.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.text === "[EOF]") {
                    if (this.telemetryStream) {
                        this.telemetryStream.close();
                        this.telemetryStream = null;
                    }
                    this.terminalLog(`\n[SYSTEM] Task Finalized. Stream closed.`);
                    this.resetExecuteState();
                    
                    if (window.Scribe && window.Scribe.fetchSystemTelemetry) {
                        this.terminalLog(`[SYSTEM] Synchronizing Gateway with new artifacts...`);
                        window.Scribe.fetchSystemTelemetry();
                    }
                } else {
                    this.terminalLog(data.text);
                }
            } catch (e) {}
        };

        this.telemetryStream.onerror = () => {
            this.terminalLog(`[SYSTEM ERROR] SSE Telemetry connection anomaly detected.`);
            if (this.telemetryStream) {
                this.telemetryStream.close();
                this.telemetryStream = null;
            }
            this.resetExecuteState();
        };
    }

    terminalLog(text) {
        this.dom.terminal.textContent += text + '\n';
        this.dom.terminal.scrollTop = this.dom.terminal.scrollHeight;
    }

    resetExecuteState() {
        this.isCompiling = false;
        this.dom.btnExecute.disabled = false;
        this.dom.quantSelect.disabled = false;
        
        this.dom.btnExecute.style.backgroundColor = "";
        this.dom.spinner.classList.add('hidden');
        this.dom.executeText.textContent = "Initialize Payload Transfer";
        
        this.dom.connStatus.textContent = "Idle";
        this.dom.connStatus.className = "terminal-status";
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.AcquisitionMatrix = new AcquisitionSubsystem();
});