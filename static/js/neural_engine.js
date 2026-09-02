class LexicalAutomaton {
    static extractBlock(text, tag) {
        if (!text) return null;
        let i = 0;
        const len = text.length;
        while (i < len) {
            if (text[i] === '<' && text[i + 1] !== '/') {
                if (text.startsWith(tag, i + 1)) {
                    const nextChar = text[i + 1 + tag.length];
                    if (nextChar === '>' || nextChar === ' ' || nextChar === '\t' || nextChar === '\n' || nextChar === '\r') {
                        let inQuote = null;
                        let tagEndIdx = -1;
                        for (let j = i + 1 + tag.length; j < len; j++) {
                            const c = text[j];
                            if (c === '"' || c === "'") {
                                if (!inQuote) inQuote = c;
                                else if (inQuote === c) inQuote = null;
                            } else if (c === '>' && !inQuote) {
                                tagEndIdx = j;
                                break;
                            }
                        }
                        if (tagEndIdx !== -1) {
                            const innerStart = tagEndIdx + 1;
                            const closeTag = `</${tag}>`;
                            const closeIdx = text.indexOf(closeTag, innerStart);
                            if (closeIdx !== -1) {
                                return text.substring(innerStart, closeIdx).trim();
                            }
                        }
                    }
                }
            }
            i++;
        }
        return null;
    }

    static extractArtifact(text) {
        if (!text) return null;
        let i = 0;
        const len = text.length;
        while (i < len) {
            if (text[i] === '<' && text.startsWith('artifact', i + 1)) {
                const nextChar = text[i + 1 + 8];
                if (nextChar === '>' || nextChar === ' ' || nextChar === '\t' || nextChar === '\n' || nextChar === '\r') {
                    let inQuote = null;
                    let tagEndIdx = -1;
                    for (let j = i + 9; j < len; j++) {
                        const c = text[j];
                        if (c === '"' || c === "'") {
                            if (!inQuote) inQuote = c;
                            else if (inQuote === c) inQuote = null;
                        } else if (c === '>' && !inQuote) {
                            tagEndIdx = j;
                            break;
                        }
                    }
                    if (tagEndIdx !== -1) {
                        const innerStart = tagEndIdx + 1;
                        const closeTag = "</artifact>";
                        const closeIdx = text.indexOf(closeTag, innerStart);
                        if (closeIdx !== -1) {
                            return text.substring(innerStart, closeIdx).trim();
                        }
                    }
                }
            }
            i++;
        }
        return null;
    }

    static compressLatentSpace(text, targetTags) {
        if (!text) return text;
        let result = '';
        let i = 0;
        const len = text.length;
        const compressedMarker = '[LATENT REASONING COMPRESSED]';
        while (i < len) {
            if (text[i] === '<' && text[i + 1] !== '/') {
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
                    let inQuote = null;
                    let tagEndIdx = -1;
                    for (let j = i + 1 + matchedTag.length; j < len; j++) {
                        const c = text[j];
                        if (c === '"' || c === "'") {
                            if (!inQuote) inQuote = c;
                            else if (inQuote === c) inQuote = null;
                        } else if (c === '>' && !inQuote) {
                            tagEndIdx = j;
                            break;
                        }
                    }
                    if (tagEndIdx !== -1) {
                        const closeTag = `</${matchedTag}>`;
                        const closeIdx = text.indexOf(closeTag, tagEndIdx + 1);
                        if (closeIdx !== -1) {
                            result += (result.endsWith('\n') || result === '' ? '' : '\n') + compressedMarker + '\n';
                            i = closeIdx + closeTag.length;
                            continue;
                        }
                    }
                }
            }
            result += text[i];
            i++;
        }
        const token = '[LATENT REASONING COMPRESSED]';
        let lines = result.split('\n');
        let dynamicLines = [];
        let lastWasMarker = false;
        for (let line of lines) {
            let trimmed = line.trim();
            if (trimmed === token) {
                if (!lastWasMarker) {
                    dynamicLines.push(token);
                    lastWasMarker = true;
                }
            } else {
                if (line || !lastWasMarker) {
                    dynamicLines.push(line);
                }
                if (trimmed !== '') {
                    lastWasMarker = false;
                }
            }
        }
        return dynamicLines.join('\n').trim();
    }

    static hasStatus(text, statusString) {
        if (!text) return false;
        const extracted = this.extractBlock(text, "status");
        if (!extracted) return false;
        return extracted.toLowerCase() === statusString.toLowerCase();
    }
}

class VectorizedVirtualFileSystem {
    constructor(memoryStruct) {
        this.registers = new Map();
        this.lineIndex = new Map();
        if (Array.isArray(memoryStruct)) {
            memoryStruct.forEach(key => this.write(key, ""));
        }
    }

    write(key, content, mode = "overwrite") {
        const cleanContent = (content || "").trim();
        let finalContent = cleanContent;
        if (mode === "append" && this.registers.has(key)) {
            finalContent = `${this.registers.get(key)}\n\n${cleanContent}`;
        }
        this.registers.set(key, finalContent);
        this.lineIndex.set(key, finalContent.split('\n'));
    }

    read(memoryKeys) {
        if (!memoryKeys || !Array.isArray(memoryKeys)) return "";
        return memoryKeys.map(key => {
            const content = this.registers.get(key);
            if (!content || content.trim() === "") return "";
            return `<${key}>\n${content}\n</${key}>`;
        }).filter(str => str.length > 0).join("\n\n");
    }

    readChunk(key, offset, length) {
        const content = this.registers.get(key);
        if (!content) return "";
        return content.substring(offset, offset + length);
    }

    getMetadata(key) {
        const lines = this.lineIndex.get(key);
        return lines ? { length: this.registers.get(key).length, lines: lines.length } : null;
    }

