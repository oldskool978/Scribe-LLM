// Copyright (c) 2026 Hector Nunez. Licensed under PolyForm Shield License 1.0.0. See LICENSE.md.

class ScribeCompositor {
    constructor() {
        this.historyNode = document.getElementById('chat-history');
        this.compositorNode = document.getElementById('compositor-node');
        this.activeStreams = new Map();
        this.editorPool = new Map();
        this.messageRegistry = new Map();
        this.observedNodes = new Map();
        this.mathRenderCache = new Map();
        this.messageCount = 0;
        this._forceStickyFollow = false;

        this.editorObserver = new ResizeObserver((entries) => {
            window.requestAnimationFrame(() => {
                let layoutChanged = false;
                for (let i = 0; i < entries.length; i++) {
                    const editorId = entries[i].target.dataset.editorId;
                    if (editorId && this.editorPool.has(editorId)) {
                        const editor = this.editorPool.get(editorId);
                        if (editor) {
                            editor.renderer.onResize(true);
                            layoutChanged = true;
                        }
                    }
                }
                if (layoutChanged && this._forceStickyFollow) {
                    this._scrollToBottom(true);
                }
            });
        });

        this._injectImmutableAlignmentStyles();
        this._configureAcePaths();
        this._configureMarkdown();
        this._setupOrchestratorObserver();
        this._setupManualScrollInterceptors();
    }

    _injectImmutableAlignmentStyles() {
        if (document.getElementById('scribe-alignment-reset')) return;
        const style = document.createElement('style');
        style.id = 'scribe-alignment-reset';
        style.textContent = `
            .node-content, .scribe-text-block, .markdown-body, .scribe-thought-block, .thought-content {
                text-align: left;
            }
            .scribe-math-block {
                text-align: center;
                line-height: normal;
                color: inherit !important;
                display: block;
                margin: 1em 0;
            }
            .scribe-math-inline {
                display: inline-block;
                vertical-align: middle;
                text-align: initial;
                color: inherit !important;
            }
            .scribe-math-block .katex, .scribe-math-inline .katex {
                color: inherit !important;
            }
            .scribe-math-block .katex-display, .scribe-math-inline .katex-display {
                color: inherit !important;
                margin: 0;
            }
            .scribe-ace-editor {
                min-height: 80px;
                height: auto;
                width: 100%;
                display: block;
                text-align: initial;
                direction: ltr;
            }
            .scribe-markdown-preview-block {
                width: 100%;
                box-sizing: border-box;
                text-align: left;
            }
        `;
        document.head.appendChild(style);
    }

    _setupOrchestratorObserver() {
        if (!this.compositorNode || !this.historyNode) return;
        const orchestratorObserver = new ResizeObserver((entries) => {
            window.requestAnimationFrame(() => {
                for (let entry of entries) {
                    const height = entry.contentBoxSize 
                        ? entry.contentBoxSize[0].blockSize 
                        : entry.contentRect.height;
                    this.historyNode.style.setProperty('--orchestrator-height', `${height}px`);
                }
                if (this._forceStickyFollow) {
                    this._scrollToBottom(true);
                }
            });
        });
        orchestratorObserver.observe(this.compositorNode);
    }

    _setupManualScrollInterceptors() {
        if (!this.historyNode) return;
        
        this.historyNode.addEventListener('scroll', () => {
            if (this.activeStreams.size > 0) {
                const threshold = 120;
                const totalScrollable = this.historyNode.scrollHeight - this.historyNode.clientHeight;
                const currentScrollOffset = totalScrollable - this.historyNode.scrollTop;
                
                if (currentScrollOffset <= threshold) {
                    this._forceStickyFollow = true;
                } else {
                    this._forceStickyFollow = false;
                }
            }
        }, { passive: true });
    }

    _configureAcePaths() {
        if (window.ace && window.ace.config) {
            window.ace.config.set('basePath', '/lib/ace/');
            window.ace.config.set('workerPath', '/lib/ace/');
            window.ace.config.loadModule("ace/ext/language_tools");
            window.ace.config.loadModule("ace/ext/modelist");
        }
    }

    _configureMarkdown() {
        if (window.marked) {
            const self = this;
            const renderer = {
                code(code, infostring) {
                    const lang = (infostring || '').toLowerCase();

                    if (['markdown', 'md'].includes(lang)) {
                        return `<div class="scribe-markdown-preview-block markdown-body static-markdown-nested" data-val="${btoa(encodeURIComponent(code))}"></div>`;
                    }

                    return `
                        <div class="scribe-native-code-wrapper dynamic-markdown-code" data-lang="${lang}">
                            <div class="ace-action-bar micro-action-bar">
                                <span class="ace-lang-label">${(lang || 'CODE').toUpperCase()}</span>
                                <button class="action-btn ace-copy-btn" onclick="navigator.clipboard.writeText(this.closest('.scribe-native-code-wrapper').querySelector('.streaming-code-payload').textContent)">Copy</button>
                            </div>
                            <div class="scribe-text-block scribe-code-native">
                                <pre style="margin:0;"><code class="streaming-code-payload">${self._escapeHtml(code)}</code></pre>
                            </div>
                        </div>
                    `;
                }
            };
            
            if (typeof window.marked.use === 'function') {
                window.marked.use({ gfm: true, breaks: true, renderer });
            } else if (typeof window.marked.setOptions === 'function') {
                window.marked.setOptions({ gfm: true, breaks: true, renderer });
            }
        }
    }

    _escapeHtml(unsafeText) {
        if (!unsafeText) return '';
        let result = '';
        for (let i = 0; i < unsafeText.length; i++) {
            const ch = unsafeText[i];
            if (ch === '&') result += '&amp;';
            else if (ch === '<') result += '&lt;';
            else if (ch === '>') result += '&gt;';
            else if (ch === '"') result += '&quot;';
            else if (ch === "'") result += '&#039;';
            else result += ch;
        }
        return result;
    }

