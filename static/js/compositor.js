// Copyright (c) 2026 Hector Nunez. Licensed under PolyForm Shield License 1.0.0. See LICENSE.md.

class ScribeCompositor {
    constructor() {
        this.historyNode = document.getElementById('chat-history');
        this.activeStreams = new Map();
        this.editorPool = new Map();
        this.messageRegistry = new Map();
        this.observedNodes = new Map();
        this.mathRenderCache = new Map();
        this.messageCount = 0;

        // Optimized ResizeObserver with requestAnimationFrame batch tracking to prevent layout thrashing
        this.editorObserver = new ResizeObserver((entries) => {
            window.requestAnimationFrame(() => {
                for (let i = 0; i < entries.length; i++) {
                    const editorId = entries[i].target.dataset.editorId;
                    if (editorId && this.editorPool.has(editorId)) {
                        const editor = this.editorPool.get(editorId);
                        if (editor) editor.resize();
                    }
                }
            });
        });

        this._configureAcePaths();
        this._configureStyleMatrix();
        this._configureMarkdown();
    }

    _configureAcePaths() {
        if (window.ace && window.ace.config) {
            window.ace.config.set('basePath', 'lib/ace/');
            window.ace.config.set('workerPath', 'lib/ace/');
            // Pre-hydrate language extensions immediately to register global autocompleters
            window.ace.config.loadModule("ace/ext/language_tools");
        }
    }

    _configureStyleMatrix() {
        if (document.getElementById('scribe-compositor-styles')) return;
        const style = document.createElement('style');
        style.id = 'scribe-compositor-styles';
        style.textContent = `
            .scribe-math-block { display: block; margin: 1.5em 0; text-align: center; width: 100%; overflow-x: auto; overflow-y: hidden; }
            .scribe-math-block-display-override { display: block; margin: 1em 0; text-align: center; width: 100%; overflow-x: auto; overflow-y: hidden; }
            .scribe-math-inline { display: inline; }
            .scribe-text-block, .scribe-thought-block { width: 100%; }
            .scribe-artifact-native { width: 100%; padding: 1.25em; background: rgba(10, 10, 15, 0.6); border: 1px solid rgba(0, 255, 163, 0.15); border-radius: 8px; margin: 1.25em 0; overflow-x: auto; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, monospace; }
            .scribe-ace-wrapper { position: relative; width: 100%; margin: 1.25em 0; border-radius: 8px; border: 1px solid rgba(255, 255, 255, 0.08); background: #0d0d11; overflow: hidden; box-shadow: 0 8px 32px rgba(0, 0, 0, 0.35); }
            .scribe-ace-editor { width: 100%; }
            .scribe-math-raw { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; color: var(--text-muted); opacity: 0.8; white-space: pre-wrap; }
            
            .node-content details[data-block-type="think"] { background: rgba(7, 7, 10, 0.85); border-left: 3px solid #4f46e5; border-radius: 4px; padding: 1em; margin: 1em 0; box-shadow: inset 0 0 16px rgba(0,0,0,0.6); }
            .node-content details[data-block-type="think"] .thought-header { color: #818cf8; font-weight: 600; font-family: ui-monospace, monospace; text-transform: uppercase; letter-spacing: 0.05em; font-size: 0.85em; cursor: pointer; user-select: none; }
            .node-content details[data-block-type="think"] .thought-content { margin-top: 0.75em; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 0.75em; color: rgba(255,255,255,0.7); font-style: italic; }
            
            .node-content details.rlm-exec-block { background: rgba(5, 15, 10, 0.75); border-left: 3px solid #00ffa3; border-radius: 4px; padding: 1em; margin: 1em 0; }
            .node-content details.rlm-exec-block .rlm-header { color: #00ffa3; font-weight: 600; font-family: ui-monospace, monospace; text-transform: uppercase; letter-spacing: 0.05em; font-size: 0.85em; cursor: pointer; }
            
            .node-content details.rlm-result-block { background: rgba(10, 10, 20, 0.75); border-left: 3px solid #00bfff; border-radius: 4px; padding: 1em; margin: 1em 0; }
            .node-content details.rlm-result-block .rlm-result-header { color: #00bfff; font-weight: 600; font-family: ui-monospace, monospace; text-transform: uppercase; letter-spacing: 0.05em; font-size: 0.85em; cursor: pointer; }
            
            .scribe-status-badge.resolved { display: inline-flex; align-items: center; background: rgba(0, 255, 163, 0.1); border: 1px solid rgba(0, 255, 163, 0.3); color: #00ffa3; padding: 0.4em 1em; border-radius: 20px; font-size: 0.8em; font-family: ui-monospace, monospace; font-weight: 600; margin: 0.75em 0; letter-spacing: 0.02em; box-shadow: 0 0 12px rgba(0, 255, 163, 0.1); }
            .scribe-winner { background: rgba(255, 199, 0, 0.08); border: 1px dashed rgba(255, 199, 0, 0.3); padding: 1em; border-radius: 6px; color: #ffc700; margin: 1em 0; font-family: ui-monospace, monospace; font-size: 0.9em; }
        `;
        document.head.appendChild(style);
    }

    _configureMarkdown() {
        if (window.marked && window.marked.setOptions) {
            window.marked.setOptions({
                gfm: true,
                breaks: true
            });
        }
    }