    search(key, query, contextLines = 2) {
        const lines = this.lineIndex.get(key);
        if (!lines) return "REGISTER EMPTY";
        const results = [];
        const queryLower = String(query).toLowerCase();
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].toLowerCase().includes(queryLower)) {
                const start = Math.max(0, i - contextLines);
                const end = Math.min(lines.length - 1, i + contextLines);
                const snippet = lines.slice(start, end + 1).map((l, idx) => `[Line ${start + idx}]: ${l}`).join('\n');
                results.push(`--- Match found at line ${i} ---\n${snippet}`);
            }
        }
        return results.length > 0 ? results.slice(0, 10).join('\n\n') : "NO MATCHES FOUND";
    }

    searchRegex(key, pattern, contextLines = 2) {
        const lines = this.lineIndex.get(key);
        if (!lines) return "REGISTER EMPTY";
        const results = [];
        let regex;
        try { regex = new RegExp(pattern, 'i'); } 
        catch (e) { return `REGEX SYNTAX FAULT: ${e.message}`; }
        for (let i = 0; i < lines.length; i++) {
            if (regex.test(lines[i])) {
                const start = Math.max(0, i - contextLines);
                const end = Math.min(lines.length - 1, i + contextLines);
                const snippet = lines.slice(start, end + 1).map((l, idx) => `[Line ${start + idx}]: ${l}`).join('\n');
                results.push(`--- Match found at line ${i} ---\n${snippet}`);
            }
        }
        return results.length > 0 ? results.slice(0, 10).join('\n\n') : "NO MATCHES FOUND";
    }

    get(key) { return this.registers.get(key) || null; }

    clone() {
        const clonedVFS = new VectorizedVirtualFileSystem([]);
        this.registers.forEach((value, key) => clonedVFS.write(key, value));
        return clonedVFS;
    }
}

class DAGLogicEvaluator {
    static _compilerCache = new Map();

    static evaluateNextStep(output, logicMap) {
        if (!logicMap) return null;
        const cleanOutput = (output || "").trim();
        if (logicMap[cleanOutput]) return logicMap[cleanOutput];
        if (logicMap["_condition_"]) {
            const condition = logicMap["_condition_"];
            try {
                let evaluatorFunc = this._compilerCache.get(condition);
                if (!evaluatorFunc) {
                    evaluatorFunc = new Function('_output_', `return ${condition};`);
                    this._compilerCache.set(condition, evaluatorFunc);
                }
                return evaluatorFunc(cleanOutput) ? logicMap["_if_true_"] : logicMap["_if_false_"];
            } catch (e) {
                return logicMap["_default_"] || null;
            }
        }
        return logicMap["_default_"] || null;
    }
}

class ContextMatrix {
    static async countTokens(text) {
        try {
            if (window.ScribeGateway && typeof window.ScribeGateway._dispatch === 'function') {
                const res = await window.ScribeGateway._dispatch('/api/tokenize', { content: text });
                const data = await res.json();
                if (data && Array.isArray(data.tokens)) {
                    return data.tokens.length;
                }
            }
        } catch (e) {}
        return Math.floor(text.length / 3.7);
    }

    static async enforceContextBounds(messagesArray, projectedTokens, statusNodeId, abortSignal, slotMultiplier = 1) {
        if (abortSignal?.aborted) throw new DOMException("Aborted", "AbortError");
        let activeMaxCtx = 8192;
        if (window.ScribeGateway?.config?.ctx_size) {
            const parsed = parseInt(window.ScribeGateway.config.ctx_size, 10);
            if (!isNaN(parsed) && parsed > 0) activeMaxCtx = parsed;
        } else {
            const ctxDisplay = document.getElementById('val-ctx-display');
            if (ctxDisplay && ctxDisplay.textContent) {
                const parsed = parseInt(ctxDisplay.textContent.replace(/,/g, '').replace(/[^0-9]/g, ''));
                if (!isNaN(parsed) && parsed > 0) activeMaxCtx = parsed;
            }
        }
        let safeMessages = [...messagesArray];
        const compileText = (msgs) => msgs.map(m => Array.isArray(m.content) ? m.content.map(c => c.text || '').join(' ') : m.content).join('\n\n');
        
        let currentTokens = await this.countTokens(compileText(safeMessages));
        
        const COMPRESSION_RESERVE = 512;
        const dynamicMargin = activeMaxCtx > 16384 ? 0.95 : 0.90;
        const absoluteMaxSafe = Math.floor(activeMaxCtx * dynamicMargin) - COMPRESSION_RESERVE;
        
        currentTokens = Math.floor(currentTokens * 1.05) + 32; 

        if (currentTokens + (projectedTokens * slotMultiplier) >= absoluteMaxSafe && safeMessages.length > 3) {
            window.Compositor.streamToken(statusNodeId, `\n> [CONTEXT LIMIT EVACUATION]: Executing Bulk Context-Slicing Consolidation...\n`);
            const systemPreserve = safeMessages[0].role === 'system' ? 1 : 0;
            const recentWindowSize = 4;
            const intermediateStart = systemPreserve;
            const intermediateEnd = safeMessages.length - recentWindowSize;
            if (intermediateEnd > intermediateStart + 1) {
                const intermediateMessages = safeMessages.slice(intermediateStart, intermediateEnd);
                const textToCompress = intermediateMessages.map(m => `[${m.role.toUpperCase()}]: ${Array.isArray(m.content) ? m.content.map(c => c.text || '').join(' ') : m.content}`).join('\n');
                
                const compressionPayload = {
                    messages: [
                        { role: "system", content: "Compress the following historical interactions into a mathematically dense latent state summary. Retain factual constraints, variables, and structural rules. Do not hallucinate." },
                        { role: "user", content: textToCompress }
                    ],
                    temperature: 0.1,
                    max_tokens: 1024,
                    stream: false
                };
                try {
                    const res = await window.ScribeGateway._dispatch('/api/chat', compressionPayload, { signal: abortSignal });
                    const data = await res.json();
                    const summary = data.choices[0]?.message?.content || "[COMPRESSION FAULT]";
                    
                    safeMessages.splice(intermediateStart, intermediateMessages.length, {
                        role: "assistant",
                        content: `<latent_state_summary>\n${summary}\n</latent_state_summary>`
                    });
                } catch (e) {
                    if (e.name === 'AbortError') throw e;
                    safeMessages.splice(intermediateStart, intermediateEnd - intermediateStart);
                }
            } else {
                while (currentTokens + (projectedTokens * slotMultiplier) >= absoluteMaxSafe && safeMessages.length > 2) {
                    safeMessages.splice(systemPreserve, 1);
                    currentTokens = await this.countTokens(compileText(safeMessages));
                }
            }
            currentTokens = await this.countTokens(compileText(safeMessages));
        }
        
        if (currentTokens + (projectedTokens * slotMultiplier) >= absoluteMaxSafe) {
            return { isSafe: false, safeMessages, safeMaxTokens: 0, currentCount: currentTokens, activeMaxCtx };
        }
        const safeMaxTokens = Math.min(projectedTokens, absoluteMaxSafe - currentTokens);
        return { isSafe: true, safeMessages, safeMaxTokens: Math.max(128, safeMaxTokens), currentCount: currentTokens, activeMaxCtx };
    }
}