    _resolveAceMode(langHint) {
        if (!langHint) return "ace/mode/text";
        let cleanHint = "";
        for (let i = 0; i < langHint.length; i++) {
            const code = langHint.charCodeAt(i);
            if (code > 32) cleanHint += langHint[i].toLowerCase();
        }
        
        const aiQuirks = {
            'python3': 'python', 'py3': 'python', 'html5': 'html',
            'postgres': 'pgsql', 'postgresql': 'pgsql',
            'kubernetes': 'yaml', 'k8s': 'yaml',
            'make': 'makefile',
            'react': 'jsx', 'reactjs': 'jsx', 'vue3': 'vue', 'vue2': 'vue',
            'bash': 'sh', 'shell': 'sh', 'zsh': 'sh', 'c++': 'c_cpp', 'cpp': 'c_cpp', 'c': 'c_cpp',
            'c#': 'csharp', 'cs': 'csharp', 'f#': 'fsharp', 'fs': 'fsharp',
            'go': 'golang', 'rs': 'rust', 'rb': 'ruby', 'py': 'python',
            'js': 'javascript', 'ts': 'typescript', 'yml': 'yaml',
            'docker': 'dockerfile', 'node': 'javascript', 'md': 'markdown'
        };
        const targetLang = aiQuirks[cleanHint] || cleanHint;

        if (window.ace && window.ace.require) {
            try {
                const modelist = window.ace.require("ace/ext/modelist");
                if (modelist) {
                    if (modelist.modesByName[targetLang]) {
                        return modelist.modesByName[targetLang].mode;
                    }
                    const resolvedMode = modelist.getModeForPath(`virtual_file.${targetLang}`);
                    if (resolvedMode && resolvedMode.name !== "text") {
                        return resolvedMode.mode;
                    }
                }
            } catch (e) {}
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
        let result = '';
        const len = tex.length;
        let i = 0;
        while (i < len) {
            if (tex[i] === '%' && !this._isEscaped(tex, i)) {
                while (i < len && tex[i] !== '\n') {
                    result += tex[i];
                    i++;
                }
                continue;
            }
            let isEnvToken = false;
            let offset = 0;
            if (tex.startsWith('\\begin', i)) {
                isEnvToken = true;
                offset = 6;
            } else if (tex.startsWith('\\end', i)) {
                isEnvToken = true;
                offset = 4;
            }
            if (isEnvToken) {
                const targets = [
                    ['{align}', '{aligned}'], ['{align*}', '{aligned}'],
                    ['{equation}', '{aligned}'], ['{equation*}', '{aligned}'],
                    ['{eqnarray}', '{aligned}'], ['{eqnarray*}', '{aligned}']
                ];
                let matched = false;
                for (let t = 0; t < targets.length; t++) {
                    if (tex.startsWith(targets[t][0], i + offset)) {
                        result += tex.substring(i, i + offset) + targets[t][1];
                        i += offset + targets[t][0].length;
                        matched = true;
                        break;
                    }
                }
                if (matched) continue;
            }
            result += tex[i];
            i++;
        }
        return result;
    }

    _checkDoubleNewlineBoundary(text, index) {
        const len = text.length;
        if (index >= len || text[index] !== '\n') return false;
        let current = index + 1;
        while (current < len && (text[current] === ' ' || text[current] === '\t' || text[current] === '\r')) {
            current++;
        }
        return current < len && text[current] === '\n';
    }

    _parseAttributes(attrStr) {
        const attrs = {};
        if (!attrStr) return attrs;
        let i = 0;
        const len = attrStr.length;
        let state = 'SCAN_KEY'; 
        let currentKey = '';
        let currentValue = '';
        let quoteChar = '';

        const neutralize = (ch) => {
            if (ch === '"') return '&quot;';
            if (ch === "'") return '&#039;';
            if (ch === '<') return '&lt;';
            if (ch === '>') return '&gt;';
            return ch;
        };

        while (i < len) {
            const ch = attrStr[i];
            const code = attrStr.charCodeAt(i);
            if (state === 'SCAN_KEY') {
                if (ch === '=') {
                    state = 'AWAIT_VALUE';
                } else if (code <= 32) {
                    if (currentKey) state = 'AWAIT_EQUAL';
                } else if (ch === '>') {
                    if (currentKey) attrs[currentKey.toLowerCase()] = "true";
                    break;
                } else {
                    currentKey += ch;
                }
            } else if (state === 'AWAIT_EQUAL') {
                if (ch === '=') {
                    state = 'AWAIT_VALUE';
                } else if (code > 32) {
                    attrs[currentKey.toLowerCase()] = "true";
                    currentKey = ch;
                    state = 'SCAN_KEY';
                }
            } else if (state === 'AWAIT_VALUE') {
                if (code > 32) {
                    if (ch === '"' || ch === "'") {
                        quoteChar = ch;
                        state = 'SCAN_QUOTED_VAL';
                    } else if (ch === '>') {
                        attrs[currentKey.toLowerCase()] = "true";
                        break;
                    } else {
                        currentValue += neutralize(ch);
                        state = 'SCAN_UNQUOTED_VAL';
                    }
                }
            } else if (state === 'SCAN_QUOTED_VAL') {
                if (ch === quoteChar) {
                    attrs[currentKey.toLowerCase()] = currentValue;
                    currentKey = '';
                    currentValue = '';
                    state = 'SCAN_KEY';
                } else {
                    currentValue += neutralize(ch);
                }
            } else if (state === 'SCAN_UNQUOTED_VAL') {
                if (code <= 32) {
                    attrs[currentKey.toLowerCase()] = currentValue;
                    currentKey = '';
                    currentValue = '';
                    state = 'SCAN_KEY';
                } else if (ch === '>') {
                    attrs[currentKey.toLowerCase()] = currentValue;
                    break;
                } else {
                    currentValue += neutralize(ch);
                }
            }
            i++;
        }
        if (currentKey) attrs[currentKey.toLowerCase()] = currentValue || "true";
        return attrs;
    }

    _lexicalStreamParse(streamContext, newText) {
        let i = streamContext.cursorIndex;
        const len = newText.length;
        
        let root = streamContext.astRoot || { type: 'root', children: [] };
        let stack = streamContext.parseStack || [root];
        let currentText = streamContext.textBuffer || "";
        
        const targetTags = ['think', 'rlm_exec', 'rlm_result', 'status', 'candidate', 'evaluation', 'winner', 'artifact'];
        const flushText = () => {
            if (currentText) {
                const active = stack[stack.length - 1];
                active.children.push({
                    type: 'text',
                    content: currentText,
                    attributes: '',
                    isComplete: true,
                    children: []
                });
                currentText = "";
            }
        };

        if (i < len) {
            while (i < len) {
                const isEscapedToken = this._isEscaped(newText, i);

                let structuralClosedIdx = -1;
                if (!isEscapedToken) {
                    for (let s = stack.length - 1; s > 0; s--) {
                        const activeContainerType = stack[s].type;
                        if (targetTags.includes(activeContainerType)) {
                            if (newText.startsWith(`</${activeContainerType}>`, i)) {
                                structuralClosedIdx = s;
                                break;
                            }
                        }
                    }
                }

                if (structuralClosedIdx !== -1) {
                    flushText();
                    while (stack.length > structuralClosedIdx) {
                        let closedNode = stack.pop();
                        closedNode.isComplete = true;
                        if (closedNode.type === 'artifact') {
                            closedNode.content = currentText;
                            currentText = "";
                        }
                    }
                    const triggeredTag = targetTags.find(tag => newText.startsWith(`</${tag}>`, i));
                    i += `</${triggeredTag}>`.length;

                    streamContext.mathState = 'none';
                    streamContext.currentMathBuffer = "";
                    streamContext.inInlineCode = false;
                    streamContext.activeInlineLength = 0;
                    continue;
                }

                const currentContext = stack[stack.length - 1];

                if (currentContext.type === 'code_block') {
                    if (!currentContext.isLanguageSettled) {
                        let settled = false;
                        while (i < len) {
                            if (newText[i] === '\n') {
                                settled = true;
                                i++;
                                break;
                            }
                            if (newText[i] !== '\r') {
                                currentContext.attributes += newText[i];
                            }
                            i++;
                        }
                        currentContext.attributes = currentContext.attributes.trim();
                        if (settled) {
                            currentContext.isLanguageSettled = true;
                        }
                        continue;
                    }

                    let tickCount = 0;
                    while (i + tickCount < len && newText[i + tickCount] === '`') {
                        tickCount++;
                    }
                    if (tickCount >= currentContext.fenceLength && !isEscapedToken) {
                        currentContext.content = currentText;
                        currentText = "";
                        currentContext.isComplete = true;
                        stack.pop();
                        i += tickCount;
                        if (i < len && newText[i] === '\n') i++;
                        continue;
                    }
                    currentText += newText[i];
                    i++;
                    continue;
                }

                if (!isEscapedToken) {
                    if (newText[i] === '<') {
                        let remaining = newText.substring(i);
                        let isPrefix = false;
                        for (let t = 0; t < targetTags.length; t++) {
                            let openT = '<' + targetTags[t];
                            if (openT.startsWith(remaining) && remaining.length < openT.length) {
                                isPrefix = true; break;
                            }
                        }
                        for (let s = 1; s < stack.length; s++) {
                            let closeT = `</${stack[s].type}>`;
                            if (closeT.startsWith(remaining) && remaining.length < closeT.length) {
                                isPrefix = true; break;
                            }
                        }
                        if (isPrefix) break; 
                    }
                    if (newText[i] === '\\') {
                        let remaining = newText.substring(i);
                        if (remaining === '\\' || '\\begin{'.startsWith(remaining) || '\\end{'.startsWith(remaining) || 
                            '\\['.startsWith(remaining) || '\\('.startsWith(remaining) || 
                            '\\]'.startsWith(remaining) || '\\)'.startsWith(remaining)) {
                            break;
                        }
                    }
                    if (newText[i] === '$') {
                        if (i + 1 === len) break;
                    }
                    if (newText[i] === '`') {
                        let tCount = 0;
                        while (i + tCount < len && newText[i + tCount] === '`') { tCount++; }
                        if (i + tCount === len) break;
                    }
                }

                let tickCount = 0;
                while (i + tickCount < len && newText[i + tickCount] === '`') {
                    tickCount++;
                }

                if (tickCount > 0 && !isEscapedToken) {
                    if (streamContext.mathState === 'none') {
                        if (!streamContext.inInlineCode) {
                            if (tickCount >= 3) {
                                flushText();
                                let langHint = '';
                                let nextIdx = i + tickCount;
                                while (nextIdx < len && newText[nextIdx] !== '\n') {
                                    if (newText[nextIdx] !== '\r') langHint += newText[nextIdx];
                                    nextIdx++;
                                }
                                let hasNewline = false;
                                if (nextIdx < len && newText[nextIdx] === '\n') {
                                    hasNewline = true;
                                    nextIdx++;
                                }
                                let codeBlockNode = {
                                    type: 'code_block',
                                    content: '',
                                    attributes: langHint.trim(),
                                    fenceLength: tickCount,
                                    isComplete: false,
                                    isLanguageSettled: hasNewline,
                                    children: []
                                };
                                currentContext.children.push(codeBlockNode);
                                stack.push(codeBlockNode);
                                i = nextIdx;
                                continue;
                            } else {
                                streamContext.inInlineCode = true;
                                streamContext.activeInlineLength = tickCount;
                            }
                        } else if (tickCount === streamContext.activeInlineLength) {
                            streamContext.inInlineCode = false;
                            streamContext.activeInlineLength = 0;
                        }
                    } else {
                        streamContext.currentMathBuffer += newText.substring(i, i + tickCount);
                        i += tickCount;
                        continue;
                    }
                    currentText += newText.substring(i, i + tickCount);
                    i += tickCount;
                    continue;
                }

                let tagMatched = false;
                if (streamContext.mathState === 'none' && !streamContext.inInlineCode) {
                    if (newText[i] === '<' && i + 1 < len && newText[i + 1] !== '/') {
                        let matchedTag = null;
                        for (let t = 0; t < targetTags.length; t++) {
                            const tag = targetTags[t];
                            if (newText.startsWith(tag, i + 1)) {
                                const nextChar = newText[i + 1 + tag.length];
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
                                const c = newText[k];
                                if (c === '"' || c === "'") {
                                    if (!inQuote) inQuote = c;
                                    else if (inQuote === c) inQuote = null;
                                } else if (c === '>' && !inQuote) {
                                    tagEndIndex = k; break;
                                }
                            }
                            if (tagEndIndex !== -1) {
                                flushText();
                                const newAttr = newText.substring(attrStart, tagEndIndex).trim();
                                let containerBlock = {
                                    type: matchedTag,
                                    content: '',
                                    attributes: newAttr,
                                    isComplete: false,
                                    children: []
                                };
                                currentContext.children.push(containerBlock);
                                stack.push(containerBlock);
                                i = tagEndIndex + 1;
                                tagMatched = true; continue;
                            }
                        }
                    }
                }
                if (tagMatched) continue;

                if (!streamContext.inInlineCode) {
                    if (streamContext.mathState === 'none') {
                        if (newText.startsWith('$$', i)) { flushText(); streamContext.mathState = 'block_dollar'; streamContext.braceDepth = 0; streamContext.currentMathBuffer = ""; i += 2; continue; }
                        if (newText.startsWith('\\[', i)) { flushText(); streamContext.mathState = 'block_bracket'; streamContext.braceDepth = 0; streamContext.currentMathBuffer = ""; i += 2; continue; }
                        if (newText.startsWith('\\(', i)) { flushText(); streamContext.mathState = 'inline_paren'; streamContext.braceDepth = 0; streamContext.currentMathBuffer = ""; i += 2; continue; }
                        if (newText.startsWith('\\begin{', i)) {
                            const closeBrace = newText.indexOf('}', i + 7);
                            if (closeBrace !== -1) {
                                const env = newText.substring(i + 7, closeBrace);
                                const mathEnvs = ['align', 'align*', 'equation', 'equation*', 'eqnarray', 'eqnarray*', 'gather', 'gather*', 'cases'];
                                if (mathEnvs.includes(env)) {
                                    flushText(); streamContext.mathState = 'env'; streamContext.braceDepth = 0; streamContext.activeEnvName = env;
                                    streamContext.currentMathBuffer = newText.substring(i, closeBrace + 1);
                                    i = closeBrace + 1; continue;
                                }
                            }
                        }
                        if (newText[i] === '$') {
                            if (i + 1 < len && newText[i+1] !== ' ' && !(newText[i+1] >= '0' && newText[i+1] <= '9')) {
                                flushText(); streamContext.mathState = 'inline_dollar'; streamContext.braceDepth = 0; streamContext.currentMathBuffer = ""; i++; continue;
                            }
                        }
                    } else {
                        if (newText[i] === '{') { streamContext.braceDepth++; streamContext.currentMathBuffer += newText[i]; i++; continue; }
                        if (newText[i] === '}') { streamContext.braceDepth = Math.max(0, streamContext.braceDepth - 1); streamContext.currentMathBuffer += newText[i]; i++; continue; }

                        if (streamContext.mathState === 'block_dollar') {
                            if (newText.startsWith('$$', i) && streamContext.braceDepth === 0) {
                                currentContext.children.push({ type: 'math_block', content: streamContext.currentMathBuffer, attributes: '', isComplete: true, children: [] });
                                streamContext.mathState = 'none'; i += 2; continue;
                            }
                            streamContext.currentMathBuffer += newText[i]; i++; continue;
                        }
                        else if (streamContext.mathState === 'block_bracket') {
                            if (newText.startsWith('\\]', i) && streamContext.braceDepth === 0) {
                                currentContext.children.push({ type: 'math_block', content: streamContext.currentMathBuffer, attributes: '', isComplete: true, children: [] });
                                streamContext.mathState = 'none'; i += 2; continue;
                            }
                            streamContext.currentMathBuffer += newText[i]; i++; continue;
                        }
                        else if (streamContext.mathState === 'inline_paren') {
                            if (this._checkDoubleNewlineBoundary(newText, i) && streamContext.braceDepth === 0) {
                                currentText += '\\(' + streamContext.currentMathBuffer + '\n'; streamContext.mathState = 'none'; i++; continue;
                            }
                            if (newText.startsWith('\\)', i) && streamContext.braceDepth === 0) {
                                currentText += `SCRIBEMATHINLINEX${streamContext.mathRegistry.length}X`;
                                streamContext.mathRegistry.push({ type: 'inline', b64: '', tex: streamContext.currentMathBuffer });
                                streamContext.mathState = 'none'; i += 2; continue;
                            }
                            streamContext.currentMathBuffer += newText[i]; i++; continue;
                        }
                        else if (streamContext.mathState === 'inline_dollar') {
                            if (newText.startsWith('$$', i) && streamContext.braceDepth === 0) {
                                currentContext.children.push({ type: 'math_block', content: streamContext.currentMathBuffer, attributes: '', isComplete: false, children: [] });
                                streamContext.mathState = 'block_dollar'; streamContext.braceDepth = 0; streamContext.currentMathBuffer = ""; i += 2; continue;
                            }
                            if (this._checkDoubleNewlineBoundary(newText, i) && streamContext.braceDepth === 0) {
                                currentText += '$' + streamContext.currentMathBuffer + '\n'; streamContext.mathState = 'none'; i++; continue;
                            }
                            if (newText[i] === '$' && streamContext.braceDepth === 0) {
                                currentText += `SCRIBEMATHINLINEX${streamContext.mathRegistry.length}X`;
                                streamContext.mathRegistry.push({ type: 'inline', b64: '', tex: streamContext.currentMathBuffer });
                                streamContext.mathState = 'none'; i += 1; continue;
                            }
                            streamContext.currentMathBuffer += newText[i]; i++; continue;
                        }
                        else if (streamContext.mathState === 'env') {
                            const closeTag = `\\end{${streamContext.activeEnvName}}`;
                            if (newText.startsWith(closeTag, i) && streamContext.braceDepth === 0) {
                                streamContext.currentMathBuffer += closeTag;
                                currentContext.children.push({ type: 'math_block', content: streamContext.currentMathBuffer, attributes: '', isComplete: true, children: [] });
                                streamContext.mathState = 'none'; streamContext.activeEnvName = ""; i += closeTag.length; continue;
                            }
                            streamContext.currentMathBuffer += newText[i]; i++; continue;
                        }
                    }
                }
                if (streamContext.mathState === 'none') currentText += newText[i];
                i++;
            }

            streamContext.cursorIndex = i;
            streamContext.textBuffer = currentText;
            streamContext.astRoot = root;
            streamContext.parseStack = stack;
        }

        let clonedRoot = { ...root, children: [...root.children] };
        let currentClone = clonedRoot;
        
        for (let s = 1; s < stack.length; s++) {
            let originalNode = stack[s];
            let idx = currentClone.children.indexOf(originalNode);
            if (idx !== -1) {
                let nodeClone = { ...originalNode, children: [...originalNode.children] };
                currentClone.children[idx] = nodeClone;
                currentClone = nodeClone;
            }
        }

        if (streamContext.mathState !== 'none') {
            if (['block_dollar', 'block_bracket', 'env'].includes(streamContext.mathState)) {
                currentClone.children.push({ type: 'math_block', content: streamContext.currentMathBuffer, attributes: '', isComplete: false, children: [] });
            }
        }
        
        let speculativeText = currentText;
        if (i < len) {
            let trailing = newText.substring(i);
            let isTagPrefix = false;
            for (let t = 0; t < targetTags.length; t++) {
                if (('<' + targetTags[t]).startsWith(trailing) || `</${targetTags[t]}>`.startsWith(trailing)) {
                    isTagPrefix = true;
                    break;
                }
            }
            if (!isTagPrefix) {
                speculativeText += trailing;
            }
        }
        if (streamContext.mathState === 'inline_dollar') {
            speculativeText += '$' + streamContext.currentMathBuffer;
        } else if (streamContext.mathState === 'inline_paren') {
            speculativeText += '\\(' + streamContext.currentMathBuffer;
        }

        if (speculativeText) {
            const deepCtx = stack[stack.length - 1];
            if (deepCtx.type === 'code_block' || deepCtx.type === 'artifact') {
                currentClone.content = speculativeText;
            } else {
                currentClone.children.push({ type: 'text', content: speculativeText, attributes: '', isComplete: false, children: [] });
            }
        }

        streamContext.parsedBlocks = clonedRoot.children;

        for (let m = 0; m < streamContext.mathRegistry.length; m++) {
            if (!streamContext.mathRegistry[m].b64) {
                streamContext.mathRegistry[m].b64 = btoa(encodeURIComponent(streamContext.mathRegistry[m].tex));
            }
        }
    }

    streamToken(msgId, token) {
        const stream = this.activeStreams.get(msgId);
        if (!stream) return;

        const currentText = (this.messageRegistry.get(msgId) || "") + token;
        this.messageRegistry.set(msgId, currentText);

        this._lexicalStreamParse(stream, currentText);

        if (!stream.isPendingRender) {
            stream.isPendingRender = true;
            const now = performance.now();
            const elapsed = now - stream.lastRenderTime;
            if (elapsed > 16.67) {
                this._renderBuffer(msgId);
            } else {
                window.requestAnimationFrame(() => this._renderBuffer(msgId));
            }
        }
    }

    _discoverAndConvertLiteralMath(rootNode) {
        const walker = rootNode.ownerDocument.createTreeWalker(rootNode, NodeFilter.SHOW_TEXT, {
            acceptNode(node) {
                let p = node.parentNode;
                while (p && p !== rootNode) {
                    const tag = p.tagName.toLowerCase();
                    if (['pre', 'code', 'script', 'style'].includes(tag) || p.classList.contains('scribe-ace-wrapper') || p.classList.contains('scribe-native-code-wrapper')) {
                        return NodeFilter.FILTER_REJECT;
                    }
                    p = p.parentNode;
                }
                return NodeFilter.FILTER_ACCEPT;
            }
        }, false);

        const textNodes = [];
        let node;
        while (node = walker.nextNode()) {
            textNodes.push(node);
        }

        for (let n = 0; n < textNodes.length; n++) {
            const textNode = textNodes[n];
            let text = textNode.nodeValue;
            if (!text || text.indexOf('SCRIBEMATH') !== -1) continue; 
            
            let i = 0;
            const len = text.length;
            let fragment = null;

            while (i < len) {
                let matchType = null;
                let startDelimiter = "";
                let endDelimiter = "";

                if (text.startsWith('$$', i)) { matchType = 'block'; startDelimiter = '$$'; endDelimiter = '$$'; }
                else if (text.startsWith('\\[', i)) { matchType = 'block'; startDelimiter = '\\['; endDelimiter = '\\]'; }
                else if (text.startsWith('\\(', i)) { matchType = 'inline'; startDelimiter = '\\('; endDelimiter = '\\)'; }
                else if (text[i] === '$') {
                    if (i + 1 < len && text[i+1] !== ' ' && !(text[i+1] >= '0' && text[i+1] <= '9')) {
                        matchType = 'inline'; startDelimiter = '$'; endDelimiter = '$';
                    }
                }

                if (matchType) {
                    const startIdx = i;
                    const contentStart = i + startDelimiter.length;
                    const endIdx = text.indexOf(endDelimiter, contentStart);

                    if (endIdx !== -1) {
                        const mathContent = text.substring(contentStart, endIdx);
                        if (!fragment) fragment = textNode.ownerDocument.createDocumentFragment();

                        if (startIdx > 0) {
                            fragment.appendChild(textNode.ownerDocument.createTextNode(text.substring(0, startIdx)));
                        }

                        const mathSpan = textNode.ownerDocument.createElement('span');
                        mathSpan.className = matchType === 'block' ? 'scribe-math-block' : 'scribe-math-inline';
                        mathSpan.dataset.tex = btoa(encodeURIComponent(mathContent));
                        fragment.appendChild(mathSpan);

                        text = text.substring(endIdx + endDelimiter.length);
                        i = 0;
                        continue;
                    }
                }
                i++;
            }

            if (fragment) {
                if (text.length > 0) {
                    fragment.appendChild(textNode.ownerDocument.createTextNode(text));
                }
                if (textNode.parentNode) {
                    textNode.parentNode.replaceChild(fragment, textNode);
                }
            }
        }
    }

    _renderMarkdownAndMath(targetElement, rawContent, registry, nodeObj) {
        let htmlOut = window.marked ? window.marked.parse(rawContent) : rawContent;
        if (window.DOMPurify) {
            htmlOut = window.DOMPurify.sanitize(htmlOut, {
                ADD_TAGS: ['details', 'summary', 'artifact', 'span', 'div', 'think', 'rlm_exec', 'rlm_result', 'status', 'candidate', 'evaluation', 'winner'], 
                ADD_ATTR: ['data-tex', 'data-lang', 'data-filename', 'class', 'target', 'rel', 'data-block-type', 'data-vis-sealed', 'open', 'id', 'data-editor-id', 'data-val'],
                CUSTOM_ELEMENT_HANDLING: {
                    tagNameCheck: () => true,
                    attributeNameCheck: () => true,
                    allowCustomizedBuiltInElements: true
                }
            });
        }
        
        const tempNode = document.createElement('div');
        tempNode.innerHTML = htmlOut;

        tempNode.querySelectorAll('.static-markdown-nested').forEach((nestedWin) => {
            try {
                const rawMarkdown = decodeURIComponent(atob(nestedWin.dataset.val));
                nestedWin.innerHTML = window.marked ? window.marked.parse(rawMarkdown) : rawMarkdown;
            } catch(e) {}
        });

        this._discoverAndConvertLiteralMath(tempNode);

        const isInsideReasoningBox = targetElement && targetElement.closest('.scribe-thought-block, .scribe-candidate-block, .scribe-evaluation');

        const currentPromotedPool = [];
        const barredFromAce = ['mermaid', 'markdown', 'md', 'text', 'txt', 'prose'];
        tempNode.querySelectorAll('.dynamic-markdown-code').forEach((wrapper, idx) => {
            if (!nodeObj.isComplete || isInsideReasoningBox) return; 

            const targetedLang = (wrapper.dataset.lang || 'text').toLowerCase();
            if (barredFromAce.includes(targetedLang)) return;

            const stableEditorId = `${nodeObj.wrapper.id}-nested-markdown-${idx}`;
            const payload = wrapper.querySelector('.streaming-code-payload')?.textContent || '';

            const subContainer = document.createElement('div');
            subContainer.className = 'scribe-ace-wrapper-placeholder';
            subContainer.dataset.editorId = stableEditorId;
            subContainer.dataset.lang = targetedLang;
            subContainer.dataset.val = btoa(encodeURIComponent(payload));

            wrapper.parentNode.replaceChild(subContainer, wrapper);
            currentPromotedPool.push({ id: stableEditorId, lang: targetedLang, val: payload });
        });

        targetElement.innerHTML = tempNode.innerHTML;

        targetElement.querySelectorAll('.scribe-ace-wrapper-placeholder').forEach((placeholder) => {
            const editorId = placeholder.dataset.editorId;
            const matchData = currentPromotedPool.find(item => item.id === editorId);
            if (!matchData) return;

            const fullAceWrapper = document.createElement('div');
            fullAceWrapper.className = 'scribe-ace-wrapper';
            fullAceWrapper.dataset.aceInjected = "true";
            fullAceWrapper.dataset.editorId = editorId;

            const barLayout = document.createElement('div');
            barLayout.className = 'ace-action-bar';
            barLayout.innerHTML = `
                <span class="ace-lang-label">${matchData.lang.toUpperCase()}</span>
                <button class="action-btn ace-copy-btn">Copy Code</button>
            `;
            
            const textSpace = document.createElement('div');
            textSpace.id = editorId;
            textSpace.className = 'scribe-ace-editor';

            fullAceWrapper.appendChild(barLayout);
            fullAceWrapper.appendChild(textSpace);
            placeholder.parentNode.replaceChild(fullAceWrapper, placeholder);

            barLayout.querySelector('.ace-copy-btn').onclick = () => {
                if (this.editorPool.has(editorId)) {
                    navigator.clipboard.writeText(this.editorPool.get(editorId).getValue());
                }
            };

            this._mountAceEditor(fullAceWrapper, textSpace, matchData.lang, matchData.val, true);
        });

        if (registry && registry.length > 0) this._injectMathNodes(targetElement, registry);
        if (window.katex) {
            targetElement.querySelectorAll('.scribe-math-inline, .scribe-math-block').forEach(el => {
                if (el.closest('pre') || el.closest('code') || el.closest('.scribe-native-code-wrapper') || el.closest('.scribe-ace-wrapper')) {
                    return; 
                }
                const b64 = el.dataset.tex;
                if (!b64) return;
                const isBlock = el.classList.contains('scribe-math-block');
                const cacheKey = `${b64}-${isBlock ? 'block' : 'inline'}`;
                if (this.mathRenderCache.has(cacheKey)) {
                    el.innerHTML = this.mathRenderCache.get(cacheKey);
                } else {
                    let tex = '';
                    try {
                        const decoded = atob(b64);
                        try { tex = decodeURIComponent(decoded); } catch(e) { tex = decoded; }
                        tex = this._healKaTeX(tex); 
                    } catch (decodeErr) {
                        return;
                    }
                    try {
                        const container = document.createElement('span');
                        window.katex.render(tex, container, { displayMode: isBlock, throwOnError: true });
                        if (this.mathRenderCache.size >= 1000) {
                            this.mathRenderCache.delete(this.mathRenderCache.keys().next().value);
                        }
                        this.mathRenderCache.set(cacheKey, container.innerHTML);
                        el.innerHTML = container.innerHTML;
                    } catch (err) {
                        el.textContent = tex;
                    }
                }
            });
        }
    }

    _injectMathNodes(targetElement, registry) {
        targetElement.normalize();
        const walker = document.createTreeWalker(targetElement, NodeFilter.SHOW_TEXT, null, false);
        const nodesToProcess = [];
        let node;
        while (node = walker.nextNode()) {
            if (node.nodeValue.indexOf('SCRIBEMATH') !== -1) nodesToProcess.push(node);
        }
        for (let n = 0; n < nodesToProcess.length; n++) {
            const textNode = nodesToProcess[n];
            const parent = textNode.parentNode;
            if (!parent) continue;
            const text = textNode.nodeValue;
            const fragment = document.createDocumentFragment();
            let i = 0;
            const len = text.length;
            while (i < len) {
                const idx = text.indexOf('SCRIBEMATH', i);
                if (idx === -1) {
                    fragment.appendChild(document.createTextNode(text.substring(i)));
                    break;
                }
                if (idx > i) fragment.appendChild(document.createTextNode(text.substring(i, idx)));
                let current = idx;
                let isBlock = false;
                let validToken = false;
                let tokenLength = 0;
                let registryIdx = -1;
                if (text.startsWith('SCRIBEMATHBLOCKX', current)) {
                    isBlock = true;
                    current += 16;
                } else if (text.startsWith('SCRIBEMATHINLINEX', current)) {
                    isBlock = false;
                    current += 17;
                } else {
                    fragment.appendChild(document.createTextNode(text.substring(idx, idx + 10)));
                    i = idx + 10;
                    continue;
                }
                let numStr = "";
                while (current < len && text[current] >= '0' && text[current] <= '9') {
                    numStr += text[current];
                    current++;
                }
                if (current < len && text[current] === 'X' && numStr.length > 0) {
                    registryIdx = parseInt(numStr, 10);
                    tokenLength = (current + 1) - idx;
                    validToken = true;
                }
                if (validToken && registryIdx >= 0 && registryIdx < registry.length) {
                    const item = registry[registryIdx];
                    if (item) {
                        const wrapper = document.createElement('span');
                        wrapper.className = isBlock ? 'scribe-math-block' : 'scribe-math-inline';
                        wrapper.dataset.tex = item.b64;
                        fragment.appendChild(wrapper);
                    }
                    i = idx + tokenLength;
                } else {
                    fragment.appendChild(document.createTextNode(text.substring(idx, idx + 1)));
                    i = idx + 1;
                }
            }
            parent.replaceChild(fragment, textNode);
        }
    }

    _mountAceEditor(wrapper, editorElementOrId, lang, content, isFinalized) {
        if (!window.ace) return null;
        let editor;
        let editorId = typeof editorElementOrId === 'string' ? editorElementOrId : editorElementOrId.id;
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
        
        const activeModeName = aceModePath.split('/').pop();
        const skippedWorkerModes = ['text', 'plain', 'abstract', 'none', 'markdown', 'mermaid'];
        const shouldUseWorker = isFinalized && !skippedWorkerModes.includes(activeModeName);

        editor.setOptions({
            maxLines: 57,
            minLines: 4,
            autoScrollEditorIntoView: false,
            fontSize: "13px",
            fontFamily: "var(--font-code, ui-monospace, monospace)",
            showPrintMargin: false,
            showGutter: true,               
            showLineNumbers: true,          
            fixedWidthGutter: true,         
            useWorker: shouldUseWorker, 
            showFoldWidgets: true,
            wrap: false,
            hScrollBarAlwaysVisible: false,
            //indentedSoftWrap: true,
            highlightActiveLine: true,
            displayIndentGuides: true,
            highlightGutterLine: true,
            scrollPastEnd: 0.1,
            readOnly: false,
            enableBasicAutocompletion: true,
            enableLiveAutocompletion: true,
            enableSnippets: true,
            navigateWithinSoftTabs: true,
            animatedScroll: true,
            fadeFoldWidgets: true
        });
        editor.session.setTabSize(4);
        editor.session.setUseSoftTabs(true);
        editor.session.setUseWorker(shouldUseWorker);
        
        if (editor.getValue() !== (content || '')) {
            editor.setValue(content || '', 1);
        }
        editor.clearSelection();

        window.requestAnimationFrame(() => { 
            editor.resize(); 
            editor.renderer.updateFull(); 
        });

        if (wrapper && !this.observedNodes.has(editorId)) {
            this.editorObserver.observe(wrapper);
            this.observedNodes.set(editorId, wrapper);
        }
        return editor;
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
            for (let v = 0; v < visualContext.length; v++) {
                const b64 = visualContext[v];
                if (typeof b64 === 'string' && (b64.startsWith('data:image/') || b64.startsWith('blob:'))) {
                    const img = document.createElement('img');
                    img.src = b64;
                    img.className = 'context-thumbnail';
                    img.loading = 'lazy';
                    fragment.appendChild(img);
                }
            }
            contextTray.appendChild(fragment);
            wrapper.appendChild(contextTray);
        }

        const content = document.createElement('div');
        content.className = 'node-content markdown-body';
        wrapper.appendChild(content);
        this.historyNode.appendChild(wrapper);
        this._forceStickyFollow = true;

        if (role === 'assistant') {
            this.activeStreams.set(msgId, {
                container: content,
                isPendingRender: false,
                isFinalized: false,
                lastRenderTime: 0,
                blockNodes: [], 
                cursorIndex: 0,
                mathState: 'none',
                currentMathBuffer: '',
                braceDepth: 0,
                inInlineCode: false,
                activeInlineLength: 0,
                activeEnvName: '',
                textBuffer: '',
                mathRegistry: [],
                parsedBlocks: []
            });
            if (initialText) this.streamToken(msgId, initialText);
        } else {
            let staticCtx = { cursorIndex: 0, mathState: 'none', currentMathBuffer: '', braceDepth: 0, inInlineCode: false, activeInlineLength: 0, textBuffer: '', mathRegistry: [], parsedBlocks: [] };
            this._lexicalStreamParse(staticCtx, initialText);
            this._renderBlockTree(content, staticCtx.parsedBlocks, msgId, 'static', staticCtx.mathRegistry, { cache: [] });
        }
        this._scrollToBottom(true);
        return msgId;
    }

