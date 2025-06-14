import { LayerGraph } from './layer-graph.js';

/**
 * Peeling Engine - Core autoregressive layer removal implementation
 */
export class PeelingEngine {
    constructor(svgParser) {
        this.svgParser = svgParser;
        this.layerGraph = new LayerGraph(svgParser.getElements());
        this.peelingHistory = [];
        this.currentStep = 0;
        this.removedElements = new Set();
        this.contentRecovery = new ContentRecoveryEngine();
    }

    /**
     * Perform complete autoregressive peeling process
     */
    async performAutoregressivePeeling(options = {}) {
        const {
            maxSteps = 50,
            stopAtBasicShapes = true,
            preserveSemanticGroups = true,
            contentRecovery = true
        } = options;

        const results = [];
        let step = 0;

        while (step < maxSteps) {
            const peelingResult = await this.performSinglePeelingStep({
                contentRecovery,
                preserveSemanticGroups
            });

            if (!peelingResult || peelingResult.removedElements.length === 0) {
                console.log('No more elements to remove - peeling complete');
                break;
            }

            results.push(peelingResult);
            step++;

            // Check if we should stop at basic shapes
            if (stopAtBasicShapes && this.hasReachedBasicShapes()) {
                console.log('Reached basic geometric shapes - stopping peeling');
                break;
            }
        }

        return {
            steps: results,
            finalSVG: this.svgParser.toSVG(),
            statistics: this.generatePeelingStatistics(),
            layerAnalysis: this.layerGraph.getAnalysisReport()
        };
    }

    /**
     * Perform a single step of layer peeling
     */
    async performSinglePeelingStep(options = {}) {
        const { contentRecovery = true, preserveSemanticGroups = true } = options;

        // Get topmost elements for removal
        const candidates = this.identifyRemovalCandidates(preserveSemanticGroups);
        if (candidates.length === 0) {
            return null;
        }

        // Select best candidate(s) for removal
        const toRemove = this.selectOptimalRemovalSet(candidates);
        
        // Perform content recovery before removal
        const recoveryData = contentRecovery ? 
            await this.contentRecovery.analyzeAndRecover(toRemove, this.layerGraph) : 
            null;

        // Remove the selected elements
        const removedElements = this.removeElements(toRemove);

        // Update layer graph
        removedElements.forEach(element => {
            this.layerGraph.removeElement(element.id);
            this.removedElements.add(element.id);
        });

        // Record this step
        const stepResult = {
            step: this.currentStep++,
            removedElements: removedElements,
            remainingElements: this.getRemainingElements(),
            recoveryData: recoveryData,
            svgSnapshot: this.svgParser.toSVG(),
            description: this.generateStepDescription(removedElements)
        };

        this.peelingHistory.push(stepResult);
        return stepResult;
    }

    /**
     * Identify candidates for removal in this step
     */
    identifyRemovalCandidates(preserveSemanticGroups = true) {
        const topmost = this.layerGraph.getTopmostElements();
        const candidates = [];

        if (preserveSemanticGroups) {
            // Group candidates by semantic relationships
            const semanticGroups = this.layerGraph.getSemanticGroups();
            const processedElements = new Set();

            // Check if any semantic groups are completely on top
            semanticGroups.forEach(group => {
                const groupElements = group.elements.filter(e => 
                    !this.removedElements.has(e.id)
                );
                
                if (groupElements.length > 0) {
                    const allTopmost = groupElements.every(element => 
                        topmost.some(top => top.id === element.id)
                    );
                    
                    if (allTopmost) {
                        candidates.push({
                            type: 'semantic-group',
                            elements: groupElements,
                            priority: this.calculateGroupPriority(group),
                            description: `${group.groupType} (${groupElements.length} elements)`
                        });
                        
                        groupElements.forEach(e => processedElements.add(e.id));
                    }
                }
            });

            // Add individual topmost elements not in semantic groups
            topmost.forEach(element => {
                if (!processedElements.has(element.id) && !this.removedElements.has(element.id)) {
                    candidates.push({
                        type: 'individual',
                        elements: [element],
                        priority: this.calculateElementPriority(element),
                        description: `${element.tagName} element`
                    });
                }
            });
        } else {
            // Simple individual element candidates
            topmost.forEach(element => {
                if (!this.removedElements.has(element.id)) {
                    candidates.push({
                        type: 'individual',
                        elements: [element],
                        priority: this.calculateElementPriority(element),
                        description: `${element.tagName} element`
                    });
                }
            });
        }

        return candidates.sort((a, b) => b.priority - a.priority);
    }