class ExecutionStrategy {
    async execute(node, messages, vfs, statusNodeId, abortSignal) { throw new Error("Unimplemented Execution Strategy"); }
}

class StandardNodeStrategy extends ExecutionStrategy {
    async execute(node, messages, vfs, statusNodeId, abortSignal) {
        if (abortSignal?.aborted) throw new DOMException("Aborted", "AbortError");
        const isStructural = !!node._json_schema || !!node._grammar_rule;
        const payload = {
            messages: messages,
            temperature: Math.max(0.01, node._inference_parameters?.temperature ?? 0.1),
            min_p: node._inference_parameters?.min_p ?? 0.05,
            repeat_penalty: node._inference_parameters?.repeat_penalty ?? 1.05,
            max_tokens: node._inference_parameters?.max_tokens ?? 2048,
            stream: true
        };
        if (node._json_schema) {
            payload.response_format = { type: "json_schema", json_schema: { name: "scribe_schema", strict: true, schema: node._json_schema } };
        } else if (node._grammar_rule) {
            payload.grammar = node._grammar_rule; 
        }
        const streamResult = await window.ScribeGateway.streamChat(payload, (token) => {
            if (statusNodeId && !isStructural) window.Compositor.streamToken(statusNodeId, token);
        }, abortSignal);
        let completeResponse = streamResult.content;
        let currentFinishReason = streamResult.finish_reason;
        if (!isStructural) {
            let continuationCount = 0;
            const maxContinuations = 4;
            while (currentFinishReason === 'length' && continuationCount < maxContinuations) {
                continuationCount++;
                
                let continuationMessages = [...messages];
                continuationMessages.push({ role: "assistant", content: completeResponse });
                const horizon = await ContextMatrix.enforceContextBounds(continuationMessages, payload.max_tokens, statusNodeId, abortSignal);
                if (!horizon.isSafe || horizon.safeMaxTokens < 64) break;
                let nextPayload = {
                    messages: horizon.safeMessages,
                    temperature: payload.temperature,
                    min_p: payload.min_p,
                    repeat_penalty: payload.repeat_penalty,
                    max_tokens: horizon.safeMaxTokens,
                    stream: true
                };
                const nextResult = await window.ScribeGateway.streamChat(nextPayload, (token) => {
                    completeResponse += token;
                    if (statusNodeId) window.Compositor.streamToken(statusNodeId, token);
                }, abortSignal);
                currentFinishReason = nextResult.finish_reason;
            }
        }
        return completeResponse;
    }
}

