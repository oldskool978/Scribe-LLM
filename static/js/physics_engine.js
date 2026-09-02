class ScribePhysicsEngine {
    constructor() {
        this.CONTEXT_BOUNDS = [512, 1024, 2048, 4096, 8192, 16384, 32768, 65536, 131072, 262144, 524288, 1048576];
        this.PHYSICS_PROFILES = {
            analytical: { temp: 0.10, minp: 0.10, topk: 0, reppen: 1.00 },
            balanced:   { temp: 0.60, minp: 0.05, topk: 0, reppen: 1.05 },
            creative:   { temp: 1.15, minp: 0.02, topk: 0, reppen: 1.10 },
            legacy:     { temp: 0.80, minp: 0.00, topk: 40, reppen: 1.10 }
        };
    }

    getProfile(presetName) {
        return this.PHYSICS_PROFILES[presetName] || this.PHYSICS_PROFILES.balanced;
    }

    resolveDefaultContextIndex(nativeCtx) {
        let defaultIdx = this.CONTEXT_BOUNDS.findIndex(v => v >= nativeCtx);
        if (defaultIdx === -1) defaultIdx = this.CONTEXT_BOUNDS.length - 1;
        return defaultIdx;
    }

    getMaxSafeContextIndex(isCognitive) {
        const telemetry = window.Scribe?.state?.hardwareTelemetry;
        const modelSelector = document.getElementById('model-selector');
        const selectedModelName = modelSelector?.value;
        const modelObj = window.Scribe?.state?.availableModels?.find(m => m.name === selectedModelName);
        
        if (!telemetry || !modelObj) {
            return this.CONTEXT_BOUNDS.length - 1;
        }

        for (let i = this.CONTEXT_BOUNDS.length - 1; i >= 0; i--) {
            const matrix = this._calculateMatrixInternal(telemetry, modelObj, {
                requestedCtxIdx: i,
                isCognitive: isCognitive,
                kvQuant: "auto",
                useFA: true
            });
            if (matrix && matrix.projectedRamRequiredMB <= (telemetry.ram_free || 0) * 0.95) {
                return i;
            }
        }
        return 0;
    }

    calculateHardwareMatrix(telemetry, modelObj, config) {
        return this._calculateMatrixInternal(telemetry, modelObj, config);
    }

    _calculateMatrixInternal(telemetry, modelObj, config) {
        if (!telemetry || !modelObj) return null;

        const vramTotalMB = telemetry.vram_total || 0;
        const vramFreeMB = telemetry.vram_free || 0;
        const ramTotalMB = telemetry.ram_total || 0;
        const ramFreeMB = telemetry.ram_free || 0;

        if (vramFreeMB <= 0 && ramFreeMB <= 0) return null;

        const modelNativeCtx = modelObj.native_ctx || 8192;
        const maxLayers = modelObj.max_layers || 32;
        const modelSizeMB = modelObj.size_mb || 4000;
        
        const osOverhead = Math.max(500, vramTotalMB * 0.08);
        const nonLayerWeightsMB = modelSizeMB * 0.08; 
        const exactMBPerLayer = (modelSizeMB - nonLayerWeightsMB) / maxLayers;

        const embedDim = modelObj.embed_dim || 4096;
        const headCount = modelObj.head_count || 32;
        const headCountKV = modelObj.head_count_kv || 8;
        
        const dHead = embedDim / headCount;
        const bytesPerToken = 4 * headCountKV * dHead * maxLayers; 
        const kvCachePer1kMB = (bytesPerToken * 1024) / 1048576;

        const parallelSlots = config.isCognitive ? 6 : 1;
        const activeKvQuant = config.kvQuant || "auto";
        const useFA = config.useFA !== undefined ? config.useFA : true;
        const transientShiftBufferMB = 256;

        let contextCandidates = [];
        if (config.requestedCtxIdx === "auto" || config.requestedCtxIdx === undefined || config.requestedCtxIdx === null) {
            contextCandidates = [...this.CONTEXT_BOUNDS].filter(v => v <= Math.max(131072, modelNativeCtx));
            if (contextCandidates.length === 0) contextCandidates = [8192];
        } else {
            contextCandidates = [this.CONTEXT_BOUNDS[config.requestedCtxIdx] || 8192];
        }

        let bestContextSize = contextCandidates[0] || 8192;
        let bestLayers = 0;
        let bestSlots = parallelSlots;
        let bestQuant = activeKvQuant === "auto" ? "auto" : activeKvQuant;
        let bestKvCacheMB = 0;
        let bestActivationMB = 0;
        let bestSafeAvailableVRAM = 0;
        let bestRamRequiredMB = 0;
        let internalFoundValidMatch = false;

        for (const ctx of contextCandidates) {
            const quantCandidates = activeKvQuant === "auto" ? ["auto", "q8_0", "q4_0"] : [activeKvQuant];
            const slotCandidates = [];
            for (let s = parallelSlots; s >= 1; s--) { slotCandidates.push(s); }

            for (const q of quantCandidates) {
                for (const s of slotCandidates) {
                    let qScalar = 1.0;
                    if (q.includes("8")) qScalar = 0.5;
                    if (q.includes("4")) qScalar = 0.25;

                    let candidateKvCacheMB = (ctx / 1024) * s * kvCachePer1kMB * qScalar;
                    let candidateActivationBytes = useFA ? (ctx * embedDim * 2 * 4) : ((ctx * 2 * embedDim) + (ctx * ctx * 2 * headCount));
                    let candidateActivationTotalMB = (candidateActivationBytes / 1048576) * s;

                    let fixedVramOverhead = osOverhead + nonLayerWeightsMB + candidateKvCacheMB + candidateActivationTotalMB + transientShiftBufferMB;
                    let vramAvailableForLayers = Math.max(0, vramFreeMB - fixedVramOverhead);
                    
                    let candidateLayers = Math.floor(vramAvailableForLayers / exactMBPerLayer);
                    candidateLayers = Math.min(maxLayers, Math.max(0, candidateLayers));

                    let remainingLayers = maxLayers - candidateLayers;
                    let ramRequiredForCpuWeights = remainingLayers * exactMBPerLayer;
                    let vramOverflowOnRam = fixedVramOverhead > vramFreeMB ? (fixedVramOverhead - vramFreeMB) : 0;
                    let totalRamRequiredMB = ramRequiredForCpuWeights + vramOverflowOnRam;

                    if (ramFreeMB > 0 && totalRamRequiredMB > ramFreeMB * 0.95) {
                        continue; 
                    }

                    let replaceBest = false;
                    if (!internalFoundValidMatch) {
                        replaceBest = true;
                        internalFoundValidMatch = true;
                    } else if (ctx > bestContextSize) {
                        replaceBest = true;
                    } else if (ctx === bestContextSize) {
                        if (candidateLayers > bestLayers) {
                            replaceBest = true;
                        } else if (candidateLayers === bestLayers) {
                            if (s > bestSlots) {
                                replaceBest = true;
                            } else if (s === bestSlots) {
                                const qRank = { "auto": 3, "q8_0": 2, "q4_0": 1 };
                                if ((qRank[q] || 0) > (qRank[bestQuant] || 0)) {
                                    replaceBest = true;
                                }
                            }
                        }
                    }

                    if (replaceBest) {
                        bestContextSize = ctx;
                        bestLayers = candidateLayers;
                        bestSlots = s;
                        bestQuant = q;
                        bestKvCacheMB = candidateKvCacheMB;
                        bestActivationMB = candidateActivationTotalMB;
                        bestSafeAvailableVRAM = vramAvailableForLayers;
                        bestRamRequiredMB = totalRamRequiredMB;
                    }
                }
            }
        }

        return {
            optimalLayers: bestLayers,
            maxLayers: maxLayers,
            projectedKvCacheMB: bestKvCacheMB,
            projectedActivationMB: bestActivationMB,
            projectedSafeVramMB: bestSafeAvailableVRAM,
            projectedRamRequiredMB: bestRamRequiredMB,
            isVramConstrained: bestLayers < maxLayers,
            isRamConstrained: ramFreeMB > 0 && bestRamRequiredMB > ramFreeMB * 0.80,
            recommendedSlots: bestSlots,
            recommendedKvQuant: bestQuant,
            adjustedContextSize: bestContextSize 
        };
    }
}

window.ScribePhysics = new ScribePhysicsEngine();