    _createBlockElement(block, msgId, prefixId, containerElement) {
        const wrapper = document.createElement(
            ['think', 'rlm_exec', 'rlm_result', 'status', 'candidate', 'evaluation'].includes(block.type) ? 'details' : 'div'
        );
        wrapper.id = prefixId;
        let target = wrapper;
        wrapper.dataset.blockType = block.type; 

        if (block.type === 'text') {
            wrapper.className = 'scribe-text-block';
        } else if (block.type === 'math_block') {
            wrapper.className = 'scribe-math-block';
            target = wrapper;
        } else if (block.type === 'code_block') {
            const lang = (block.attributes || '').toLowerCase();
            const barredFromAce = ['mermaid', 'markdown', 'md', 'text', 'txt', 'prose', 'math', 'latex', 'katex'];
            const isSettled = block.isLanguageSettled !== false;
            const lineCount = (block.content || '').split('\n').length;
            
            const isMathLang = ['math', 'latex', 'katex'].includes(lang);
            const isInsideReasoningBox = containerElement && containerElement.closest('.scribe-thought-block, .scribe-candidate-block, .scribe-evaluation');

            if (isMathLang) {
                wrapper.className = 'scribe-math-block-container';
                wrapper.dataset.aceInjected = "false";
                wrapper.dataset.lang = lang || "latex";
                wrapper.dataset.isMathPrediction = "true";
                
                const innerMath = document.createElement('div');
                innerMath.className = 'scribe-math-block';
                wrapper.appendChild(wrapper.ownerDocument.createElement('div'));
                wrapper.innerHTML = '';
                wrapper.appendChild(innerMath);
                target = innerMath;
            } else if (['markdown', 'md'].includes(lang)) {
                wrapper.className = 'scribe-markdown-preview-block markdown-body';
                wrapper.dataset.aceInjected = "false";
                wrapper.dataset.lang = lang;
                target = wrapper;
            } else if (isInsideReasoningBox || !isSettled || barredFromAce.includes(lang) || (lineCount < 3 && !block.isComplete)) {
                wrapper.className = 'scribe-native-code-wrapper';
                wrapper.dataset.aceInjected = "false";
                wrapper.dataset.lang = lang;

                const microBar = document.createElement('div');
                microBar.className = 'ace-action-bar micro-action-bar';
                
                const langLabel = document.createElement('span');
                langLabel.className = 'ace-lang-label';
                langLabel.textContent = (block.attributes || 'CODE').toUpperCase();

                const copyBtn = document.createElement('button');
                copyBtn.className = 'action-btn ace-copy-btn';
                copyBtn.innerHTML = 'Copy';
                
                microBar.appendChild(langLabel);
                microBar.appendChild(copyBtn);
                
                const codeBody = document.createElement('div');
                codeBody.className = 'scribe-text-block scribe-code-native';
                codeBody.innerHTML = `<pre style="margin:0; font-family:var(--font-code, monospace); white-space:pre-wrap;"><code class="streaming-code-payload"></code></pre>`;
                
                wrapper.appendChild(microBar);
                wrapper.appendChild(codeBody);
                target = codeBody.querySelector('.streaming-code-payload');

                copyBtn.onclick = () => {
                    const dynamicPayload = wrapper.querySelector('code.streaming-code-payload')?.textContent || '';
                    navigator.clipboard.writeText(dynamicPayload).then(() => {
                        copyBtn.innerHTML = 'Copied!';
                        copyBtn.classList.add('success');
                        setTimeout(() => {
                            copyBtn.innerHTML = 'Copy';
                            copyBtn.classList.remove('success');
                        }, 2000);
                    });
                };
            } else {
                wrapper.className = 'scribe-ace-wrapper';
                wrapper.dataset.aceInjected = "true";
                wrapper.dataset.editorId = prefixId;

                const actionBar = document.createElement('div');
                actionBar.className = 'ace-action-bar';
                
                const langLabel = document.createElement('span');
                langLabel.className = 'ace-lang-label';
                langLabel.textContent = block.attributes.toUpperCase() || "CODE";

                const copyBtn = document.createElement('button');
                copyBtn.className = 'action-btn ace-copy-btn';
                copyBtn.innerHTML = 'Copy Code';
                
                actionBar.appendChild(langLabel);
                actionBar.appendChild(copyBtn);
                
                const editorDiv = document.createElement('div');
                editorDiv.id = prefixId;
                editorDiv.className = 'scribe-ace-editor';
                
                wrapper.appendChild(actionBar);
                wrapper.appendChild(editorDiv);
                target = editorDiv;

                copyBtn.onclick = () => {
                    if (this.editorPool.has(prefixId)) {
                        navigator.clipboard.writeText(this.editorPool.get(prefixId).getValue()).then(() => {
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
        } else if (block.type === 'artifact') {
            const attrs = this._parseAttributes(block.attributes);
            const lang = attrs['language'] || attrs['lang'] || 'text';
            const name = attrs['identifier'] || attrs['name'] || lang.toUpperCase();
            const barredFromAce = ['math', 'latex', 'katex', 'mermaid', 'markdown', 'md', 'text', 'txt', 'prose'];
            
            if (['markdown', 'md'].includes(lang)) {
                wrapper.className = 'scribe-markdown-preview-block markdown-body';
                wrapper.dataset.aceInjected = "false";
                wrapper.dataset.lang = lang;
                target = wrapper;
            } else if (barredFromAce.includes(lang)) {
                wrapper.className = 'scribe-text-block scribe-artifact-native';
                wrapper.dataset.lang = lang;
                target = wrapper;
            } else {
                wrapper.className = 'scribe-ace-wrapper';
                wrapper.dataset.aceInjected = "true";
                wrapper.dataset.editorId = prefixId;

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
                editorDiv.id = prefixId;
                editorDiv.className = 'scribe-ace-editor';
                
                wrapper.appendChild(actionBar);
                wrapper.appendChild(editorDiv);
                target = editorDiv;

                copyBtn.onclick = () => {
                    if (this.editorPool.has(prefixId)) {
                        navigator.clipboard.writeText(this.editorPool.get(prefixId).getValue()).then(() => {
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
            wrapper.open = true;
            const summary = document.createElement('summary');
            const contentDiv = document.createElement('div');
            contentDiv.className = 'thought-content';
            
            if (block.type === 'think') {
                wrapper.className = 'scribe-thought-block';
                wrapper.setAttribute('data-block-type', 'think');
                summary.className = 'thought-header';
                summary.textContent = 'Latent Reasoning Matrix';
            } else if (block.type === 'rlm_exec') {
                wrapper.className = 'scribe-thought-block rlm-exec-block';
                summary.className = 'thought-header rlm-header';
                summary.textContent = 'VFS Execution Sandbox';
            } else if (block.type === 'rlm_result') {
                wrapper.className = 'scribe-thought-block rlm-result-block';
                summary.className = 'thought-header rlm-result-header';
                summary.textContent = 'VFS Telemetry Return';
            } else if (block.type === 'candidate') {
                wrapper.className = 'scribe-candidate-block';
                summary.className = 'candidate-header';
                const attrs = this._parseAttributes(block.attributes);
                summary.textContent = `Trajectory Vector ${attrs['index'] || '?'}`;
            } else if (block.type === 'evaluation') {
                wrapper.className = 'scribe-evaluation';
                summary.className = 'thought-header';
                summary.textContent = 'Critic Protocol';
            }

            wrapper.appendChild(summary);
            wrapper.appendChild(contentDiv);
            target = contentDiv;
        } else if (block.type === 'status') {
            wrapper.className = 'scribe-status-badge resolved';
            wrapper.textContent = '✓ ' + block.content;
            target = wrapper;
        } else if (block.type === 'winner') {
            wrapper.className = 'scribe-winner';
            target = wrapper;
        }
        return { wrapper, target };
    }

    _renderBlockTree(containerElement, blocksArray, msgId, prefixId, registry, nodeCache) {
        if (blocksArray.length < nodeCache.cache.length) {
            for (let j = blocksArray.length; j < nodeCache.cache.length; j++) {
                const deadNode = nodeCache.cache[j];
                if (deadNode && deadNode.wrapper) {
                    deadNode.wrapper.remove();
                    const editorId = deadNode.wrapper.dataset.editorId;
                    if (editorId && this.editorPool.has(editorId)) {
                        try {
                            if (this.observedNodes.has(editorId)) {
                                this.editorObserver.unobserve(this.observedNodes.get(editorId));
                                this.observedNodes.delete(editorId);
                            }
                            this.editorPool.get(editorId).destroy();
                            this.editorPool.delete(editorId);
                        } catch (e) {}
                    }
                }
            }
            nodeCache.cache.length = blocksArray.length;
        }

        for (let i = 0; i < blocksArray.length; i++) {
            const block = blocksArray[i];
            const currentBlockId = `${msgId}-${prefixId}-${i}`;
            let nodeObj = nodeCache.cache[i];

            let typeMismatch = nodeObj && nodeObj.wrapper && nodeObj.wrapper.dataset.blockType !== block.type;
            if (!typeMismatch && nodeObj && nodeObj.wrapper && ['code_block', 'artifact'].includes(block.type)) {
                const lang = block.type === 'code_block' 
                    ? (block.attributes || '').toLowerCase() 
                    : (this._parseAttributes(block.attributes)['language'] || 'text').toLowerCase();
                const barredFromAce = ['mermaid', 'markdown', 'md', 'text', 'txt', 'prose', 'math', 'latex', 'katex'];
                const isSettled = block.type === 'code_block' ? (block.isLanguageSettled !== false) : true;
                const lineCount = (block.content || '').split('\n').length;
                
                const isMathLang = ['math', 'latex', 'katex'].includes(lang);
                const isInsideReasoningBox = containerElement && containerElement.closest('.scribe-thought-block, .scribe-candidate-block, .scribe-evaluation');

                const shouldBeAce = !isInsideReasoningBox && !isMathLang && isSettled && !barredFromAce.includes(lang) && (block.isComplete || lineCount >= 3);
                const isCurrentlyAce = nodeObj.wrapper.dataset.aceInjected === "true";
                if (shouldBeAce !== isCurrentlyAce || (['markdown', 'md'].includes(lang) && !nodeObj.wrapper.classList.contains('scribe-markdown-preview-block'))) {
                    typeMismatch = true;
                }
            }

            if (nodeObj && nodeObj.wrapper && typeMismatch) {
                nodeObj.wrapper.remove();
                const editorId = nodeObj.wrapper.dataset.editorId;
                if (editorId && this.editorPool.has(editorId)) {
                    try {
                        if (this.observedNodes.has(editorId)) {
                            this.editorObserver.unobserve(this.observedNodes.get(editorId));
                            this.observedNodes.delete(editorId);
                        }
                        this.editorPool.get(editorId).destroy();
                        this.editorPool.delete(editorId);
                    } catch (e) {}
                }
                nodeObj = null;
            }

            if (!nodeObj) {
                nodeObj = this._createBlockElement(block, msgId, currentBlockId, containerElement);
                nodeObj.lastContentTrace = "";
                nodeObj.lastRenderedCompletionState = null;
                nodeObj.childrenCache = { cache: [] };

                let nextNodeObj = nodeCache.cache.slice(i + 1).find(n => n && n.wrapper && n.wrapper.parentNode === containerElement);
                if (nextNodeObj) {
                    containerElement.insertBefore(nodeObj.wrapper, nextNodeObj.wrapper);
                } else {
                    containerElement.appendChild(nodeObj.wrapper);
                }
                nodeCache.cache[i] = nodeObj;

                if (['artifact', 'code_block'].includes(block.type) && nodeObj.wrapper.dataset.aceInjected === "true") {
                    const editorDiv = nodeObj.wrapper.querySelector('.scribe-ace-editor');
                    if (editorDiv) {
                        const lang = block.type === 'code_block' ? block.attributes : (this._parseAttributes(block.attributes)['language'] || 'text');
                        this._mountAceEditor(nodeObj.wrapper, editorDiv, lang, block.content, block.isComplete); 
                    }
                }
            }

            const needsRender = nodeObj.lastContentTrace !== block.content || 
                                nodeObj.lastRenderedCompletionState !== block.isComplete || 
                                block.type === 'math_block';

            if (needsRender) {
                nodeObj.lastContentTrace = block.content;
                nodeObj.lastRenderedCompletionState = block.isComplete;

                if (block.type === 'text') {
                    this._renderMarkdownAndMath(nodeObj.target, block.content, registry, nodeObj);
                } else if (nodeObj.wrapper.classList.contains('scribe-markdown-preview-block')) {
                    this._renderMarkdownAndMath(nodeObj.target, block.content, registry, nodeObj);
                } else if (block.type === 'math_block' || (block.type === 'code_block' && (['math', 'latex', 'katex'].includes(nodeObj.wrapper.dataset.lang) || nodeObj.wrapper.dataset.isMathPrediction === "true"))) {
                    const cacheKey = `${btoa(encodeURIComponent(block.content))}-block`;
                    if (this.mathRenderCache.has(cacheKey)) {
                        nodeObj.target.innerHTML = this.mathRenderCache.get(cacheKey);
                    } else {
                        const cleanTex = this._healKaTeX(block.content);
                        try {
                            const spanNode = document.createElement('span');
                            window.katex.render(cleanTex, spanNode, { displayMode: true, throwOnError: true });
                            this.mathRenderCache.set(cacheKey, spanNode.innerHTML);
                            nodeObj.target.innerHTML = spanNode.innerHTML;
                            nodeObj.target.classList.remove('scribe-math-raw');
                        } catch (err) {
                            nodeObj.target.textContent = cleanTex;
                            nodeObj.target.classList.add('scribe-math-raw');
                        }
                    }
                } else if (block.type === 'winner') {
                    nodeObj.target.innerHTML = `<strong>Optimal Vector Selected:</strong> ${window.DOMPurify.sanitize(this._escapeHtml(block.content))}`;
                } else if (['artifact', 'code_block'].includes(block.type)) {
                    if (nodeObj.wrapper.classList.contains('scribe-artifact-native') || nodeObj.wrapper.classList.contains('scribe-code-native') || nodeObj.wrapper.classList.contains('scribe-native-code-wrapper')) {
                        const lang = nodeObj.wrapper.dataset.lang;
                        if (lang === 'mermaid') {
                            this._renderMarkdownAndMath(nodeObj.target, `\`\`\`mermaid\n${block.content.trim()}\n\`\`\``, []);
                        } else {
                            const codeContainer = nodeObj.wrapper.querySelector('code.streaming-code-payload') || nodeObj.target.querySelector('code.streaming-code-payload');
                            if (codeContainer) {
                                codeContainer.textContent = block.content;
                            } else {
                                nodeObj.target.textContent = block.content;
                            }
                        }
                    } else if (window.ace && this.editorPool.has(currentBlockId)) {
                        const editor = this.editorPool.get(currentBlockId);
                        const lang = block.type === 'code_block' ? block.attributes : (this._parseAttributes(block.attributes)['language'] || 'text');
                        const extOrLang = (lang && lang.indexOf('.') > -1) ? lang.split('.').pop() : lang;
                        const aceModePath = this._resolveAceMode(extOrLang);

                        if (editor.session.$modeId !== aceModePath) {
                            editor.session.setMode(aceModePath);
                            const langLabel = nodeObj.wrapper.querySelector('.ace-lang-label');
                            if (langLabel) {
                                if (block.type === 'code_block') {
                                    langLabel.textContent = block.attributes.toUpperCase() || "CODE";
                                } else {
                                    const attrs = this._parseAttributes(block.attributes);
                                    langLabel.textContent = attrs['name'] || attrs['identifier'] || (attrs['language'] || 'text').toUpperCase();
                                }
                            }
                        }
                        
                        const currentVal = editor.getValue();
                        if (currentVal !== block.content) {
                            if (block.content.startsWith(currentVal)) {
                                const appendPart = block.content.substring(currentVal.length);
                                const row = editor.session.getLength() - 1;
                                const column = editor.session.getLine(row).length;
                                editor.session.insert({ row, column }, appendPart);
                            } else {
                                const scrollPos = editor.session.getScrollTop();
                                editor.setValue(block.content, 1);
                                editor.session.setScrollTop(scrollPos);
                            }
                            editor.clearSelection();

                            if (!block.isComplete) {
                                const totalRows = editor.session.getLength();
                                editor.renderer.scrollToRow(totalRows);
                            }
                        }

                        if (block.isComplete && !editor.session.getUseWorker()) {
                            const activeModeName = aceModePath.split('/').pop();
                            const skippedWorkerModes = ['text', 'plain', 'abstract', 'none', 'markdown', 'mermaid'];
                            if (!skippedWorkerModes.includes(activeModeName)) {
                                editor.setOptions({ useWorker: true, highlightActiveLine: true });
                                editor.session.setUseWorker(true);
                                window.requestAnimationFrame(() => {
                                    editor.resize();
                                    editor.renderer.updateFull();
                                });
                            }
                        }
                    }
                }
            }

            if (block.children && block.children.length > 0) {
                this._renderBlockTree(nodeObj.target, block.children, msgId, `${prefixId}-${i}`, registry, nodeObj.childrenCache);
            }

            if (nodeObj.wrapper.tagName === 'DETAILS') {
                if (block.isComplete) {
                    if (!nodeObj.wrapper.hasAttribute('data-vis-sealed')) {
                        nodeObj.wrapper.removeAttribute('open');
                        nodeObj.wrapper.setAttribute('data-vis-sealed', 'true');
                    }
                } else {
                    nodeObj.wrapper.setAttribute('open', 'true');
                    nodeObj.wrapper.removeAttribute('data-vis-sealed');
                }
            }
        }
    }

    _renderBuffer(msgId) {
        const stream = this.activeStreams.get(msgId);
        if (!stream || stream.isFinalized) return;
        stream.lastRenderTime = performance.now();
        const isAtBottom = this._isScrolledToBottom();
        
        this._renderBlockTree(stream.container, stream.parsedBlocks, msgId, 'stream', stream.mathRegistry, { cache: stream.blockNodes });
        if (isAtBottom || this._forceStickyFollow) this._scrollToBottom(true);
        stream.isPendingRender = false;
    }

    finalizeMessage(msgId) {
        const stream = this.activeStreams.get(msgId);
        if (!stream || stream.isFinalized) return;
        stream.lastRenderTime = 0; 
        this._renderBuffer(msgId);
        stream.isFinalized = true;
        this._forceStickyFollow = false;

        const finalizeCacheElements = (nodeCache) => {
            nodeCache.forEach(nodeObj => {
                const editorId = nodeObj.wrapper.dataset.editorId;
                if (editorId && this.editorPool.has(editorId)) {
                    const editor = this.editorPool.get(editorId);
                    if (editor) {
                        const aceModePath = editor.session.$modeId || '';
                        const activeModeName = aceModePath.split('/').pop();
                        const skippedWorkerModes = ['text', 'plain', 'abstract', 'none', 'markdown', 'mermaid'];
                        const shouldUseWorker = !skippedWorkerModes.includes(activeModeName);
                        
                        editor.setOptions({ useWorker: shouldUseWorker, highlightActiveLine: true });
                        editor.session.setUseWorker(shouldUseWorker);
                        editor.resize();
                        editor.renderer.updateFull();
                    }
                }
                if (nodeObj.childrenCache && nodeObj.childrenCache.cache.length > 0) {
                    finalizeCacheElements(nodeObj.childrenCache.cache);
                }
            });
        };
        finalizeCacheElements(stream.blockNodes);
        this.activeStreams.delete(msgId);
        this._scrollToBottom(true);
    }

    purgeMessagePool(msgId) {
        const targets = [];
        this.editorPool.forEach((editor, id) => {
            if (id.startsWith(msgId)) targets.push(id);
        });
        for (let t = 0; t < targets.length; t++) {
            const id = targets[t];
            try {
                if (this.observedNodes.has(id)) {
                    this.editorObserver.unobserve(this.observedNodes.get(id));
                    this.observedNodes.delete(id);
                }
                const editor = this.editorPool.get(id);
                if (editor) {
                    editor.destroy();
                    if (editor.container) editor.container.remove();
                }
            } catch (e) {}
            this.editorPool.delete(id);
        }
        this.messageRegistry.delete(msgId);
    }

    _isScrolledToBottom() {
        const threshold = 120;
        const totalScrollable = this.historyNode.scrollHeight - this.historyNode.clientHeight;
        return (totalScrollable - this.historyNode.scrollTop) <= threshold;
    }

    _scrollToBottom(force = false) {
        if (force || this._isScrolledToBottom()) {
            let sentinel = document.getElementById('scribe-scroll-sentinel');
            if (!sentinel) {
                sentinel = document.createElement('div');
                sentinel.id = 'scribe-scroll-sentinel';
                this.historyNode.appendChild(sentinel);
            }
            
            const orchestratorHeight = this.compositorNode ? this.compositorNode.offsetHeight : 180;
            sentinel.style.height = `${orchestratorHeight + 40}px`;
            sentinel.style.width = '100%';
            sentinel.style.pointerEvents = 'none';
            
            if (this.historyNode.lastChild !== sentinel) {
                this.historyNode.appendChild(sentinel);
            }
            
            this.historyNode.scrollTop = this.historyNode.scrollHeight;
        }
    }
}

window.Compositor = new ScribeCompositor();