class MCTSNodeStrategy extends ExecutionStrategy {
    async execute(node, messages, vfs, statusNodeId, abortSignal) {
        const candidatesCount = node._candidates || 3;
        const maxDepth = node._max_depth || 1; 
        const baseTemp = Math.max(0.01, node._inference_parameters?.temperature ?? 0.6);
        
        let bestCandidateTotal = "";
        let currentMessages = [...messages];
        window.Compositor.streamToken(statusNodeId, `\n  *Initiating Parallel DisCIPL Search (Depth: ${maxDepth}, Slots: ${candidatesCount})...*\n`);
        for (let depth = 0; depth < maxDepth; depth++) {
            if (abortSignal?.aborted) throw new DOMException("Aborted", "AbortError");
            const projectedTokens = node._inference_parameters?.max_tokens ?? 2048;
            const horizon = await ContextMatrix.enforceContextBounds(currentMessages, projectedTokens, statusNodeId, abortSignal, candidatesCount);
            
            if (!horizon.isSafe) {
                window.Compositor.streamToken(statusNodeId, `  > [VRAM Bounds]: Context horizon exhausted. Forcing clean trajectory convergence.\n`);
                break;
            }
            window.Compositor.streamToken(statusNodeId, `  > [Depth ${depth + 1}/${maxDepth}] Spawning divergent tensor trajectories...\n`);
            const candidatePromises = [];
            for (let i = 0; i < candidatesCount; i++) {
                const branchPayload = { 
                    messages: horizon.safeMessages,
                    temperature: i === 0 ? 0.01 : baseTemp + (i * 0.12),
                    min_p: i === 0 ? 0.02 : 0.05 + (i * 0.04),
                    max_tokens: horizon.safeMaxTokens,
                    stream: false 
                };
                candidatePromises.push(window.ScribeGateway._dispatch('/api/chat', branchPayload, { signal: abortSignal })
                    .then(async (r) => {
                        const data = await r.json();
                        let content = data.choices[0]?.message?.content || "";
                        let choiceFinishReason = data.choices[0]?.finish_reason || "stop";
                        
                        let subContinuation = 0;
                        while (choiceFinishReason === 'length' && subContinuation < 2) {
                            subContinuation++;
                            let subMsgs = [...horizon.safeMessages, { role: "assistant", content: content }];
                            const subHorizon = await ContextMatrix.enforceContextBounds(subMsgs, branchPayload.max_tokens, statusNodeId, abortSignal);
                            if (!subHorizon.isSafe || subHorizon.safeMaxTokens < 64) break;
                            
                            const repairRes = await window.ScribeGateway._dispatch('/api/chat', {
                                messages: subHorizon.safeMessages,
                                temperature: branchPayload.temperature,
                                min_p: branchPayload.min_p,
                                max_tokens: subHorizon.safeMaxTokens,
                                stream: false
                            }, { signal: abortSignal });
                            
                            const repairData = await repairRes.json();
                            content += repairData.choices[0]?.message?.content || "";
                            choiceFinishReason = repairData.choices[0]?.finish_reason || "stop";
                        }
                        return content;
                    })
                    .catch((e) => {
                        if (e.name === 'AbortError') throw e;
                        return null;
                    }));
            }
            const candidates = (await Promise.all(candidatePromises)).filter(c => c !== null);
            if (candidates.length === 0) throw new Error("Complete hardware slot failure.");
            if (candidates.length === 1) {
                bestCandidateTotal += (depth === 0 ? "" : "\n") + candidates[0];
                currentMessages.push({ role: "assistant", content: candidates[0] });
                continue;
            }
            window.Compositor.streamToken(statusNodeId, `  > Critic Node: Enforcing Schema Heuristics...\n`);
            const evalContent = `Evaluate the following ${candidates.length} candidates based on this strict objective: ${node._evaluator_instruction}\n\n` + 
                candidates.map((c, i) => `<candidate index="${i}">\n${c}\n</candidate>`).join('\n\n');
            const evalPayload = {
                messages: [{ role: "user", content: evalContent }],
                temperature: 0.01, 
                max_tokens: 512, 
                stream: false,
                response_format: { 
                    type: "json_schema",
                    json_schema: {
                        name: "critic_schema",
                        strict: true,
                        schema: {
                            type: "object",
                            properties: {
                                evaluations: { type: "array", items: { type: "string" }, description: "Brief critique of each candidate" },
                                winning_index: { type: "integer", description: "The integer index of the superior candidate" },
                                is_resolved: { type: "boolean", description: "True if the ultimate objective is completely fulfilled" }
                            },
                            required: ["evaluations", "winning_index", "is_resolved"],
                            additionalProperties: false
                        }
                    }
                }
            };
            let bestIndex = 0;
            let isResolved = false;
            try {
                if (abortSignal?.aborted) throw new DOMException("Aborted", "AbortError");
                const evalRes = await window.ScribeGateway._dispatch('/api/chat', evalPayload, { signal: abortSignal });
                const evalData = await evalRes.json();
                const parsed = JSON.parse(evalData.choices[0]?.message?.content);
                
                bestIndex = Number.isInteger(parsed.winning_index) 
                    ? Math.max(0, Math.min(candidates.length - 1, parsed.winning_index)) 
                    : 0;
                
                isResolved = parsed.is_resolved === true;
            } catch (e) {
                if (e.name === 'AbortError') throw e;
                window.Compositor.streamToken(statusNodeId, `  > [Critic Fault]: Initiating Verification Cycle...\n`);
                bestIndex = 0; 
            }
            const winningText = candidates[bestIndex];
            window.Compositor.streamToken(statusNodeId, `  > Branch ${bestIndex} accepted mathematically. Pruning dead paths.\n`);
            
            bestCandidateTotal += (depth === 0 ? "" : "\n") + winningText;
            if (isResolved || depth === maxDepth - 1) {
                if (isResolved && maxDepth > 1) window.Compositor.streamToken(statusNodeId, `  > Ground truth achieved early. Collapsing graph.\n`);
                break;
            } else {
                currentMessages.push({ role: "assistant", content: winningText });
                currentMessages.push({ role: "user", content: "Continue refining this trajectory. If complete, output conclusive logic." });
            }
        }
        return bestCandidateTotal;
    }
}