    /**
     * Select optimal set of elements to remove in this step
     */
    selectOptimalRemovalSet(candidates) {
        if (candidates.length === 0) return [];

        // For now, select the highest priority candidate
        // Could be enhanced with more sophisticated selection logic
        const selected = candidates[0];
        
        // Validate that all elements in the selection are still removable
        const validElements = selected.elements.filter(element => {
            const occlusionInfo = this.layerGraph.getOcclusionInfo(element.id);
            return occlusionInfo && occlusionInfo.isVisible && 
                   occlusionInfo.occludedBy.filter(id => !this.removedElements.has(id)).length === 0;
        });

        return validElements;
    }

    /**
     * Calculate priority for removing a semantic group
     */
    calculateGroupPriority(group) {
        let priority = 0;
        
        // Prefer larger groups (more cohesive removal)
        priority += group.elements.length * 10;
        
        // Prefer certain group types
        const typeBonus = {
            'text-with-graphics': 50,
            'geometric-pattern': 40,
            'path-cluster': 30,
            'rect-cluster': 25,
            'circle-cluster': 25,
            'mixed-group': 20,
            'single': 10
        };
        priority += typeBonus[group.groupType] || 15;
        
        // Consider spatial compactness
        const area = group.bbox.width * group.bbox.height;
        const density = group.elements.length / Math.max(area, 1);
        priority += Math.min(density * 1000, 30);
        
        return priority;
    }

    /**
     * Calculate priority for removing an individual element
     */
    calculateElementPriority(element) {
        let priority = 0;
        
        // Base priority by element type
        const typeBonus = {
            'text': 60,      // Text often overlays and should be removed first
            'image': 50,     // Images often overlay backgrounds
            'rect': 30,      // Simple shapes
            'circle': 30,
            'ellipse': 30,
            'polygon': 25,
            'path': 20,      // Paths often form the underlying structure
            'line': 15,
            'g': 10          // Groups handled separately
        };
        priority += typeBonus[element.tagName] || 20;
        
        // Prefer smaller elements (details over structure)
        const area = element.bbox.width * element.bbox.height;
        const sizeBonus = Math.max(0, 50 - Math.log10(area + 1) * 10);
        priority += sizeBonus;
        
        // Consider opacity (transparent elements are less important)
        priority += (1 - element.opacity) * 20;
        
        // Consider z-index (higher elements should be removed first)
        priority += Math.min(element.zIndex / 1000, 20);
        
        return priority;
    }

    /**
     * Remove elements from the SVG
     */
    removeElements(elements) {
        const removed = [];
        
        elements.forEach(element => {
            try {
                const domElement = element.element;
                if (domElement && domElement.parentNode) {
                    domElement.parentNode.removeChild(domElement);
                    removed.push(element);
                }
            } catch (error) {
                console.warn(`Failed to remove element ${element.id}:`, error);
            }
        });
        
        return removed;
    }

    /**
     * Get remaining visible elements
     */
    getRemainingElements() {
        return this.svgParser.getElements().filter(element => 
            !this.removedElements.has(element.id)
        );
    }

    /**
     * Check if we've reached basic geometric shapes
     */
    hasReachedBasicShapes() {
        const remaining = this.getRemainingElements();
        
        if (remaining.length === 0) return true;
        
        // Consider it basic shapes if we have <= 5 elements and they're all basic shapes
        const basicShapeTypes = ['rect', 'circle', 'ellipse', 'line', 'polygon'];
        const allBasicShapes = remaining.every(element => 
            basicShapeTypes.includes(element.tagName)
        );
        
        return remaining.length <= 5 && allBasicShapes;
    }

    /**
     * Generate description for a peeling step
     */
    generateStepDescription(removedElements) {
        if (removedElements.length === 0) {
            return 'No elements removed';
        }
        
        if (removedElements.length === 1) {
            const element = removedElements[0];
            return `Removed ${element.tagName} element (${element.fill !== 'none' ? element.fill : 'stroked'})`;
        }
        
        // Group by type for description
        const typeGroups = {};
        removedElements.forEach(element => {
            const type = element.tagName;
            typeGroups[type] = (typeGroups[type] || 0) + 1;
        });
        
        const descriptions = Object.entries(typeGroups).map(([type, count]) => 
            count === 1 ? `1 ${type}` : `${count} ${type}s`
        );
        
        return `Removed ${descriptions.join(', ')}`;
    }

