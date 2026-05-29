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

        this._configureAcePaths();
        this._configureStyleMatrix();
        this._configureMarkdown();
    }

    _configureAcePaths() {
        if (window.ace && window.ace.config) {
            window.ace.config.set('basePath', 'lib/ace/');
            window.ace.config.set('workerPath', 'lib/ace/');
        }
    }

    _configureStyleMatrix() {
        if (document.getElementById('scribe-compositor-styles')) return;
        const style = document.createElement('style');
        style.id = 'scribe-compositor-styles';
        style.textContent = `
            .scribe-math-block { display: block; margin: 1em 0; text-align: center; width: 100%; overflow-x: auto; overflow-y: hidden; }
            .scribe-math-block-display-override { display: block; margin: 1em 0; text-align: center; width: 100%; overflow-x: auto; overflow-y: hidden; }
            .scribe-math-inline { display: inline; }
            .scribe-text-block, .scribe-thought-block { width: 100%; }
            .scribe-ace-wrapper { position: relative; width: 100%; margin: 1em 0; }
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

    _lexicalStreamParse(text) {
        const blocks = [];
        let i = 0;
        const len = text.length;
        
        let currentState = 'text'; 
        let currentAttr = '';
        let currentBlockContent = '';
        
        let inCodeFence = false;
        let inInlineCode = false;
        
        const targetTags = ['think', 'rlm_exec', 'rlm_result', 'status', 'candidate', 'evaluation', 'winner', 'artifact'];
        
        while (i < len) {
            if (currentState === 'text') {
                if (text.startsWith('```', i)) {
                    inCodeFence = !inCodeFence;
                    currentBlockContent += '```';
                    i += 3;
                    continue;
                }
                if (!inCodeFence && text[i] === '`') {
                    inInlineCode = !inInlineCode;
                    currentBlockContent += '`';
                    i++;
                    continue;
                }
                
                if (!inCodeFence && !inInlineCode && text[i] === '<' && text[i + 1] !== '/') {
                    let matchedTag = null;
                    for (const tag of targetTags) {
                        if (text.startsWith(tag, i + 1)) {
                            const nextChar = text[i + 1 + tag.length];
                            if (nextChar === '>' || nextChar === ' ' || nextChar === '\t' || nextChar === '\n' || nextChar === '\r') {
                                matchedTag = tag;
                                break;
                            }
                        }
                    }
                    
                    if (matchedTag) {
                        if (currentBlockContent) {
                            blocks.push({ type: 'text', content: currentBlockContent, isComplete: true });
                            currentBlockContent = '';
                        }
                        
                        const attrStart = i + 1 + matchedTag.length;
                        let tagEndIndex = -1;
                        let inQuote = null;
                        
                        for (let j = attrStart; j < len; j++) {
                            const c = text[j];
                            if (c === '"' || c === "'") {
                                if (!inQuote) inQuote = c;
                                else if (inQuote === c) inQuote = null;
                            } else if (c === '>' && !inQuote) {
                                tagEndIndex = j;
                                break;
                            }
                        }
                        
                        if (tagEndIndex !== -1) {
                            currentAttr = text.substring(attrStart, tagEndIndex).trim();
                            currentState = matchedTag;
                            i = tagEndIndex + 1;
                            continue;
                        }
                    }
                }
                
                currentBlockContent += text[i];
                i++;
            } else {
                if (text.startsWith('```', i)) {
                    inCodeFence = !inCodeFence;
                    currentBlockContent += '```';
                    i += 3;
                    continue;
                }
                if (!inCodeFence && text[i] === '`') {
                    inInlineCode = !inInlineCode;
                    currentBlockContent += '`';
                    i++;
                    continue;
                }

                const closeTag = `</${currentState}>`;
                if (!inCodeFence && !inInlineCode && text.startsWith(closeTag, i)) {
                    blocks.push({
                        type: currentState,
                        content: currentBlockContent,
                        attributes: currentAttr,
                        isComplete: true
                    });
                    currentBlockContent = '';
                    currentAttr = '';
                    currentState = 'text';
                    i += closeTag.length;
                    continue;
                }
                
                if (!inCodeFence && !inInlineCode && text[i] === '<' && text[i + 1] !== '/') {
                    let matchedTag = null;
                    for (const tag of targetTags) {
                        if (text.startsWith(tag, i + 1)) {
                            const nextChar = text[i + 1 + tag.length];
                            if (nextChar === '>' || nextChar === ' ' || nextChar === '\t' || nextChar === '\n' || nextChar === '\r') {
                                matchedTag = tag;
                                break;
                            }
                        }
                    }
                    
                    if (matchedTag && matchedTag !== currentState) {
                        blocks.push({
                            type: currentState,
                            content: currentBlockContent,
                            attributes: currentAttr,
                            isComplete: true
                        });
                        currentBlockContent = '';
                        currentAttr = '';
                        
                        const attrStart = i + 1 + matchedTag.length;
                        let tagEndIndex = -1;
                        let inQuote = null;
                        
                        for (let j = attrStart; j < len; j++) {
                            const c = text[j];
                            if (c === '"' || c === "'") {
                                if (!inQuote) inQuote = c;
                                else if (inQuote === c) inQuote = null;
                            } else if (c === '>' && !inQuote) {
                                tagEndIndex = j;
                                break;
                            }
                        }
                        
                        if (tagEndIndex !== -1) {
                            currentAttr = text.substring(attrStart, tagEndIndex).trim();
                            currentState = matchedTag;
                            i = tagEndIndex + 1;
                            continue;
                        }
                    }
                }
                
                currentBlockContent += text[i];
                i++;
            }
        }
        
        if (currentBlockContent || currentState !== 'text') {
            blocks.push({
                type: currentState,
                content: currentBlockContent,
                attributes: currentAttr,
                isComplete: false
            });
        }
        
        return blocks;
    }

    _isolateAndPreprocessMath(text) {
        const mathRegistry = [];
        let output = text;

        output = output.replace(/\$\$([\s\S]*?)\$\$/g, (match, tex) => {
            const idx = mathRegistry.length;
            mathRegistry.push({ type: 'block', tex: tex });
            return `SCRIBEMATHBLOCKX${idx}X`;
        });

        output = output.replace(/\\\[([\s\S]*?)\\\]/g, (match, tex) => {
            const idx = mathRegistry.length;
            mathRegistry.push({ type: 'block', tex: tex });
            return `SCRIBEMATHBLOCKX${idx}X`;
        });

        output = output.replace(/\\\(([\s\S]*?)\\\)/g, (match, tex) => {
            const idx = mathRegistry.length;
            mathRegistry.push({ type: 'inline', tex: tex });
            return `SCRIBEMATHINLINEX${idx}X`;
        });

        output = output.replace(/\$((?:\\[\s\S]|[^$\\\n])+?)\$/g, (match, tex) => {
            if (/^\d/.test(tex) && !/[\_\^{}+=\-*/<>\\|]/.test(tex)) {
                return match;
            }
            const idx = mathRegistry.length;
            mathRegistry.push({ type: 'inline', tex: tex });
            return `SCRIBEMATHINLINEX${idx}X`;
        });

        const lastDisplayDollar = output.lastIndexOf('$$');
        const lastDisplayBracket = output.lastIndexOf('\\[');
        const lastInlineParen = output.lastIndexOf('\\(');
        const lastInlineDollar = output.lastIndexOf('$');

        let maxIdx = -1;
        let selectedMode = null;
        let delimiterLength = 0;

        if (lastDisplayDollar > maxIdx) { maxIdx = lastDisplayDollar; selectedMode = 'block'; delimiterLength = 2; }
        if (lastDisplayBracket > maxIdx) { maxIdx = lastDisplayBracket; selectedMode = 'block'; delimiterLength = 2; }
        if (lastInlineParen > maxIdx) { maxIdx = lastInlineParen; selectedMode = 'inline'; delimiterLength = 2; }
        if (lastInlineDollar > maxIdx) {
            const tail = output.substring(lastInlineDollar + 1);
            if (!/^\d/.test(tail)) {
                maxIdx = lastInlineDollar; selectedMode = 'inline'; delimiterLength = 1;
            }
        }

        if (maxIdx !== -1) {
            const openPiece = output.substring(0, maxIdx);
            const closePiece = output.substring(maxIdx + delimiterLength);
            if (!closePiece.includes('SCRIBEMATH')) {
                const idx = mathRegistry.length;
                mathRegistry.push({ type: selectedMode, tex: closePiece });
                output = openPiece + `SCRIBEMATH${selectedMode.toUpperCase()}X${idx}X`;
            }
        }

        return { content: output, registry: mathRegistry };
    }

    _isolateAndPreprocessMath(text) {
        const mathRegistry = [];
        let output = text;

        // 1. Process closed block math elements
        output = output.replace(/\$\$([\s\S]*?)\$\$/g, (match, tex) => {
            const idx = mathRegistry.length;
            mathRegistry.push({ type: 'block', tex: tex });
            return `SCRIBEMATHBLOCKX${idx}X`;
        });

        output = output.replace(/\\\[([\s\S]*?)\\\]/g, (match, tex) => {
            const idx = mathRegistry.length;
            mathRegistry.push({ type: 'block', tex: tex });
            return `SCRIBEMATHBLOCKX${idx}X`;
        });

        // 2. Process closed inline math elements (allowing multi-line expressions via [\s\S])
        output = output.replace(/\\\(([\s\S]*?)\\\)/g, (match, tex) => {
            const idx = mathRegistry.length;
            mathRegistry.push({ type: 'inline', tex: tex });
            return `SCRIBEMATHINLINEX${idx}X`;
        });

        output = output.replace(/\$((?:\\[\s\S]|[^$\\])+?)\$/g, (match, tex) => {
            if (/^\d/.test(tex) && !/[\_\^{}+=\-*/<>\\|]/.test(tex)) {
                return match;
            }
            const idx = mathRegistry.length;
            mathRegistry.push({ type: 'inline', tex: tex });
            return `SCRIBEMATHINLINEX${idx}X`;
        });

        // 3. Robust Unclosed Streaming Context Architecture
        const lastDisplayDollar = output.lastIndexOf('$$');
        const lastDisplayBracket = output.lastIndexOf('\\[');
        const lastInlineParen = output.lastIndexOf('\\(');
        const lastInlineDollar = output.lastIndexOf('$');

        let maxIdx = -1;
        let selectedMode = null;
        let delimiterLength = 0;

        if (lastDisplayDollar > maxIdx) { maxIdx = lastDisplayDollar; selectedMode = 'block'; delimiterLength = 2; }
        if (lastDisplayBracket > maxIdx) { maxIdx = lastDisplayBracket; selectedMode = 'block'; delimiterLength = 2; }
        if (lastInlineParen > maxIdx) { maxIdx = lastInlineParen; selectedMode = 'inline'; delimiterLength = 2; }
        
        // Prevent a single-dollar query from overlapping onto an active double-dollar block boundary
        if (lastInlineDollar > maxIdx) {
            const isDoubleDollarOverload = (lastInlineDollar > 0 && output[lastInlineDollar - 1] === '$') || 
                                           (lastInlineDollar < output.length - 1 && output[lastInlineDollar + 1] === '$');
            if (!isDoubleDollarOverload) {
                const tail = output.substring(lastInlineDollar + 1);
                if (!/^\d/.test(tail)) {
                    maxIdx = lastInlineDollar; selectedMode = 'inline'; delimiterLength = 1;
                }
            }
        }

        if (maxIdx !== -1) {
            const openPiece = output.substring(0, maxIdx);
            const closePiece = output.substring(maxIdx + delimiterLength);
            if (!closePiece.includes('SCRIBEMATH')) {
                const idx = mathRegistry.length;
                mathRegistry.push({ type: selectedMode, tex: closePiece });
                output = openPiece + `SCRIBEMATH${selectedMode.toUpperCase()}X${idx}X`;
            }
        }

        return { content: output, registry: mathRegistry };
    }

    _renderMarkdownAndMath(targetElement, rawContent) {
        const processed = this._isolateAndPreprocessMath(rawContent);
        let htmlOut = window.marked ? window.marked.parse(processed.content) : processed.content;
        
        if (window.DOMPurify) {
            htmlOut = window.DOMPurify.sanitize(htmlOut, {
                ADD_TAGS: ['details', 'summary', 'artifact', 'span', 'div'],
                ADD_ATTR: ['data-tex', 'data-lang', 'data-filename', 'class']
            });
        }

        processed.registry.forEach((item, idx) => {
            const token = `SCRIBEMATH${item.type.toUpperCase()}X${idx}X`;
            const b64 = btoa(encodeURIComponent(item.tex));
            const className = item.type === 'block' ? 'scribe-math-block' : 'scribe-math-inline';
            const elementHtml = item.type === 'block' 
                ? `<div class="${className}" data-tex="${b64}"></div>` 
                : `<span class="${className}" data-tex="${b64}"></span>`;
            
            htmlOut = htmlOut.replace(token, elementHtml);
        });

        targetElement.innerHTML = htmlOut;

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
                try {
                    // Corrected: Pure symmetrically balanced decoding strategy
                    const tex = decodeURIComponent(atob(b64));
                    const container = document.createElement(isBlock ? 'div' : 'span');
                    window.katex.render(tex, container, { displayMode: isBlock, throwOnError: false });
                    
                    if (this.mathRenderCache.size >= 500) {
                        const firstKey = this.mathRenderCache.keys().next().value;
                        this.mathRenderCache.delete(firstKey);
                    }
                    this.mathRenderCache.set(cacheKey, container.innerHTML);
                    el.innerHTML = container.innerHTML;
                } catch (err) {
                    el.textContent = decodeURIComponent(atob(b64));
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
                    const rawText = codeNode.textContent.trim();
                    const cacheKey = btoa(encodeURIComponent(rawText)) + '-block';
                    
                    if (this.mathRenderCache.has(cacheKey)) {
                        mathDiv.innerHTML = this.mathRenderCache.get(cacheKey);
                    } else {
                        try {
                            window.katex.render(rawText, mathDiv, {
                                displayMode: true,
                                throwOnError: false
                            });
                            if (this.mathRenderCache.size >= 500) {
                                const firstKey = this.mathRenderCache.keys().next().value;
                                this.mathRenderCache.delete(firstKey);
                            }
                            this.mathRenderCache.set(cacheKey, mathDiv.innerHTML);
                        } catch (e) {
                            mathDiv.textContent = rawText;
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
                blockNodes: []    
            });
            if (initialText) {
                this.streamToken(msgId, '');
            }
        } else {
            this._renderMarkdownAndMath(content, initialText);
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

        if (block.type === 'text') {
            wrapper.className = 'scribe-text-block';
        } else if (block.type === 'artifact') {
            const langMatch = block.attributes.match(/language=["']?([^"'\s]+)["']?/i) || block.attributes.match(/lang=["']?([^"'\s]+)["']?/i);
            const nameMatch = block.attributes.match(/identifier=["']?([^"'\s]+)["']?/i) || block.attributes.match(/name=["']?([^"'\s]+)["']?/i);
            const lang = langMatch ? langMatch[1] : 'text';
            const name = nameMatch ? nameMatch[1] : lang.toUpperCase();
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

            window.requestAnimationFrame(() => {
                if (window.ace) {
                    const editor = window.ace.edit(editorId);
                    this.editorPool.set(editorId, editor);
                    editor.setTheme("ace/theme/twilight");
                    
                    let aceModePath = "ace/mode/text";
                    if (window.ace.require) {
                        const modelist = window.ace.require("ace/ext/modelist");
                        if (modelist) {
                            const virtualFileName = name.indexOf('.') > -1 ? name : `virtual_artifact.${lang}`;
                            const resolvedMode = modelist.getModeForPath(virtualFileName);
                            if (resolvedMode && resolvedMode.mode) aceModePath = resolvedMode.mode;
                        }
                    }
                    editor.session.setMode(aceModePath);
                    editor.setOptions({
                        maxLines: 60,
                        minLines: 2,
                        autoScrollEditorIntoView: true,
                        fontSize: "14px",
                        showPrintMargin: false,
                        useWorker: false, 
                        showFoldWidgets: true,
                        wrap: true,
                        highlightActiveLine: true,
                        displayIndentGuides: true,
                        highlightGutterLine: true,
                        scrollPastEnd: 0.2,
                        readOnly: false
                    });
                    editor.setValue(block.content, 1);
                    this.editorObserver.observe(wrapper);
                    this.observedNodes.set(editorId, wrapper);
                    
                    copyBtn.onclick = () => {
                        navigator.clipboard.writeText(editor.getValue()).then(() => {
                            copyBtn.innerHTML = 'Copied!';
                            copyBtn.classList.add('success');
                            setTimeout(() => {
                                copyBtn.innerHTML = 'Copy Code';
                                copyBtn.classList.remove('success');
                            }, 2000);
                        });
                    };
                }
            });
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

    _updateBlockContent(nodeObj, block) {
        if (block.type === 'status') return;
        if (nodeObj.lastContentTrace === block.content) return;
        nodeObj.lastContentTrace = block.content;

        if (block.type === 'text' || block.type === 'think' || block.type === 'candidate' || block.type === 'evaluation') {
            this._renderMarkdownAndMath(nodeObj.target, block.content);
        } else if (block.type === 'winner') {
            nodeObj.target.innerHTML = `<strong>Optimal Vector Selected:</strong> ${DOMPurify.sanitize(this._escapeHtml(block.content))}`;
        } else if (block.type === 'artifact') {
            const editorId = nodeObj.wrapper.dataset.editorId;
            if (window.ace && editorId && this.editorPool.has(editorId)) {
                const editor = this.editorPool.get(editorId);
                if (editor && editor.getValue() !== block.content) {
                    const scrollPos = editor.session.getScrollTop();
                    editor.setValue(block.content, 1);
                    editor.session.setScrollTop(scrollPos);
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
        const currentBlocks = this._lexicalStreamParse(rawText);

        for (let i = 0; i < currentBlocks.length; i++) {
            const block = currentBlocks[i];
            const prevBlock = stream.parsedBlocks[i];

            if (prevBlock && prevBlock.isComplete && prevBlock.content === block.content) {
                continue; 
            }

            let nodeObj = stream.blockNodes[i];
            if (!nodeObj) {
                nodeObj = this._createBlockElement(block, msgId, i);
                stream.container.appendChild(nodeObj.wrapper);
                stream.blockNodes[i] = nodeObj;
            }

            this._updateBlockContent(nodeObj, block);

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
                if (window.ace && editorId && this.editorPool.has(editorId)) {
                    const editor = this.editorPool.get(editorId);
                    if (editor) editor.setOption("useWorker", true);
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

        const blocksToProcess = Array.from(stream.container.querySelectorAll('pre:not(.thought-content pre)'));
        for (let index = 0; index < blocksToProcess.length; index++) {
            const blockElement = blocksToProcess[index];
            if (blockElement.dataset.aceInjected) continue; 
            
            const codeNode = blockElement.querySelector('code');
            if (!codeNode) continue;

            const rawCode = codeNode.textContent;
            let displayLabel = "CODE";
            let lang = "text";

            codeNode.classList.forEach(cls => {
                if (cls.startsWith('language-')) lang = cls.replace('language-', '');
            });
            displayLabel = lang.toUpperCase() || "TEXT";

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
            this.editorObserver.observe(aceContainer);
            this.observedNodes.set(editorId, aceContainer);
            aceContainer.dataset.aceInjected = "true";

            window.requestAnimationFrame(() => {
                if (window.ace) {
                    const editor = window.ace.edit(editorId);
                    this.editorPool.set(editorId, editor);
                    editor.setTheme("ace/theme/twilight");
                    
                    let aceModePath = "ace/mode/text";
                    if (window.ace.require) {
                        const modelist = window.ace.require("ace/ext/modelist");
                        if (modelist) {
                            const virtualFileName = `virtual_code.${lang}`;
                            const resolvedMode = modelist.getModeForPath(virtualFileName);
                            if (resolvedMode && resolvedMode.mode) aceModePath = resolvedMode.mode;
                        }
                    }
                    
                    if (aceModePath === "ace/mode/text") {
                        const heuristicMap = {
                            'js': 'javascript', 'ts': 'typescript', 'py': 'python', 
                            'cpp': 'c_cpp', 'c': 'c_cpp', 'bash': 'sh', 'shell': 'sh',
                            'vue': 'html', 'react': 'jsx', 'yml': 'yaml', 'docker': 'dockerfile',
                            'json': 'json', 'md': 'markdown', 'html': 'html'
                        };
                        const fallback = heuristicMap[lang] || lang;
                        aceModePath = `ace/mode/${fallback}`;
                    }
                    
                    editor.session.setMode(aceModePath);
                    editor.setOptions({
                        maxLines: 60,
                        minLines: 2,
                        autoScrollEditorIntoView: true,
                        fontSize: "14px",
                        showPrintMargin: false,
                        useWorker: true, 
                        showFoldWidgets: true, 
                        wrap: true,                  
                        highlightActiveLine: true,   
                        displayIndentGuides: true,   
                        highlightGutterLine: true,
                        scrollPastEnd: 0.2, 
                        readOnly: false 
                    });

                    window.requestAnimationFrame(() => {
                        editor.resize(true);
                    });
                }
            });
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