class RLMNodeStrategy extends ExecutionStrategy {
    async execute(node, messages, vfs, statusNodeId, abortSignal) {
        const maxCycles = node._max_rlm_cycles || 10;
        let currentMessages = [...messages];
        let cumulativeOutput = "";
        window.Compositor.streamToken(statusNodeId, `\n  *Initiating Recursive Language Model (RLM) Sandbox (Max Cycles: ${maxCycles})...*\n`);
        for (let cycle = 1; cycle <= maxCycles; cycle++) {
            if (abortSignal?.aborted) throw new DOMException("Aborted", "AbortError");
            const projectedTokens = node._inference_parameters?.max_tokens ?? 2048;
            const horizon = await ContextMatrix.enforceContextBounds(currentMessages, projectedTokens, statusNodeId, abortSignal);
            
            if (!horizon.isSafe) {
                window.Compositor.streamToken(statusNodeId, `  > [VRAM Bounds]: Latent recursion limits breached. Terminating RLM.\n`);
                break;
            }
            window.Compositor.streamToken(statusNodeId, `  > [Cycle ${cycle}/${maxCycles}] Synthesizing latent operations...\n`);
            const iterPayload = { 
                messages: horizon.safeMessages, 
                temperature: Math.max(0.01, node._inference_parameters?.temperature ?? 0.1),
                max_tokens: horizon.safeMaxTokens,
                stream: false 
            };
            
            const response = await window.ScribeGateway._dispatch('/api/chat', iterPayload, { signal: abortSignal });
            const data = await response.json();
            let rawOutput = data.choices[0]?.message?.content || "";
            let currentFinishReason = data.choices[0]?.finish_reason || "stop";
            
            let rlmContinuation = 0;
            while (currentFinishReason === 'length' && rlmContinuation < 3) {
                rlmContinuation++;
                let rlmRepairMsgs = [...horizon.safeMessages, { role: "assistant", content: rawOutput }];
                const rlmHorizon = await ContextMatrix.enforceContextBounds(rlmRepairMsgs, projectedTokens, statusNodeId, abortSignal);
                if (!rlmHorizon.isSafe || rlmHorizon.safeMaxTokens < 64) break;
                
                const repairRes = await window.ScribeGateway._dispatch('/api/chat', { 
                    messages: rlmHorizon.safeMessages, 
                    temperature: iterPayload.temperature, 
                    max_tokens: rlmHorizon.safeMaxTokens, 
                    stream: false 
                }, { signal: abortSignal });
                const repairData = await repairRes.json();
                rawOutput += repairData.choices[0]?.message?.content || "";
                currentFinishReason = repairData.choices[0]?.finish_reason || "stop";
            }
            
            cumulativeOutput += "\n" + rawOutput;
            currentMessages.push({ role: "assistant", content: rawOutput });
            if (LexicalAutomaton.hasStatus(rawOutput, "resolved")) {
                window.Compositor.streamToken(statusNodeId, `  > Recursive Loop Terminated: Ground truth converged.\n`);
                break;
            }
            const codeBlock = LexicalAutomaton.extractBlock(rawOutput, "rlm_exec");
            if (codeBlock) {
                const replResult = await this._evaluateInWorkerSandbox(codeBlock, vfs, 10000, abortSignal);
                currentMessages.push({ role: "user", content: `<rlm_result>\n${replResult}\n</rlm_result>\nProceed with deduction. If complete, emit <status>resolved</status>.` });
            } else {
                currentMessages.push({ role: "user", content: `[SYSTEM] Mandatory constraint failure. You must either execute a slice via <rlm_exec>...</rlm_exec> or finalize via <status>resolved</status>.` });
            }
            
            if (cycle === maxCycles) window.Compositor.streamToken(statusNodeId, `  > [Limits Reached]: Forcing convergence.\n`);
        }
        return cumulativeOutput;
    }

    _evaluateInWorkerSandbox(code, vfs, timeoutMs, abortSignal) {
        return new Promise((resolve, reject) => {
            if (abortSignal?.aborted) return reject(new DOMException("Aborted", "AbortError"));
            const workerCode = `
                const _securePostMessage = self.postMessage.bind(self);
                
                ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'close', 'postMessage'].forEach(api => {
                    try {
                        Object.defineProperty(self, api, { 
                            value: function() { throw new Error("Security Exception: API restricted by Scribe Air-Gap."); }, 
                            writable: false, 
                            configurable: false 
                        });
                    } catch(apiErr) {}
                });
                
                try {
                    Object.freeze(Object.prototype);
                    Object.freeze(Array.prototype);
                    Object.freeze(String.prototype);
                } catch(freezeErr) {}
                const pendingRequests = new Map();
                let requestCounter = 0;
                
                function sendVfsRequest(method, args) {
                    return new Promise((resolve, reject) => {
                        const id = requestCounter++;
                        pendingRequests.set(id, { resolve, reject });
                        _securePostMessage({ type: 'vfs_request', id, method, args });
                    });
                }
                
                self.onmessage = async function(e) {
                    const msg = e.data;
                    if (msg.type === 'execute') {
                        const rpcVFS = {
                            readChunk: (k, offset, length) => sendVfsRequest('readChunk', [k, offset, length]),
                            getMetadata: (k) => sendVfsRequest('getMetadata', [k]),
                            search: (k, query, ctxLines) => sendVfsRequest('search', [k, query, ctxLines]),
                            searchRegex: (k, pattern, ctxLines) => sendVfsRequest('searchRegex', [k, pattern, ctxLines])
                        };
                        try {
                            const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
                            const safeEval = new AsyncFunction('vfs', \`try { return await (async () => { \${msg.code} })(); } catch(err) { return "FAULT: " + err.message; }\`);
                            const result = await safeEval(rpcVFS);
                            _securePostMessage({ type: 'eval_complete', result });
                        } catch(err) {
                            _securePostMessage({ type: 'eval_error', error: err.message });
                        }
                    } else if (msg.type === 'vfs_response') {
                        const req = pendingRequests.get(msg.id);
                        if (req) { req.resolve(msg.result); pendingRequests.delete(msg.id); }
                    }
                };
            `;
            const blob = new Blob([workerCode], { type: 'application/javascript' });
            const blobUrl = URL.createObjectURL(blob); 
            const worker = new Worker(blobUrl);
            
            const terminateSandbox = (payload, isError = false) => {
                clearTimeout(timeoutId);
                if (abortSignal) abortSignal.removeEventListener('abort', abortHandler);
                worker.terminate();
                URL.revokeObjectURL(blobUrl);
                if (isError) reject(payload);
                else resolve(payload);
            };
            const abortHandler = () => terminateSandbox(new DOMException("Aborted", "AbortError"), true);
            if (abortSignal) abortSignal.addEventListener('abort', abortHandler);
            const timeoutId = setTimeout(() => terminateSandbox("TIMEOUT FAULT: Evaluation exceeded compute bounds."), timeoutMs);
            worker.onmessage = (e) => {
                const msg = e.data;
                if (msg.type === 'vfs_request') {
                    try {
                        let result;
                        if (msg.method === 'readChunk') result = vfs.readChunk(...msg.args);
                        else if (msg.method === 'getMetadata') result = vfs.getMetadata(...msg.args);
                        else if (msg.method === 'search') result = vfs.search(...msg.args);
                        else if (msg.method === 'searchRegex') result = vfs.searchRegex(...msg.args);
                        worker.postMessage({ type: 'vfs_response', id: msg.id, result });
                    } catch(err) {
                        worker.postMessage({ type: 'vfs_response', id: msg.id, result: "RPC EXECUTION FAULT" });
                    }
                } else if (msg.type === 'eval_complete') {
                    terminateSandbox(typeof msg.result === 'object' ? JSON.stringify(msg.result, null, 2) : String(msg.result));
                } else if (msg.type === 'eval_error') {
                    terminateSandbox(`SYNTAX FAULT: ${msg.error}`);
                }
            };
            
            worker.onerror = (err) => terminateSandbox(`WORKER FAULT: ${err.message}`);
            worker.postMessage({ type: 'execute', code });
        });
    }
}