    _escapeHtml(unsafeText) {
        return (unsafeText || '')
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    _resolveAceMode(langHint) {
        if (!langHint) return "ace/mode/text";
        
        const normalized = langHint.toLowerCase().trim();
        const aiQuirks = {
            'react': 'jsx', 'reactjs': 'jsx', 'vue3': 'vue', 'vue2': 'vue',
            'bash': 'sh', 'shell': 'sh', 'zsh': 'sh', 'c++': 'c_cpp', 'cpp': 'c_cpp', 'c': 'c_cpp',
            'c#': 'csharp', 'cs': 'csharp', 'f#': 'fsharp', 'fs': 'fsharp',
            'go': 'golang', 'rs': 'rust', 'rb': 'ruby', 'py': 'python',
            'js': 'javascript', 'ts': 'typescript', 'yml': 'yaml',
            'docker': 'dockerfile', 'node': 'javascript', 'md': 'markdown'
        };

        const targetLang = aiQuirks[normalized] || normalized;

        if (window.ace && window.ace.require) {
            const modelist = window.ace.require("ace/ext/modelist");
            if (modelist) {
                if (modelist.modesByName[targetLang]) return modelist.modesByName[targetLang].mode;
                const resolvedMode = modelist.getModeForPath(`virtual_file.${targetLang}`);
                if (resolvedMode && resolvedMode.name !== "text") return resolvedMode.mode;
            }
        }
        return "ace/mode/text";
    }

    _isEscaped(text, currentIndex) {
        let backslashCount = 0;
        let j = currentIndex - 1;
        while (j >= 0 && text[j] === '\\') {
            backslashCount++;
            j--;
        }
        return (backslashCount % 2 !== 0); 
    }

    _healKaTeX(tex) {
        if (!tex) return tex;
        let healed = tex.replace(/(^|[^\\])%(?![0-9a-fA-F]{2})/g, '$1\\%');

        healed = healed.replace(/\\begin\{align\}/g, '\\begin{aligned}')
                       .replace(/\\end\{align\}/g, '\\end{aligned}')
                       .replace(/\\begin\{align\*\}/g, '\\begin{aligned}')
                       .replace(/\\end\{align\*\}/g, '\\end{aligned}')
                       .replace(/\\begin\{equation\}/g, '\\begin{aligned}')
                       .replace(/\\end\{equation\}/g, '\\end{aligned}')
                       .replace(/\\begin\{equation\*\}/g, '\\begin{aligned}')
                       .replace(/\\end\{equation\*\}/g, '\\end{aligned}')
                       .replace(/\\begin\{eqnarray\}/g, '\\begin{aligned}')
                       .replace(/\\end\{eqnarray\}/g, '\\end{aligned}')
                       .replace(/\\begin\{eqnarray\*\}/g, '\\begin{aligned}')
                       .replace(/\\end\{eqnarray\*\}/g, '\\end{aligned}');
                  
        return healed;
    }

    _unifiedParseAndIsolate(text) {
        const blocks = [];
        const mathRegistry = [];
        let i = 0;
        const len = text.length;
        
        const stack = [{ type: 'text', content: '', attributes: '' }];
        
        let mathState = 'none'; 
        let currentMathBuffer = "";
        let activeEnvName = "";
        let braceDepth = 0;

        let inCodeFence = false;
        let activeFenceLength = 0;
        let inInlineCode = false;
        let activeInlineLength = 0;

        const targetTags = ['think', 'rlm_exec', 'rlm_result', 'status', 'candidate', 'evaluation', 'winner', 'artifact'];

        const flushMath = (mode, tex) => {
            if (!tex) return;
            const idx = mathRegistry.length;
            let b64 = "";
            try { b64 = btoa(encodeURIComponent(tex)); } 
            catch (e) { b64 = btoa(encodeURIComponent("$\\text{Stream Formatting...}$")); }
            
            mathRegistry.push({ type: mode, b64: b64, tex: tex });
            const token = mode === 'block' ? `\n\nSCRIBEMATHBLOCKX${idx}X\n\n` : `SCRIBEMATHINLINEX${idx}X`;
            stack[stack.length - 1].content += token;
        };

        while (i < len) {
            const currentContext = stack[stack.length - 1];
            const isEscapedToken = this._isEscaped(text, i);

            let tickCount = 0;
            let j = i;
            while (j < len && text[j] === '`') {
                tickCount++;
                j++;
            }

            if (tickCount > 0 && !isEscapedToken) {
                if (mathState === 'none') {
                    if (!inCodeFence && !inInlineCode) {
                        if (tickCount >= 3) {
                            inCodeFence = true; activeFenceLength = tickCount;
                        } else {
                            inInlineCode = true; activeInlineLength = tickCount;
                        }
                        currentContext.content += text.substring(i, j); i = j; continue;
                    } else if (inCodeFence && tickCount >= activeFenceLength) {
                        inCodeFence = false; activeFenceLength = 0;
                        currentContext.content += text.substring(i, j); i = j; continue;
                    } else if (inInlineCode && tickCount === activeInlineLength) {
                        inInlineCode = false; activeInlineLength = 0;
                        currentContext.content += text.substring(i, j); i = j; continue;
                    }
                } else {
                    currentMathBuffer += text.substring(i, j); i = j; continue;
                }
                currentContext.content += text.substring(i, j); i = j; continue;
            }

            let tagMatched = false;
            
            if (currentContext.type !== 'text') {
                const closeTag = `</${currentContext.type}>`;
                if (text.startsWith(closeTag, i)) {
                    if (mathState !== 'none') {
                        const isBlock = (mathState === 'block_dollar' || mathState === 'block_bracket' || mathState === 'env');
                        flushMath(isBlock ? 'block' : 'inline', currentMathBuffer);
                        mathState = 'none'; currentMathBuffer = ""; braceDepth = 0;
                    }
                    if (inCodeFence) {
                        currentContext.content += '\n```\n';
                        inCodeFence = false; activeFenceLength = 0;
                    }
                    if (inInlineCode) {
                        currentContext.content += '`';
                        inInlineCode = false; activeInlineLength = 0;
                    }

                    blocks.push({
                        type: currentContext.type,
                        content: currentContext.content,
                        attributes: currentContext.attributes,
                        isComplete: true
                    });
                    stack.pop();
                    i += closeTag.length;
                    continue;
                }
            }

            if (mathState === 'none' && !inCodeFence && !inInlineCode) {
                if (text[i] === '<' && text[i + 1] !== '/') {
                    let matchedTag = null;
                    for (let t = 0; t < targetTags.length; t++) {
                        const tag = targetTags[t];
                        if (text.startsWith(tag, i + 1)) {
                            const nextChar = text[i + 1 + tag.length];
                            if (nextChar === '>' || nextChar === ' ' || nextChar === '\t' || nextChar === '\n' || nextChar === '\r') {
                                matchedTag = tag; break;
                            }
                        }
                    }
                    
                    if (matchedTag) {
                        const attrStart = i + 1 + matchedTag.length;
                        let tagEndIndex = -1;
                        let inQuote = null;
                        
                        for (let k = attrStart; k < len; k++) {
                            const c = text[k];
                            if (c === '"' || c === "'") {
                                if (!inQuote) inQuote = c;
                                else if (inQuote === c) inQuote = null;
                            } else if (c === '>' && !inQuote) {
                                tagEndIndex = k; break;
                            }
                        }
                        
                        if (tagEndIndex !== -1) {
                            if (mathState !== 'none') {
                                const isBlock = (mathState === 'block_dollar' || mathState === 'block_bracket' || mathState === 'env');
                                flushMath(isBlock ? 'block' : 'inline', currentMathBuffer);
                                mathState = 'none'; currentMathBuffer = ""; braceDepth = 0;
                            }

                            if (currentContext.content) {
                                blocks.push({
                                    type: currentContext.type,
                                    content: currentContext.content,
                                    attributes: currentContext.attributes,
                                    isComplete: true 
                                });
                                currentContext.content = ''; 
                            }
                            
                            const newAttr = text.substring(attrStart, tagEndIndex).trim();
                            stack.push({ type: matchedTag, content: '', attributes: newAttr });
                            i = tagEndIndex + 1;
                            tagMatched = true; continue;
                        }
                    }
                }
            }
            if (tagMatched) continue;

            if (!inCodeFence && !inInlineCode) {
                if (mathState === 'none') {
                    if (text.startsWith('$$', i) && !isEscapedToken) {
                        mathState = 'block_dollar'; braceDepth = 0; i += 2; continue;
                    }
                    if (text.startsWith('\\[', i) && !isEscapedToken) {
                        mathState = 'block_bracket'; braceDepth = 0; i += 2; continue;
                    }
                    if (text.startsWith('\\(', i) && !isEscapedToken) {
                        mathState = 'inline_paren'; braceDepth = 0; i += 2; continue;
                    }
                    if (text.startsWith('\\begin{', i) && !isEscapedToken) {
                        const closeBrace = text.indexOf('}', i + 7);
                        if (closeBrace !== -1) {
                            const env = text.substring(i + 7, closeBrace);
                            const mathEnvs = ['align', 'align*', 'equation', 'equation*', 'eqnarray', 'eqnarray*', 'gather', 'gather*', 'CD', 'matrix', 'pmatrix', 'bmatrix', 'Bmatrix', 'vmatrix', 'Vmatrix', 'cases', 'rcases'];
                            if (mathEnvs.includes(env)) {
                                mathState = 'env'; braceDepth = 0; activeEnvName = env;
                                currentMathBuffer = text.substring(i, closeBrace + 1);
                                i = closeBrace + 1; continue;
                            }
                        }
                    }
                    if (text[i] === '$' && !isEscapedToken) {
                        if (i + 1 < len && !/^\d/.test(text[i+1]) && text[i+1] !== ' ') {
                            mathState = 'inline_dollar'; braceDepth = 0; i++; continue;
                        }
                    }
                } else {
                    if (text[i] === '{' && !isEscapedToken) { braceDepth++; currentMathBuffer += text[i]; i++; continue; }
                    if (text[i] === '}' && !isEscapedToken) { braceDepth = Math.max(0, braceDepth - 1); currentMathBuffer += text[i]; i++; continue; }

                    if (mathState === 'block_dollar') {
                        if (text.startsWith('$$', i) && !isEscapedToken && braceDepth === 0) {
                            flushMath('block', currentMathBuffer); currentMathBuffer = "";
                            mathState = 'none'; i += 2; continue;
                        }
                        currentMathBuffer += text[i]; i++; continue;
                    }
                    else if (mathState === 'block_bracket') {
                        if (text.startsWith('\\]', i) && !isEscapedToken && braceDepth === 0) {
                            flushMath('block', currentMathBuffer); currentMathBuffer = "";
                            mathState = 'none'; i += 2; continue;
                        }
                        currentMathBuffer += text[i]; i++; continue;
                    }
                    else if (mathState === 'inline_paren') {
                        if (text[i] === '\n' && text.substring(i).match(/^\n\s*\n/) && braceDepth === 0) {
                            currentContext.content += '\\(' + currentMathBuffer + '\n'; currentMathBuffer = "";
                            mathState = 'none'; i++; continue;
                        }
                        if (text.startsWith('\\)', i) && !isEscapedToken && braceDepth === 0) {
                            flushMath('inline', currentMathBuffer); currentMathBuffer = "";
                            mathState = 'none'; i += 2; continue;
                        }
                        currentMathBuffer += text[i]; i++; continue;
                    }
                    else if (mathState === 'inline_dollar') {
                        if (text.startsWith('$$', i) && !isEscapedToken && braceDepth === 0) {
                            currentContext.content += '$' + currentMathBuffer; currentMathBuffer = "";
                            mathState = 'block_dollar'; braceDepth = 0; i += 2; continue;
                        }
                        if (text[i] === '\n' && text.substring(i).match(/^\n\s*\n/) && braceDepth === 0) {
                            currentContext.content += '$' + currentMathBuffer + '\n'; currentMathBuffer = "";
                            mathState = 'none'; i++; continue;
                        }
                        if (text[i] === '$' && !isEscapedToken && braceDepth === 0) {
                            flushMath('inline', currentMathBuffer); currentMathBuffer = "";
                            mathState = 'none'; i++; continue;
                        }
                        currentMathBuffer += text[i]; i++; continue;
                    }
                    else if (mathState === 'env') {
                        const closeTag = `\\end{${activeEnvName}}`;
                        if (text.startsWith(closeTag, i) && !isEscapedToken && braceDepth === 0) {
                            currentMathBuffer += closeTag;
                            flushMath('block', currentMathBuffer); currentMathBuffer = "";
                            mathState = 'none'; activeEnvName = ""; i += closeTag.length; continue;
                        }
                        currentMathBuffer += text[i]; i++; continue;
                    }
                }
            }

            if (mathState === 'none') {
                currentContext.content += text[i];
            }
            i++;
        }

        if (mathState !== 'none') {
            const isBlock = (mathState === 'block_dollar' || mathState === 'block_bracket' || mathState === 'env');
            flushMath(isBlock ? 'block' : 'inline', currentMathBuffer);
        }

        for (let k = 0; k < stack.length; k++) {
            const ctx = stack[k];
            if (ctx.content || ctx.type !== 'text') {
                blocks.push({
                    type: ctx.type,
                    content: ctx.content,
                    attributes: ctx.attributes,
                    isComplete: false
                });
            }
        }

        if (blocks.length === 0) {
            blocks.push({
                type: 'text',
                content: '',
                attributes: '',
                isComplete: true
            });
        }

        return { blocks, registry: mathRegistry };
    }

    _injectMathNodes(targetElement, registry) {
        const walker = document.createTreeWalker(targetElement, NodeFilter.SHOW_TEXT, null, false);
        const nodesToProcess = [];
        let node;
        
        while (node = walker.nextNode()) {
            if (node.nodeValue.includes('SCRIBEMATH')) {
                nodesToProcess.push(node);
            }
        }

        nodesToProcess.forEach(textNode => {
            const parent = textNode.parentNode;
            if (!parent) return;

            const text = textNode.nodeValue;
            const fragment = document.createDocumentFragment();
            
            const parts = text.split(/(SCRIBEMATH(?:BLOCK|INLINE)X\d+X)/);

            parts.forEach(part => {
                if (part.startsWith('SCRIBEMATH')) {
                    const isBlock = part.includes('BLOCK');
                    const idxStr = part.match(/\d+/);
                    if (idxStr) {
                        const idx = parseInt(idxStr[0], 10);
                        const item = registry[idx];
                        if (item) {
                            const wrapper = document.createElement(isBlock ? 'div' : 'span');
                            wrapper.className = isBlock ? 'scribe-math-block' : 'scribe-math-inline';
                            wrapper.dataset.tex = item.b64;
                            fragment.appendChild(wrapper);
                            return;
                        }
                    }
                }
                if (part) {
                    fragment.appendChild(document.createTextNode(part));
                }
            });

            parent.replaceChild(fragment, textNode);
        });

        targetElement.querySelectorAll('.scribe-math-block').forEach(mathBlock => {
            let current = mathBlock;
            
            if (current.parentNode && current.parentNode.tagName === 'CODE') {
                const codeNode = current.parentNode;
                if (codeNode.childNodes.length === 1 && codeNode.parentNode && codeNode.parentNode.tagName === 'PRE') {
                    const preNode = codeNode.parentNode;
                    if (preNode.childNodes.length === 1) {
                        preNode.parentNode.replaceChild(mathBlock, preNode);
                        current = mathBlock;
                    }
                }
            }
            
            if (current.parentNode && current.parentNode.tagName === 'P') {
                const pNode = current.parentNode;
                const hasMeaningfulText = Array.from(pNode.childNodes).some(n => 
                    (n.nodeType === Node.TEXT_NODE && n.nodeValue.trim() !== '') || 
                    (n.nodeType === Node.ELEMENT_NODE && n !== current && n.tagName !== 'BR')
                );
                if (!hasMeaningfulText) {
                    pNode.parentNode.replaceChild(mathBlock, pNode);
                }
            }
        });
    }

    _mountAceEditor(wrapper, editorElementOrId, lang, content, isFinalized) {
        if (!window.ace) return null;

        let editor;
        let editorId;
        
        // Idempotent resolution checks to safely protect active elements from collisions
        if (typeof editorElementOrId === 'string') {
            editorId = editorElementOrId;
        } else {
            editorId = editorElementOrId.id || `ace-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
            if (!editorElementOrId.id) editorElementOrId.id = editorId;
        }

        // Cache verification pattern intercepts redundant window instantiation operations
        if (this.editorPool.has(editorId)) {
            editor = this.editorPool.get(editorId);
        } else {
            editor = window.ace.edit(typeof editorElementOrId === 'string' ? editorId : editorElementOrId);
            this.editorPool.set(editorId, editor);
        }

        editor.setTheme("ace/theme/twilight");
        
        const extOrLang = (lang && lang.indexOf('.') > -1) ? lang.split('.').pop() : lang;
        const aceModePath = this._resolveAceMode(extOrLang);
        editor.session.setMode(aceModePath);

        // Core local background syntax worker profiles to block unsupported 404 network crashes
        const activeModeName = aceModePath.split('/').pop();
        const locallySupportedWorkers = ['javascript', 'json', 'yaml', 'html', 'css', 'php', 'lua', 'xml', 'xquery', 'coffee'];
        
        let shouldUseWorker = false;
        if (isFinalized) {
            if (locallySupportedWorkers.includes(activeModeName)) {
                shouldUseWorker = true;
            } else if (activeModeName === 'jsx') {
                shouldUseWorker = true; // Fallback route onto standard javascript workers
            }
        }

        editor.setOptions({
            maxLines: 60,
            minLines: 4,
            autoScrollEditorIntoView: true,
            fontSize: "13px",
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'JetBrains Mono', monospace",
            showPrintMargin: false,
            useWorker: shouldUseWorker, 
            showFoldWidgets: true,
            wrap: true,
            indentedSoftWrap: true,
            highlightActiveLine: !!isFinalized,
            displayIndentGuides: true,
            highlightGutterLine: true,
            scrollPastEnd: 0.1,
            readOnly: false, // Unlocked globally to hook live autocompleters on target inputs
            enableBasicAutocompletion: true,
            enableLiveAutocompletion: true,
            enableSnippets: true,
            navigateWithinSoftTabs: true,
            animatedScroll: true,
            fadeFoldWidgets: true
        });

        editor.session.setTabSize(4);
        editor.session.setUseSoftTabs(true);

        if (editor.getValue() !== (content || '')) {
            editor.setValue(content || '', 1);
        }
        editor.clearSelection();

        if (wrapper && !this.observedNodes.has(editorId)) {
            this.editorObserver.observe(wrapper);
            this.observedNodes.set(editorId, wrapper);
        }
        return editor;
    }

    _renderMarkdownAndMath(targetElement, rawContent, registry) {
        let htmlOut = window.marked ? window.marked.parse(rawContent) : rawContent;
        
        if (window.DOMPurify) {
            htmlOut = window.DOMPurify.sanitize(htmlOut, {
                ADD_TAGS: ['details', 'summary', 'artifact', 'span', 'div'],
                ADD_ATTR: ['data-tex', 'data-lang', 'data-filename', 'class', 'target', 'rel', 'data-block-type'] 
            });
        }

        targetElement.innerHTML = htmlOut;
        if (registry && registry.length > 0) {
            this._injectMathNodes(targetElement, registry);
        }

        if (window.katex) {
            targetElement.querySelectorAll('.scribe-math-inline, .scribe-math-block').forEach(el => {
                const b64 = el.dataset.tex;
                if (!b64) return;
                
                const isBlock = el.classList.contains('scribe-math-block');
                const cacheKey = `${b64}-${isBlock ? 'block' : 'inline'}`;

                if (this.mathRenderCache.has(cacheKey)) {
                    el.innerHTML = this.mathRenderCache.get(cacheKey);
                    return;
                }

                let tex = '';
                try {
                    const decoded = atob(b64);
                    try { tex = decodeURIComponent(decoded); } catch(e) { tex = decoded; }
                    tex = this._healKaTeX(tex); 
                } catch (decodeErr) {
                    el.textContent = "Math Parse Error (Corrupt Base64)";
                    return;
                }

                try {
                    const container = document.createElement(isBlock ? 'div' : 'span');
                    window.katex.render(tex, container, { displayMode: isBlock, throwOnError: true });
                    
                    if (this.mathRenderCache.size >= 500) {
                        const firstKey = this.mathRenderCache.keys().next().value;
                        this.mathRenderCache.delete(firstKey);
                    }
                    this.mathRenderCache.set(cacheKey, container.innerHTML);
                    el.innerHTML = container.innerHTML;
                    el.classList.remove('scribe-math-raw');
                } catch (err) {
                    el.textContent = tex;
                    el.classList.add('scribe-math-raw');
                }
            });
        }

        targetElement.querySelectorAll('pre code').forEach(codeNode => {
            let isMathNode = false;
            codeNode.classList.forEach(cls => {
                if (['language-math', 'language-latex', 'language-katex'].includes(cls.toLowerCase())) {
                    isMathNode = true;
                }
            });
            if (isMathNode && window.katex) {
                const preElement = codeNode.parentNode;
                if (preElement && preElement.parentNode) {
                    const mathDiv = document.createElement('div');
                    mathDiv.className = 'scribe-math-block';
                    const rawText = this._healKaTeX(codeNode.textContent.trim());
                    
                    let safeKey = "";
                    try { safeKey = btoa(encodeURIComponent(rawText)); } catch(e) { safeKey = "error"; }
                    const cacheKey = safeKey + '-block';
                    
                    if (this.mathRenderCache.has(cacheKey)) {
                        mathDiv.innerHTML = this.mathRenderCache.get(cacheKey);
                    } else {
                        try {
                            window.katex.render(rawText, mathDiv, {
                                displayMode: true,
                                throwOnError: true
                            });
                            if (this.mathRenderCache.size >= 500) {
                                const firstKey = this.mathRenderCache.keys().next().value;
                                this.mathRenderCache.delete(firstKey);
                            }
                            this.mathRenderCache.set(cacheKey, mathDiv.innerHTML);
                        } catch (e) {
                            mathDiv.textContent = rawText;
                            mathDiv.classList.add('scribe-math-raw');
                        }
                    }
                    preElement.parentNode.replaceChild(mathDiv, preElement);
                }
            }
        });
    }

    appendMessage(role, initialText = '', visualContext = []) {
        this.messageCount++;
        const msgId = `msg-${Date.now()}-${this.messageCount}`;
        this.messageRegistry.set(msgId, initialText);
        
        const wrapper = document.createElement('div');
        wrapper.className = `message-node node-${role}`;
        wrapper.id = msgId;

        const label = document.createElement('div');
        label.className = 'node-label';
        label.innerHTML = role === 'assistant' 
            ? `<svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none"><path d="M12 2a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2 2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z"></path><path d="M12 8a6 6 0 0 1 6 6v5a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-5a6 6 0 0 1 6-6z"></path></svg> Scribe Engine`
            : `<svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg> Operator`;
        wrapper.appendChild(label);

        if (visualContext && visualContext.length > 0) {
            const contextTray = document.createElement('div');
            contextTray.className = 'node-visual-context';
            const fragment = document.createDocumentFragment();
            visualContext.forEach(b64 => {
                if (typeof b64 === 'string' && (b64.startsWith('data:image/') || b64.startsWith('blob:'))) {
                    const img = document.createElement('img');
                    img.src = b64;
                    img.className = 'context-thumbnail';
                    img.loading = 'lazy';
                    fragment.appendChild(img);
                }
            });
            contextTray.appendChild(fragment);
            wrapper.appendChild(contextTray);
        }

        const content = document.createElement('div');
        content.className = 'node-content markdown-body';
        wrapper.appendChild(content);
        this.historyNode.appendChild(wrapper);

        if (role === 'assistant') {
            this.activeStreams.set(msgId, {
                container: content,
                isPendingRender: false,
                lastRenderTime: 0,
                parsedBlocks: [], 
                blockNodes: [],
                mathRegistry: []
            });
            if (initialText) {
                this.streamToken(msgId, '');
            }
        } else {
            const parsed = this._unifiedParseAndIsolate(initialText);
            const fallbackContent = parsed.blocks && parsed.blocks[0] ? parsed.blocks[0].content : '';
            this._renderMarkdownAndMath(content, fallbackContent, parsed.registry);
        }

        this._scrollToBottom(true);
        return msgId;
    }

    streamToken(msgId, token) {
        const stream = this.activeStreams.get(msgId);
        if (!stream) return;

        const updatedText = (this.messageRegistry.get(msgId) || '') + token;
        this.messageRegistry.set(msgId, updatedText);

        if (!stream.isPendingRender) {
            stream.isPendingRender = true;
            const now = performance.now();
            const timeSinceLastRender = now - stream.lastRenderTime;
            const dynamicThrottle = Math.min(250, Math.max(16, Math.floor(updatedText.length / 200)));

            if (timeSinceLastRender >= dynamicThrottle) {
                window.requestAnimationFrame(() => this._renderBuffer(msgId));
            } else {
                setTimeout(() => {
                    if (stream.isPendingRender) {
                        window.requestAnimationFrame(() => this._renderBuffer(msgId));
                    }
                }, dynamicThrottle - timeSinceLastRender);
            }
        }
    }

    _createBlockElement(block, msgId, blockIndex) {
        const wrapper = document.createElement(
            ['think', 'rlm_exec', 'rlm_result', 'candidate', 'evaluation'].includes(block.type) ? 'details' : 'div'
        );
        let target = wrapper;
        wrapper.dataset.blockType = block.type; 

        if (block.type === 'text') {
            wrapper.className = 'scribe-text-block';
        } else if (block.type === 'artifact') {
            const langMatch = block.attributes.match(/language=["']?([^"'\s]+)["']?/i) || block.attributes.match(/lang=["']?([^"'\s]+)["']?/i);
            const nameMatch = block.attributes.match(/identifier=["']?([^"'\s]+)["']?/i) || block.attributes.match(/name=["']?([^"'\s]+)["']?/i);
            const lang = langMatch ? langMatch[1].toLowerCase() : 'text';
            const name = nameMatch ? nameMatch[1] : lang.toUpperCase();
            
            const delegateToNative = ['math', 'latex', 'katex', 'mermaid', 'markdown', 'md'];
            
            if (delegateToNative.includes(lang)) {
                wrapper.className = 'scribe-text-block scribe-artifact-native';
                wrapper.dataset.lang = lang;
                target = wrapper;
            } else {
                const editorId = `${msgId}-ace-art-${blockIndex}`;
                wrapper.className = 'scribe-ace-wrapper';
                wrapper.dataset.aceInjected = "true";
                wrapper.dataset.editorId = editorId;

                const actionBar = document.createElement('div');
                actionBar.className = 'ace-action-bar';
                
                const langLabel = document.createElement('span');
                langLabel.className = 'ace-lang-label';
                langLabel.textContent = name;

                const copyBtn = document.createElement('button');
                copyBtn.className = 'action-btn ace-copy-btn';
                copyBtn.innerHTML = 'Copy Code';
                
                actionBar.appendChild(langLabel);
                actionBar.appendChild(copyBtn);
                
                const editorDiv = document.createElement('div');
                editorDiv.id = editorId;
                editorDiv.className = 'scribe-ace-editor';
                
                wrapper.appendChild(actionBar);
                wrapper.appendChild(editorDiv);
                target = editorDiv;

                this._mountAceEditor(wrapper, editorDiv, lang, block.content, false);

                copyBtn.onclick = () => {
                    if (this.editorPool.has(editorId)) {
                        navigator.clipboard.writeText(this.editorPool.get(editorId).getValue()).then(() => {
                            copyBtn.innerHTML = 'Copied!';
                            copyBtn.classList.add('success');
                            setTimeout(() => {
                                copyBtn.innerHTML = 'Copy Code';
                                copyBtn.classList.remove('success');
                            }, 2000);
                        });
                    }
                };
            }
        } else if (['think', 'rlm_exec', 'rlm_result', 'candidate', 'evaluation'].includes(block.type)) {
            wrapper.className = 'scribe-thought-block';
            wrapper.open = true;

            const summary = document.createElement('summary');
            summary.className = 'thought-header';
            
            const contentDiv = document.createElement('div');
            contentDiv.className = 'thought-content';
            
            if (block.type === 'think') summary.textContent = 'Latent Reasoning Matrix';
            if (block.type === 'rlm_exec') {
                wrapper.classList.add('rlm-exec-block');
                summary.classList.add('rlm-header');
                summary.textContent = 'VFS Execution Sandbox';
                const pre = document.createElement('pre');
                const code = document.createElement('code');
                code.className = 'language-javascript';
                pre.appendChild(code);
                contentDiv.appendChild(pre);
                target = code;
            } else if (block.type === 'rlm_result') {
                wrapper.classList.add('rlm-result-block');
                summary.classList.add('rlm-result-header');
                summary.textContent = 'VFS Telemetry Return';
                const pre = document.createElement('pre');
                const code = document.createElement('code');
                pre.appendChild(code);
                contentDiv.appendChild(pre);
                target = code;
            } else if (block.type === 'candidate') {
                const idxMatch = block.attributes.match(/index=["']?(\d+)["']?/i);
                summary.textContent = `Trajectory Vector ${idxMatch ? idxMatch[1] : '?'}`;
                target = contentDiv;
            } else if (block.type === 'evaluation') {
                summary.textContent = 'Critic Protocol';
                target = contentDiv;
            } else {
                target = contentDiv;
            }

            wrapper.appendChild(summary);
            wrapper.appendChild(contentDiv);
        } else if (block.type === 'status' && block.content.includes('resolved')) {
            wrapper.className = 'scribe-status-badge resolved';
            wrapper.textContent = '✓ Mathematical Ground Truth Achieved';
        } else if (block.type === 'winner') {
            wrapper.className = 'scribe-winner';
            target = wrapper;
        }

        return { wrapper, target };
    }

    _updateBlockContent(nodeObj, block, registry) {
        if (block.type === 'status') return;
        if (nodeObj.lastContentTrace === block.content) return;
        nodeObj.lastContentTrace = block.content;

        if (block.type === 'text' || block.type === 'think' || block.type === 'candidate' || block.type === 'evaluation') {
            this._renderMarkdownAndMath(nodeObj.target, block.content, registry);
        } else if (block.type === 'winner') {
            nodeObj.target.innerHTML = `<strong>Optimal Vector Selected:</strong> ${window.DOMPurify.sanitize(this._escapeHtml(block.content))}`;
        } else if (block.type === 'artifact') {
            if (nodeObj.wrapper.classList.contains('scribe-artifact-native')) {
                const lang = nodeObj.wrapper.dataset.lang;
                let contentToRender = block.content;
                
                if (['math', 'latex', 'katex'].includes(lang)) {
                    contentToRender = contentToRender.trim();
                    if (!contentToRender.startsWith('$$') && !contentToRender.startsWith('\\begin') && !contentToRender.startsWith('\\[')) {
                        contentToRender = `$$\n${contentToRender}\n$$`;
                    }
                    const fakeParsed = this._unifiedParseAndIsolate(contentToRender);
                    this._renderMarkdownAndMath(nodeObj.target, fakeParsed.blocks[0].content, fakeParsed.registry);
                } else if (lang === 'mermaid') {
                    contentToRender = `\`\`\`mermaid\n${contentToRender.trim()}\n\`\`\``;
                    this._renderMarkdownAndMath(nodeObj.target, contentToRender, []);
                } else {
                    this._renderMarkdownAndMath(nodeObj.target, contentToRender, []);
                }
            } else {
                const editorId = nodeObj.wrapper.dataset.editorId;
                if (window.ace && editorId && this.editorPool.has(editorId)) {
                    const editor = this.editorPool.get(editorId);
                    if (editor) {
                        const currentVal = editor.getValue();
                        if (block.content !== currentVal) {
                            if (block.content.startsWith(currentVal)) {
                                const newText = block.content.substring(currentVal.length);
                                const lastRow = editor.session.getLength() - 1;
                                const lastCol = editor.session.getLine(lastRow).length;
                                editor.session.insert({row: lastRow, column: lastCol}, newText);
                            } else {
                                const scrollPos = editor.session.getScrollTop();
                                editor.setValue(block.content, 1);
                                editor.session.setScrollTop(scrollPos);
                            }
                            editor.clearSelection();
                        }
                    }
                }
            }
        } else if (block.type === 'rlm_exec' || block.type === 'rlm_result') {
            if (nodeObj.target.textContent !== block.content) {
                nodeObj.target.textContent = block.content;
            }
        }
    }

    _renderBuffer(msgId) {
        const stream = this.activeStreams.get(msgId);
        if (!stream) return;

        stream.lastRenderTime = performance.now();
        const isAtBottom = this._isScrolledToBottom();
        const rawText = this.messageRegistry.get(msgId) || '';
        
        const parsedData = this._unifiedParseAndIsolate(rawText);
        const currentBlocks = parsedData.blocks;
        stream.mathRegistry = parsedData.registry;

        if (currentBlocks.length < stream.blockNodes.length) {
            for (let j = currentBlocks.length; j < stream.blockNodes.length; j++) {
                const deadNode = stream.blockNodes[j];
                if (deadNode && deadNode.wrapper) {
                    deadNode.wrapper.remove();
                    const editorId = deadNode.wrapper.dataset.editorId;
                    if (editorId && this.editorPool.has(editorId)) {
                        try {
                            this.editorPool.get(editorId).destroy();
                            this.editorPool.delete(editorId);
                        } catch (e) {}
                    }
                }
            }
            stream.blockNodes.length = currentBlocks.length;
        }

        for (let i = 0; i < currentBlocks.length; i++) {
            const block = currentBlocks[i];
            const prevBlock = stream.parsedBlocks[i];

            if (prevBlock && prevBlock.isComplete && prevBlock.content === block.content) {
                continue; 
            }

            let nodeObj = stream.blockNodes[i];
            
            if (nodeObj && nodeObj.wrapper && nodeObj.wrapper.dataset.blockType !== block.type) {
                nodeObj.wrapper.remove();
                const editorId = nodeObj.wrapper.dataset.editorId;
                if (editorId && this.editorPool.has(editorId)) {
                    try {
                        this.editorPool.get(editorId).destroy();
                        this.editorPool.delete(editorId);
                    } catch (e) {}
                }
                nodeObj = null;
            }

            if (!nodeObj) {
                nodeObj = this._createBlockElement(block, msgId, i);
                stream.container.appendChild(nodeObj.wrapper);
                stream.blockNodes[i] = nodeObj;
                
                if (block.type === 'artifact' && nodeObj.wrapper.dataset.aceInjected === "true") {
                    const editorId = nodeObj.wrapper.dataset.editorId;
                    if (this.editorPool.has(editorId)) {
                        this.editorPool.get(editorId).resize();
                    }
                }
            }

            this._updateBlockContent(nodeObj, block, stream.mathRegistry);

            if (block.isComplete && nodeObj.wrapper.tagName === 'DETAILS') {
                if (block.type === 'think' || block.type === 'rlm_exec' || block.type === 'rlm_result' || block.type === 'candidate') {
                    nodeObj.wrapper.removeAttribute('open');
                }
            }
        }

        stream.parsedBlocks = currentBlocks;
        if (isAtBottom) this._scrollToBottom(false);
        stream.isPendingRender = false;
    }

    finalizeMessage(msgId) {
        const stream = this.activeStreams.get(msgId);
        if (!stream) return;

        stream.lastRenderTime = 0; 
        this._renderBuffer(msgId);

        stream.parsedBlocks.forEach((block, index) => {
            const nodeObj = stream.blockNodes[index];
            if (nodeObj && block.type === 'artifact') {
                const editorId = nodeObj.wrapper.dataset.editorId;
                if (editorId) {
                    const langMatch = block.attributes.match(/language=["']?([^"'\s]+)["']?/i) || block.attributes.match(/lang=["']?([^"'\s]+)["']?/i);
                    const lang = langMatch ? langMatch[1].toLowerCase() : 'text';
                    this._mountAceEditor(nodeObj.wrapper, editorId, lang, block.content, true);
                }
            }
            if (!block.isComplete) {
                if (nodeObj && nodeObj.wrapper.tagName === 'DETAILS') {
                    nodeObj.wrapper.removeAttribute('open');
                    const eofMarker = document.createElement('div');
                    eofMarker.style.cssText = "font-size: 0.75em; color: var(--text-muted); margin-top: 8px; font-style: italic;";
                    eofMarker.textContent = "[System: Syntactic boundary forced closed by Compositor]";
                    nodeObj.target.appendChild(eofMarker);
                }
            }
        });

        const allPres = Array.from(stream.container.querySelectorAll('pre'));
        const delegateToNative = ['math', 'latex', 'katex', 'mermaid', 'markdown', 'md'];

        const blocksToProcess = allPres.filter(pre => {
            if (pre.closest('.thought-content') || pre.closest('.scribe-ace-wrapper') || pre.closest('.scribe-artifact-native')) return false;
            
            const codeNode = pre.querySelector('code');
            if (codeNode) {
                const hasBlacklistedLang = Array.from(codeNode.classList).some(cls => {
                    const lang = cls.toLowerCase().replace('language-', '');
                    return delegateToNative.includes(lang);
                });
                if (hasBlacklistedLang) return false;
            }
            return true;
        });

        for (let index = 0; index < blocksToProcess.length; index++) {
            const blockElement = blocksToProcess[index];
            if (blockElement.dataset.aceInjected) continue; 
            
            const codeNode = blockElement.querySelector('code');
            if (!codeNode) continue;

            const rawCode = codeNode.textContent;
            let lang = "text";

            codeNode.classList.forEach(cls => {
                if (cls.startsWith('language-')) lang = cls.replace('language-', '');
            });
            const displayLabel = lang.toUpperCase() || "TEXT";

            const editorId = `${msgId}-ace-${index}`;
            const aceContainer = document.createElement('div');
            aceContainer.className = 'scribe-ace-wrapper';
            aceContainer.dataset.editorId = editorId; 
            
            const editorDiv = document.createElement('div');
            editorDiv.id = editorId;
            editorDiv.className = 'scribe-ace-editor';
            editorDiv.textContent = rawCode;

            const actionBar = document.createElement('div');
            actionBar.className = 'ace-action-bar';
            
            const langLabel = document.createElement('span');
            langLabel.className = 'ace-lang-label';
            langLabel.textContent = displayLabel;

            const copyBtn = document.createElement('button');
            copyBtn.className = 'action-btn ace-copy-btn';
            copyBtn.innerHTML = 'Copy Code';
            
            copyBtn.onclick = () => {
                if (this.editorPool.has(editorId)) {
                    const editorValue = this.editorPool.get(editorId).getValue();
                    navigator.clipboard.writeText(editorValue).then(() => {
                        copyBtn.innerHTML = 'Copied!';
                        copyBtn.classList.add('success');
                        setTimeout(() => {
                            copyBtn.innerHTML = 'Copy Code';
                            copyBtn.classList.remove('success');
                        }, 2000);
                    });
                }
            };

            actionBar.appendChild(langLabel);
            actionBar.appendChild(copyBtn);
            aceContainer.appendChild(actionBar);
            aceContainer.appendChild(editorDiv);

            blockElement.parentNode.replaceChild(aceContainer, blockElement);
            aceContainer.dataset.aceInjected = "true";

            this._mountAceEditor(aceContainer, editorDiv, lang, rawCode, true);
        }

        this.activeStreams.delete(msgId);
        this._scrollToBottom(true);
    }

    purgeMessagePool(msgId) {
        this.editorPool.forEach((editor, id) => {
            if (id.startsWith(msgId)) {
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
        this.messageRegistry.delete(msgId);
    }

    _isScrolledToBottom() {
        const threshold = 250;
        return (this.historyNode.scrollHeight - this.historyNode.scrollTop - this.historyNode.clientHeight) <= threshold;
    }

    _scrollToBottom(force = false) {
        if (force || this._isScrolledToBottom()) {
            this.historyNode.scrollTop = this.historyNode.scrollHeight;
        }
    }
}

window.Compositor = new ScribeCompositor();