    /**
     * Generate comprehensive peeling statistics
     */
    generatePeelingStatistics() {
        const totalSteps = this.peelingHistory.length;
        const totalRemoved = this.removedElements.size;
        const remaining = this.getRemainingElements().length;
        
        // Analyze removal patterns
        const removalByType = {};
        const removalByStep = this.peelingHistory.map(step => ({
            step: step.step,
            removed: step.removedElements.length,
            description: step.description
        }));
        
        this.peelingHistory.forEach(step => {
            step.removedElements.forEach(element => {
                const type = element.tagName;
                removalByType[type] = (removalByType[type] || 0) + 1;
            });
        });
        
        return {
            totalSteps,
            totalRemoved,
            remainingElements: remaining,
            removalEfficiency: totalRemoved / (totalRemoved + remaining),
            removalByType,
            removalByStep,
            averageElementsPerStep: totalRemoved / Math.max(totalSteps, 1)
        };
    }

    /**
     * Get peeling history
     */
    getPeelingHistory() {
        return [...this.peelingHistory];
    }

    /**
     * Export intermediate states as SVG strings
     */
    exportIntermediateStates() {
        return this.peelingHistory.map(step => ({
            step: step.step,
            description: step.description,
            svg: step.svgSnapshot,
            removedCount: step.removedElements.length,
            remainingCount: step.remainingElements.length
        }));
    }

    /**
     * Reset peeling engine to initial state
     */
    reset() {
        this.currentStep = 0;
        this.removedElements.clear();
        this.peelingHistory = [];
        this.layerGraph = new LayerGraph(this.svgParser.getElements());
    }
}

/**
 * Content Recovery Engine - Handles revealing and completing underlying content
 */
class ContentRecoveryEngine {
    constructor() {
        this.recoveryStrategies = [
            new PathExtensionStrategy(),
            new ShapeCompletionStrategy(),
            new InterpolationStrategy()
        ];
    }

    /**
     * Analyze and recover content that will be revealed by removing elements
     */
    async analyzeAndRecover(elementsToRemove, layerGraph) {
        const recoveryData = {
            revealed: [],
            completed: [],
            interpolated: [],
            strategies: []
        };

        // Find elements that will be revealed
        const revealedElements = this.findRevealedElements(elementsToRemove, layerGraph);
        
        // Apply recovery strategies to revealed elements
        for (const element of revealedElements) {
            for (const strategy of this.recoveryStrategies) {
                if (strategy.canApply(element, elementsToRemove)) {
                    const result = await strategy.apply(element, elementsToRemove, layerGraph);
                    if (result.success) {
                        recoveryData.strategies.push({
                            strategy: strategy.constructor.name,
                            element: element.id,
                            modifications: result.modifications
                        });
                        break; // Apply only first successful strategy per element
                    }
                }
            }
        }

        return recoveryData;
    }

    /**
     * Find elements that will be revealed when removing specified elements
     */
    findRevealedElements(elementsToRemove, layerGraph) {
        const removeIds = new Set(elementsToRemove.map(e => e.id));
        const revealed = [];

        elementsToRemove.forEach(removedElement => {
            const occlusionInfo = layerGraph.getOcclusionInfo(removedElement.id);
            if (occlusionInfo) {
                occlusionInfo.occludes.forEach(occludedId => {
                    const occludedInfo = layerGraph.getOcclusionInfo(occludedId);
                    if (occludedInfo) {
                        // Check if this element will become visible after removal
                        const remainingOccluders = occludedInfo.occludedBy.filter(id => 
                            !removeIds.has(id)
                        );
                        
                        if (remainingOccluders.length === 0) {
                            revealed.push(occludedInfo.element);
                        }
                    }
                });
            }
        });

        return revealed;
    }
}

/**
 * Path Extension Strategy - Extends partial paths that were cut off by occluding elements
 */
class PathExtensionStrategy {
    canApply(element, occluders) {
        return element.tagName === 'path' && element.pathData;
    }

    async apply(element, occluders, layerGraph) {
        // Simple path extension logic - could be enhanced significantly
        return {
            success: false,
            modifications: []
        };
    }
}

/**
 * Shape Completion Strategy - Completes shapes that were partially hidden
 */
class ShapeCompletionStrategy {
    canApply(element, occluders) {
        const completableShapes = ['rect', 'circle', 'ellipse', 'polygon'];
        return completableShapes.includes(element.tagName);
    }

    async apply(element, occluders, layerGraph) {
        // Simple shape completion logic - could be enhanced
        return {
            success: false,
            modifications: []
        };
    }
}

/**
 * Interpolation Strategy - Interpolates missing parts based on surrounding context
 */
class InterpolationStrategy {
    canApply(element, occluders) {
        return true; // Can attempt interpolation on any element
    }

    async apply(element, occluders, layerGraph) {
        // Placeholder for interpolation logic
        return {
            success: false,
            modifications: []
        };
    }
}