class InfillNodeStrategy extends ExecutionStrategy {
    async execute(node, messages, vfs, statusNodeId, abortSignal) {
        if (abortSignal?.aborted) throw new DOMException("Aborted", "AbortError");
        window.Compositor.streamToken(statusNodeId, `\n  *Initiating Latent Space Mutation (FIM)...*\n`);
        
        const prefix = vfs.get(node._infill_prefix) || "";
        const suffix = vfs.get(node._infill_suffix) || "";
        const payload = {
            input_prefix: prefix,
            input_suffix: suffix,
            temperature: Math.max(0.01, node._inference_parameters?.temperature ?? 0.1),
            min_p: node._inference_parameters?.min_p ?? 0.05,
            max_tokens: node._inference_parameters?.max_tokens ?? 2048,
            stream: false
        };
        const response = await window.ScribeGateway._dispatch('/api/infill', payload, { signal: abortSignal });
        const data = await response.json();
        const content = data.content || "";
        
        const marker = String.fromCharCode(96, 96, 96);
        if (statusNodeId) window.Compositor.streamToken(statusNodeId, `\n${marker}text\n${content}\n${marker}\n`);
        return content;
    }
}

class NodeDispatcher {
    constructor() {
        this.strategies = {
            'standard': new StandardNodeStrategy(),
            'mcts': new MCTSNodeStrategy(),
            'rlm': new RLMNodeStrategy(),
            'infill': new InfillNodeStrategy()
        };
    }

    async dispatch(node, messages, vfs, statusNodeId, abortSignal) {
        const mode = node._mode || 'standard';
        const strategy = this.strategies[mode] || this.strategies['standard'];
        return await strategy.execute(node, messages, vfs, statusNodeId, abortSignal);
    }
}

class NeuralEngine {
    constructor() {
        this.blueprintCache = new Map();
        this.memoryWindow = 12;
        this.dispatcher = new NodeDispatcher();
        this.globalVFS = new Map();
    }

    async fetchBlueprint(path, abortSignal) {
        if (this.blueprintCache.has(path)) return this.blueprintCache.get(path);
        try {
            const response = await fetch(path, { signal: abortSignal });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const blueprint = await response.json();
            this.blueprintCache.set(path, blueprint);
            return blueprint;
        } catch (error) { 
            if (error.name === 'AbortError') throw error;
            throw new Error(`Failed to load blueprint at: ${path}`); 
        }
    }

    _extractAndPruneHistory(historyArray) {
        let latestArtifact = "NONE";
        
        const prunedHistory = historyArray.map(msg => {
            let rawContent = msg.content;
            if (msg.msgId && window.Compositor && window.Compositor.messageRegistry && window.Compositor.messageRegistry.has(msg.msgId)) {
                const registryText = window.Compositor.messageRegistry.get(msg.msgId);
                if (typeof msg.content === 'string') {
                    rawContent = registryText;
                } else if (Array.isArray(msg.content)) {
                    rawContent = msg.content.map(item => {
                        if (item.type === 'text') {
                            return registryText || item.text || '';
                        }
                        return item.text || '';
                    }).join(' ').trim();
                }
            }
            
            let content = "";
            if (typeof rawContent === 'string') {
                content = rawContent;
            } else if (Array.isArray(rawContent)) {
                content = rawContent.map(item => {
                    if (item.type === 'text') return item.text || '';
                    if (item.type === 'image_url') return '[Image Payload]';
                    return '';
                }).join(' ').trim();
            } else {
                content = '[Multimodal Payload]';
            }
            
            if (msg.role === 'assistant') {
                const extractedArtifact = LexicalAutomaton.extractArtifact(content);
                if (extractedArtifact) {
                    latestArtifact = extractedArtifact;
                }
                content = LexicalAutomaton.compressLatentSpace(content, ['think', 'thought', 'rlm_exec', 'eval', 'artifact']);
            }
            return { role: msg.role, content: content };
        });
        return { prunedHistory, latestArtifact };
    }

    _extractFilesToBufferB(text) {
        if (!text) return 0;
        const marker = String.fromCharCode(96, 96, 96);
        let searchIdx = 0;
        let filesExtracted = 0;
        while (true) {
            const startMarkerIdx = text.indexOf(marker, searchIdx);
            if (startMarkerIdx === -1) break;
            const newlineIdx = text.indexOf('\n', startMarkerIdx);
            if (newlineIdx === -1) break;
            const header = text.substring(startMarkerIdx + 3, newlineIdx).replace(/\r/g, '').trim();
            const endMarkerIdx = text.indexOf(marker, newlineIdx);
            if (endMarkerIdx === -1) break;
            const content = text.substring(newlineIdx + 1, endMarkerIdx).replace(/\r/g, '').trim();
            const headerParts = header.split(':');
            
            if (headerParts.length >= 3 || headerParts.length === 1) {
                const filename = headerParts[headerParts.length - 1].trim();
                if (filename && filename.length > 0 && !filename.includes(' ')) {
                    this.globalVFS.set(filename, content);
                    filesExtracted++;
                }
            }
            searchIdx = endMarkerIdx + 3;
        }
        return filesExtracted;
    }

