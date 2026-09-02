class ScribeGateway {
    constructor() {
        this.baseHeaders = { 'Content-Type': 'application/json' };
        this.activeConnections = 0;
        this.maxConnections = 5;
        this.requestQueue = [];
    }

    async _managedFetch(endpoint, config, isPriority = false) {
        if (isPriority) {
            return fetch(endpoint, config);
        }

        if (config.signal && config.signal.aborted) {
            throw new DOMException("Aborted", "AbortError");
        }

        if (this.activeConnections < this.maxConnections) {
            return this._executeFetch(endpoint, config);
        }

        return new Promise((resolve, reject) => {
            const queueItem = { endpoint, config, resolve, reject, abortHandler: null };
            
            if (config.signal) {
                const abortHandler = () => {
                    const idx = this.requestQueue.indexOf(queueItem);
                    if (idx !== -1) {
                        this.requestQueue.splice(idx, 1);
                    }
                    config.signal.removeEventListener('abort', abortHandler);
                    reject(new DOMException("Aborted", "AbortError"));
                };
                config.signal.addEventListener('abort', abortHandler);
                queueItem.abortHandler = abortHandler;
            }
            
            this.requestQueue.push(queueItem);
        });
    }

    async _executeFetch(endpoint, config) {
        this.activeConnections++;
        try {
            if (config.signal && config.signal.aborted) {
                throw new DOMException("Aborted", "AbortError");
            }
            return await fetch(endpoint, config);
        } finally {
            this.activeConnections--;
            this._processQueue();
        }
    }

    _processQueue() {
        while (this.requestQueue.length > 0 && this.activeConnections < this.maxConnections) {
            const nextRequest = this.requestQueue.shift();
            
            if (nextRequest.config.signal) {
                nextRequest.config.signal.removeEventListener('abort', nextRequest.abortHandler);
                if (nextRequest.config.signal.aborted) {
                    nextRequest.reject(new DOMException("Aborted", "AbortError"));
                    continue;
                }
            }

            this._executeFetch(nextRequest.endpoint, nextRequest.config)
                .then(nextRequest.resolve)
                .catch(nextRequest.reject);
        }
    }

    async _dispatch(endpoint, payload = null, options = {}, isPriority = false) {
        const config = {
            method: payload ? 'POST' : 'GET',
            headers: payload ? this.baseHeaders : {},
            ...options
        };
        if (payload) config.body = JSON.stringify(payload);

        const response = await this._managedFetch(endpoint, config, isPriority);
        
        if (!response.ok) {
            let errorMsg = `Gateway Fault: HTTP ${response.status}`;
            try {
                const errData = await response.json();
                errorMsg = errData.error || errorMsg;
            } catch (e) {}
            throw new Error(errorMsg);
        }
        return response;
    }

    async fetchSystemTelemetry() {
        const res = await this._dispatch('/api/system', null, {}, true);
        return await res.json();
    }

    async fetchStatus() {
        const res = await this._dispatch('/api/status', null, {}, true);
        return await res.json();
    }

    async fetchSlots() {
        const res = await this._dispatch('/api/slots', null, {}, true);
        return await res.json();
    }

    async bootEngine(config) {
        const res = await this._dispatch('/api/engine/boot', config, {}, true);
        return await res.json();
    }

    async haltEngine() {
        const res = await this._dispatch('/api/engine/stop', {}, {}, true);
        return await res.json();
    }

    async tokenize(content) {
        const res = await this._dispatch('/api/tokenize', { content }, {}, true);
        return await res.json();
    }

    async detokenize(tokens) {
        const res = await this._dispatch('/api/detokenize', { tokens }, {}, true);
        return await res.json();
    }

    async executeInfill(payload, signal = null) {
        return await this._dispatch('/api/infill', payload, signal ? { signal } : {});
    }

    async streamChat(payload, onToken, signal = null) {
        const config = {
            method: 'POST',
            headers: this.baseHeaders,
            body: JSON.stringify(payload)
        };
        if (signal) config.signal = signal;

        const response = await this._managedFetch('/api/chat', config);
        
        if (!response.ok) {
            let errorMsg = `Gateway Protocol ${response.status}`;
            try {
                const errData = await response.json();
                errorMsg = errData.error || errorMsg;
            } catch (e) {}
            throw new Error(errorMsg);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';
        let completeResponse = '';
        let inReasoningBlock = false;
        let finalFinishReason = 'stop'; 

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) {
                    if (buffer.trim()) {
                        const line = buffer.trim();
                        if (line.startsWith('data: ')) {
                            const dataStr = line.substring(6).trim();
                            if (dataStr !== '[DONE]' && dataStr) {
                                try {
                                    const data = JSON.parse(dataStr);
                                    const choice = data.choices?.[0] || {};
                                    const delta = choice.delta || {};
                                    if (choice.finish_reason) finalFinishReason = choice.finish_reason;
                                    
                                    let token = '';
                                    if (delta.reasoning_content) {
                                        if (!inReasoningBlock) {
                                            inReasoningBlock = true;
                                            token += '<think>\n';
                                        }
                                        token += delta.reasoning_content;
                                    } else if (delta.content !== undefined && delta.content !== null) {
                                        if (inReasoningBlock) {
                                            inReasoningBlock = false;
                                            token += '\n</think>\n';
                                        }
                                        token += delta.content;
                                    }
                                    if (token) {
                                        completeResponse += token;
                                        onToken(token);
                                    }
                                } catch (e) {}
                            }
                        }
                    }
                    if (inReasoningBlock) {
                        inReasoningBlock = false;
                        const closingTag = '\n</think>\n';
                        completeResponse += closingTag;
                        onToken(closingTag);
                    }
                    break;
                }

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop(); 

                for (const line of lines) {
                    const trimmed = line.trim();
                    if (trimmed.startsWith('data: ')) {
                        const dataStr = trimmed.substring(6).trim();
                        if (dataStr === '[DONE]') continue;
                        if (!dataStr) continue;

                        try {
                            const data = JSON.parse(dataStr);
                            const choice = data.choices[0] || {};
                            const delta = choice.delta || {};
                            
                            if (choice.finish_reason) {
                                finalFinishReason = choice.finish_reason;
                            }

                            let token = '';
                            if (delta.reasoning_content) {
                                if (!inReasoningBlock) {
                                    inReasoningBlock = true;
                                    token += '<think>\n';
                                }
                                token += delta.reasoning_content;
                            } else if (delta.content !== undefined && delta.content !== null) {
                                if (inReasoningBlock) {
                                    inReasoningBlock = false;
                                    token += '\n</think>\n';
                                }
                                token += delta.content;
                            }

                            if (token) {
                                completeResponse += token;
                                onToken(token);
                            }
                        } catch (e) {}
                    }
                }
            }
        } catch (err) {
            if (inReasoningBlock) {
                inReasoningBlock = false;
                const closingTag = '\n</think>\n';
                completeResponse += closingTag;
                onToken(closingTag);
            }
            throw err;
        } finally {
            reader.releaseLock();
        }

        return {
            content: completeResponse,
            finish_reason: finalFinishReason
        };
    }
}

window.ScribeGateway = new ScribeGateway();