    async executeCognitiveLoop(task, visualContext, abortSignal) {
        if (abortSignal?.aborted) throw new DOMException("Aborted", "AbortError");
        
        const statusNodeId = window.Compositor.appendMessage('assistant', '', []);
        window.Compositor.streamToken(statusNodeId, "*Initiating Tri-Buffer Cognitive Graph...*\n");
        const fullState = window.Scribe.getConversationState().filter(m => m.role !== 'system');
        const historicalState = fullState.slice(0, -1); 
        const recentState = historicalState.slice(-this.memoryWindow);
        const { prunedHistory } = this._extractAndPruneHistory(recentState);
        let historyTranscript = prunedHistory.map(m => `[${m.role.toUpperCase()}]:\n${m.content}`).join('\n\n---\n\n');
        
        let activeMaxCtx = 8192;
        if (window.ScribeGateway?.config?.ctx_size) {
            const parsed = parseInt(window.ScribeGateway.config.ctx_size, 10);
            if (!isNaN(parsed) && parsed > 0) activeMaxCtx = parsed;
        } else {
            const ctxDisplay = document.getElementById('val-ctx-display');
            if (ctxDisplay && ctxDisplay.textContent) {
                const parsed = parseInt(ctxDisplay.textContent.replace(/,/g, '').replace(/[^0-9]/g, ''));
                if (!isNaN(parsed) && parsed > 0) activeMaxCtx = parsed;
            }
        }
        const maxHistoryChars = Math.floor(activeMaxCtx * 0.4) * 4;
        if (historyTranscript.length > maxHistoryChars) {
            historyTranscript = "...[HISTORY COMPRESSED TO PRESERVE VRAM]...\n\n" + historyTranscript.slice(-(maxHistoryChars - 50));
        }
        let focalObjective = task;
        if (!focalObjective || String(focalObjective).trim() === '') {
            const pastUserMsgs = prunedHistory.filter(m => m.role === 'user');
            if (pastUserMsgs.length > 0) {
                const lastMsg = pastUserMsgs[pastUserMsgs.length - 1];
                focalObjective = typeof lastMsg.content === 'string' ? lastMsg.content : lastMsg.content.map(c => c.text || '').join(' ');
            } else {
                focalObjective = "Analyze the conversational context and proceed with logical synthesis.";
            }
        }
        let isComplete = false;
        let scriptIteration = 1;
        let finalResponseProse = "";
        let finalCodePayload = "";
        let targetLanguage = "text";
        while (!isComplete && scriptIteration <= 5) {
            const initialMemory = {
                "_user_request": focalObjective,
                "user_request": focalObjective,
                "_recent_chat_history": historyTranscript,
                "recent_chat_history": historyTranscript
            };
            let targetBlueprintPath = 'grammars/cognitive_base.json'; 
            
            try {
                if (scriptIteration === 1) window.Compositor.streamToken(statusNodeId, "> Classifying intent vector...\n");
                const routerVfs = await this._runGraph('grammars/router.json', initialMemory, null, abortSignal, visualContext, focalObjective);
                
                let routeResult = "";
                for (const val of routerVfs.registers.values()) {
                    if (val && typeof val === 'string' && val.includes('target_schema')) {
                        try {
                            let cleanVal = val.trim();
                            const firstBrace = cleanVal.indexOf('{');
                            const lastBrace = cleanVal.lastIndexOf('}');
                            
                            if (firstBrace !== -1 && lastBrace !== -1 && lastBrace >= firstBrace) {
                                cleanVal = cleanVal.substring(firstBrace, lastBrace + 1);
                            }
                            
                            const parsed = JSON.parse(cleanVal);
                            if (parsed.target_schema) routeResult = parsed.target_schema;
                        } catch(e) {}
                    }
                }
                
                if (routeResult && !routeResult.endsWith('.json')) routeResult += '.json';
                const validTopologies = ['cognitive_code.json', 'cognitive_chat.json', 'cognitive_base.json', 'cognitive_rlm.json'];
                if (validTopologies.includes(routeResult)) targetBlueprintPath = `grammars/${routeResult}`;
            } catch (e) {
                if (e.name === 'AbortError') throw e;
                window.Compositor.streamToken(statusNodeId, `> Router offline. Enforcing baseline logic fallback.\n`);
            }
            
            window.Compositor.streamToken(statusNodeId, `> Topology localized: [${targetBlueprintPath}] (Iteration ${scriptIteration})\n\n---\n`);
            
            const finalVfs = await this._runGraph(targetBlueprintPath, initialMemory, statusNodeId, abortSignal, visualContext, focalObjective);
            if (!finalVfs) {
                window.Compositor.finalizeMessage(statusNodeId);
                return null;
            }
            finalResponseProse = finalVfs.get("message_to_user") || finalVfs.get("_message_to_user") || "";
            let optimalCode = finalVfs.get("optimal_code") || finalVfs.get("_full_code_output") || "";
            targetLanguage = finalVfs.get("code_language") || finalVfs.get("_code_language") || "text";
            
            let deliveryStatus = "COMPLETE";
            if (optimalCode) {
                const filesCount = this._extractFilesToBufferB(optimalCode);
                if (filesCount > 0) {
                    window.Compositor.streamToken(statusNodeId, `\n>[SYSTEM: Synchronized ${filesCount} artifacts to Memory State]\n`);
                }
                if (optimalCode.includes("PARTIAL_AWAITING_NEXT_SCRIPT")) {
                    deliveryStatus = "PARTIAL";
                }
                finalCodePayload = optimalCode;
            }
            if (deliveryStatus === "PARTIAL") {
                scriptIteration++;
                focalObjective = `[SYSTEM: Script iteration ${scriptIteration-1} successfully sealed in VFS. Buffer B updated. Proceed with the next partial sequence for the original objective.]\n\nOriginal Objective:\n${task}`;
                window.Compositor.streamToken(statusNodeId, `\n\n> Dispatcher Intercept: Code sequence exceeds token horizon. Initiating autonomous cycle...\n\n`);
            } else {
                isComplete = true;
                window.Compositor.streamToken(statusNodeId, `\n\nGraph Resolved.\n`);
            }
        }
        let rawOutput = finalResponseProse;
        if (finalCodePayload && finalCodePayload.trim().length > 0) {
            if (finalCodePayload.includes('"target_schema"') && finalCodePayload.includes('{')) {
                rawOutput += "\n\n[System Interface Notice: Graph execution successful, but structural artifact was corrupted.]";
            } else {
                rawOutput += (rawOutput ? "\n\n" : "") + `<artifact identifier="compiled_artifact.${targetLanguage}" language="${targetLanguage}">\n${finalCodePayload.trim()}\n</artifact>`;
            }
        }
        if (!rawOutput) rawOutput = "Task synthesized.";
        window.Compositor.streamToken(statusNodeId, `\n\n${rawOutput}`);
        window.Compositor.finalizeMessage(statusNodeId);
        return { prose: rawOutput.trim(), codePayload: null, codeLanguage: 'text' };
    }

    async _runGraph(blueprintPath, initialMemory, statusNodeId, abortSignal, visualContext = [], focalAnchor = "") {
        const blueprint = await this.fetchBlueprint(blueprintPath, abortSignal);
        const vfs = new VectorizedVirtualFileSystem(blueprint._memory_struct);
        
        for (const [k, v] of Object.entries(initialMemory)) {
            if (blueprint._memory_struct.includes(k)) vfs.write(k, v);
        }
        let currentNodeId = blueprint._start_node;
        let cycles = 0;
        const maxCycles = blueprint._max_cycles || 10;
        while (currentNodeId && currentNodeId !== "EXIT_SUCCESS" && cycles < maxCycles) {
            if (abortSignal?.aborted) throw new DOMException("Aborted", "AbortError");
            
            cycles++;
            const node = blueprint._nodes[currentNodeId];
            
            if (!node) {
                if (statusNodeId) window.Compositor.streamToken(statusNodeId, `\n\n**[Path Error]:** Dead node: ${currentNodeId}. Halting.\n`);
                break;
            }
            if (statusNodeId) window.Compositor.streamToken(statusNodeId, `> Executing DAG Node: \`${currentNodeId}\`\n`);
            let vfsStateXml = "<vfs_state>\n";
            if (this.globalVFS.size > 0) {
                for (let [filename, content] of this.globalVFS.entries()) {
                    vfsStateXml += `<file name="${filename}">\n${content}\n</file>\n`;
                }
            } else {
                vfsStateXml += "\n";
            }
            vfsStateXml += "</vfs_state>";
            const memoryData = vfs.read(node._read_memory);
            
            const template = "<context>\n{{BUFFER_A}}\n\n{{BUFFER_B}}\n</context>\n\n<directive>\n{{BUFFER_C}}\n</directive>";
            
            const userContentStr = template
                .replace('{{BUFFER_A}}', memoryData)
                .replace('{{BUFFER_B}}', vfsStateXml)
                .replace('{{BUFFER_C}}', (node._task_instruction || "") + (focalAnchor ? `\n\n[Active Objective]:\n${focalAnchor}` : ""))
                .trim();
            const messages = [];
            if (blueprint._system_root_instruction && blueprint._system_root_instruction.trim() !== "") {
                messages.push({ role: "system", content: blueprint._system_root_instruction.trim() });
            }
            let finalUserContent = userContentStr || "Proceed.";
            if (visualContext && visualContext.length > 0) {
                const payloadArray = [{ type: "text", text: finalUserContent }];
                visualContext.forEach(b64 => {
                    payloadArray.push({ type: "image_url", image_url: { url: b64 } });
                });
                finalUserContent = payloadArray;
            }
            messages.push({ role: "user", content: finalUserContent });
            const projectedMaxTokens = node._inference_parameters?.max_tokens ?? 3072;
            const horizon = await ContextMatrix.enforceContextBounds(messages, projectedMaxTokens, statusNodeId, abortSignal);
            
            if (!horizon.isSafe) {
                if (statusNodeId) window.Compositor.streamToken(statusNodeId, `\n\n**[VRAM Fault]:** Graph trajectory exceeds physical context horizon (${horizon.currentCount}/${horizon.activeMaxCtx}). Emergency halt.\n`);
                break;
            }
            try {
                const completeResponse = await this.dispatcher.dispatch(node, horizon.safeMessages, vfs, statusNodeId, abortSignal);
                
                if (statusNodeId && node._mode === "mcts" && !node._json_schema && !node._grammar_rule) {
                    window.Compositor.streamToken(statusNodeId, `\n<details class="scribe-thought-block"><summary class="thought-header">DAG Telemetry: ${currentNodeId}</summary><div class="thought-content">Latent Artifact Synthesized and stored in Virtual File System.</div></details>\n`);
                }
                if (node._write_memory) vfs.write(node._write_memory, completeResponse, node._write_mode || "overwrite");
                currentNodeId = DAGLogicEvaluator.evaluateNextStep(completeResponse, node._next_step_logic);
            } catch (e) {
                if (e.name === 'AbortError') throw e;
                if (statusNodeId) window.Compositor.streamToken(statusNodeId, `\n\n**[System Fault]:** Inference interrupted. ${e.message}\n`);
                break;
            }
        }
        if (cycles >= maxCycles && currentNodeId !== "EXIT_SUCCESS" && statusNodeId) {
            window.Compositor.streamToken(statusNodeId, `\n\n*Warning: Recursive iteration bound (${maxCycles}) exceeded.*\n`);
        }
        return vfs;
    }
}

window.NeuralEngine = new NeuralEngine();
