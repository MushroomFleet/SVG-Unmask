/**
 * Layer Graph - Analyzes occlusion relationships and semantic groupings
 */
export class LayerGraph {
    constructor(elements) {
        this.elements = elements;
        this.occlusionMap = new Map();
        this.semanticGroups = new Map();
        this.topologicalOrder = [];
        
        this.buildOcclusionRelationships();
        this.performSemanticGrouping();
        this.calculateTopologicalOrder();
    }

    /**
     * Build occlusion relationships between elements
     */
    buildOcclusionRelationships() {
        // Clear existing relationships
        this.occlusionMap.clear();
        
        for (let i = 0; i < this.elements.length; i++) {
            const elementA = this.elements[i];
            this.occlusionMap.set(elementA.id, {
                element: elementA,
                occludedBy: [], // Elements that are on top of this element
                occludes: [], // Elements that this element occludes
                intersections: [], // All intersecting elements regardless of z-order
                isVisible: true,
                layerDepth: 0
            });
        }

        // Compare each pair of elements
        for (let i = 0; i < this.elements.length; i++) {
            for (let j = i + 1; j < this.elements.length; j++) {
                const elementA = this.elements[i];
                const elementB = this.elements[j];
                
                const intersection = this.calculateIntersection(elementA.bbox, elementB.bbox);
                if (intersection.area > 0) {
                    const relationshipA = this.occlusionMap.get(elementA.id);
                    const relationshipB = this.occlusionMap.get(elementB.id);
                    
                    // Add to intersections list
                    relationshipA.intersections.push(elementB.id);
                    relationshipB.intersections.push(elementA.id);
                    
                    // Determine occlusion based on z-index
                    if (elementA.zIndex < elementB.zIndex) {
                        // B is on top of A
                        relationshipA.occludedBy.push(elementB.id);
                        relationshipB.occludes.push(elementA.id);
                    } else {
                        // A is on top of B
                        relationshipB.occludedBy.push(elementA.id);
                        relationshipA.occludes.push(elementB.id);
                    }
                }
            }
        }

        // Calculate layer depth for each element
        this.calculateLayerDepths();
    }

    /**
     * Calculate intersection area between two bounding boxes
     */
    calculateIntersection(bboxA, bboxB) {
        const left = Math.max(bboxA.x, bboxB.x);
        const right = Math.min(bboxA.x + bboxA.width, bboxB.x + bboxB.width);
        const top = Math.max(bboxA.y, bboxB.y);
        const bottom = Math.min(bboxA.y + bboxA.height, bboxB.y + bboxB.height);
        
        if (left < right && top < bottom) {
            const width = right - left;
            const height = bottom - top;
            return {
                x: left,
                y: top,
                width: width,
                height: height,
                area: width * height,
                overlapRatio: (width * height) / Math.min(
                    bboxA.width * bboxA.height,
                    bboxB.width * bboxB.height
                )
            };
        }
        
        return { area: 0, overlapRatio: 0 };
    }

    /**
     * Calculate layer depth (how many elements are on top)
     */
    calculateLayerDepths() {
        this.occlusionMap.forEach((relationship, elementId) => {
            relationship.layerDepth = relationship.occludedBy.length;
        });
    }

    /**
     * Perform semantic grouping of related elements
     */
    performSemanticGrouping() {
        this.semanticGroups.clear();
        const processed = new Set();
        let groupId = 0;

        this.elements.forEach(element => {
            if (processed.has(element.id)) return;

            const group = this.findSemanticGroup(element, processed);
            if (group.length > 0) {
                this.semanticGroups.set(`group-${groupId++}`, {
                    id: `group-${groupId - 1}`,
                    elements: group,
                    bbox: this.calculateGroupBoundingBox(group),
                    dominantColor: this.findDominantColor(group),
                    groupType: this.classifyGroupType(group)
                });
            }
        });
    }

    /**
     * Find semantically related elements starting from a seed element
     */
    findSemanticGroup(seedElement, processed) {
        const group = [];
        const queue = [seedElement];
        const visited = new Set();

        while (queue.length > 0) {
            const current = queue.shift();
            if (visited.has(current.id) || processed.has(current.id)) continue;

            visited.add(current.id);
            group.push(current);
            processed.add(current.id);

            // Find related elements based on various criteria
            const related = this.findRelatedElements(current);
            related.forEach(relatedElement => {
                if (!visited.has(relatedElement.id) && !processed.has(relatedElement.id)) {
                    queue.push(relatedElement);
                }
            });
        }

        return group;
    }

    /**
     * Find elements related to the current element
     */
    findRelatedElements(element) {
        const related = [];
        const threshold = {
            proximity: 50, // pixels
            colorSimilarity: 0.8,
            sizeSimilarity: 0.7
        };

        this.elements.forEach(other => {
            if (other.id === element.id) return;

            const relationship = this.analyzeElementRelationship(element, other);
            
            // Group by proximity
            if (relationship.distance < threshold.proximity) {
                related.push(other);
                return;
            }

            // Group by color similarity
            if (relationship.colorSimilarity > threshold.colorSimilarity) {
                related.push(other);
                return;
            }

            // Group if they have parent-child relationships
            if (element.parent === other.element || other.parent === element.element) {
                related.push(other);
                return;
            }

            // Group if they're part of the same SVG group
            if (element.parent && other.parent && element.parent === other.parent) {
                related.push(other);
                return;
            }
        });

        return related;
    }

    /**
     * Analyze relationship between two elements
     */
    analyzeElementRelationship(elementA, elementB) {
        // Calculate distance between centers
        const centerA = {
            x: elementA.bbox.x + elementA.bbox.width / 2,
            y: elementA.bbox.y + elementA.bbox.height / 2
        };
        const centerB = {
            x: elementB.bbox.x + elementB.bbox.width / 2,
            y: elementB.bbox.y + elementB.bbox.height / 2
        };
        
        const distance = Math.sqrt(
            Math.pow(centerB.x - centerA.x, 2) + 
            Math.pow(centerB.y - centerA.y, 2)
        );

        // Calculate color similarity
        const colorSimilarity = this.calculateColorSimilarity(
            elementA.fill, elementB.fill
        );

        // Calculate size similarity
        const areaA = elementA.bbox.width * elementA.bbox.height;
        const areaB = elementB.bbox.width * elementB.bbox.height;
        const sizeSimilarity = Math.min(areaA, areaB) / Math.max(areaA, areaB);

        return {
            distance,
            colorSimilarity,
            sizeSimilarity,
            sameType: elementA.tagName === elementB.tagName
        };
    }

    /**
     * Calculate color similarity between two colors
     */
    calculateColorSimilarity(colorA, colorB) {
        if (colorA === colorB) return 1;
        if (colorA === 'none' || colorB === 'none') return 0;
        
        // Simple color similarity - could be enhanced with proper color space conversion
        const rgbA = this.parseColor(colorA);
        const rgbB = this.parseColor(colorB);
        
        if (!rgbA || !rgbB) return 0;
        
        const distance = Math.sqrt(
            Math.pow(rgbA.r - rgbB.r, 2) +
            Math.pow(rgbA.g - rgbB.g, 2) +
            Math.pow(rgbA.b - rgbB.b, 2)
        );
        
        return Math.max(0, 1 - distance / (255 * Math.sqrt(3)));
    }

    /**
     * Parse color string to RGB values
     */
    parseColor(color) {
        if (!color || color === 'none') return null;
        
        // Handle hex colors
        if (color.startsWith('#')) {
            const hex = color.slice(1);
            if (hex.length === 3) {
                return {
                    r: parseInt(hex[0] + hex[0], 16),
                    g: parseInt(hex[1] + hex[1], 16),
                    b: parseInt(hex[2] + hex[2], 16)
                };
            } else if (hex.length === 6) {
                return {
                    r: parseInt(hex.slice(0, 2), 16),
                    g: parseInt(hex.slice(2, 4), 16),
                    b: parseInt(hex.slice(4, 6), 16)
                };
            }
        }
        
        // Handle rgb() colors
        const rgbMatch = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
        if (rgbMatch) {
            return {
                r: parseInt(rgbMatch[1]),
                g: parseInt(rgbMatch[2]),
                b: parseInt(rgbMatch[3])
            };
        }
        
        // Handle named colors (simplified)
        const namedColors = {
            'red': { r: 255, g: 0, b: 0 },
            'green': { r: 0, g: 255, b: 0 },
            'blue': { r: 0, g: 0, b: 255 },
            'black': { r: 0, g: 0, b: 0 },
            'white': { r: 255, g: 255, b: 255 }
        };
        
        return namedColors[color.toLowerCase()] || null;
    }

    /**
     * Calculate bounding box for a group of elements
     */
    calculateGroupBoundingBox(elements) {
        if (elements.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
        
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        
        elements.forEach(element => {
            minX = Math.min(minX, element.bbox.x);
            minY = Math.min(minY, element.bbox.y);
            maxX = Math.max(maxX, element.bbox.x + element.bbox.width);
            maxY = Math.max(maxY, element.bbox.y + element.bbox.height);
        });
        
        return {
            x: minX,
            y: minY,
            width: maxX - minX,
            height: maxY - minY
        };
    }

    /**
     * Find dominant color in a group
     */
    findDominantColor(elements) {
        const colorCounts = new Map();
        
        elements.forEach(element => {
            const color = element.fill !== 'none' ? element.fill : element.stroke;
            if (color && color !== 'none') {
                colorCounts.set(color, (colorCounts.get(color) || 0) + 1);
            }
        });
        
        let dominantColor = 'none';
        let maxCount = 0;
        
        colorCounts.forEach((count, color) => {
            if (count > maxCount) {
                maxCount = count;
                dominantColor = color;
            }
        });
        
        return dominantColor;
    }

    /**
     * Classify the type of a semantic group
     */
    classifyGroupType(elements) {
        if (elements.length === 1) return 'single';
        
        const shapes = elements.map(e => e.tagName);
        const uniqueShapes = [...new Set(shapes)];
        
        if (uniqueShapes.length === 1) {
            return `${uniqueShapes[0]}-cluster`;
        }
        
        if (shapes.includes('text')) {
            return 'text-with-graphics';
        }
        
        if (shapes.every(s => ['rect', 'circle', 'ellipse'].includes(s))) {
            return 'geometric-pattern';
        }
        
        return 'mixed-group';
    }

    /**
     * Calculate topological order for layer removal
     */
    calculateTopologicalOrder() {
        const visited = new Set();
        const visiting = new Set();
        const result = [];
        
        const visit = (elementId) => {
            if (visiting.has(elementId)) {
                throw new Error('Circular dependency detected in layer graph');
            }
            if (visited.has(elementId)) return;
            
            visiting.add(elementId);
            
            const relationship = this.occlusionMap.get(elementId);
            if (relationship) {
                // Visit all elements that this element occludes (dependencies)
                relationship.occludes.forEach(occludedId => {
                    visit(occludedId);
                });
            }
            
            visiting.delete(elementId);
            visited.add(elementId);
            result.push(elementId);
        };
        
        // Visit all elements
        this.elements.forEach(element => {
            if (!visited.has(element.id)) {
                visit(element.id);
            }
        });
        
        this.topologicalOrder = result.reverse(); // Reverse to get top-to-bottom order
    }

    /**
     * Get elements in topological order (topmost first)
     */
    getTopologicalOrder() {
        return [...this.topologicalOrder];
    }

    /**
     * Get topmost visible elements (candidates for removal)
     */
    getTopmostElements() {
        const topmost = [];
        
        this.occlusionMap.forEach((relationship, elementId) => {
            if (relationship.isVisible && relationship.occludedBy.length === 0) {
                topmost.push(relationship.element);
            }
        });
        
        // Sort by z-index descending
        return topmost.sort((a, b) => b.zIndex - a.zIndex);
    }

    /**
     * Get semantic groups
     */
    getSemanticGroups() {
        return new Map(this.semanticGroups);
    }

    /**
     * Get occlusion information for an element
     */
    getOcclusionInfo(elementId) {
        return this.occlusionMap.get(elementId);
    }

    /**
     * Mark element as removed and update relationships
     */
    removeElement(elementId) {
        const relationship = this.occlusionMap.get(elementId);
        if (!relationship) return;
        
        relationship.isVisible = false;
        
        // Update elements that were occluded by this element
        relationship.occludes.forEach(occludedId => {
            const occludedRelationship = this.occlusionMap.get(occludedId);
            if (occludedRelationship) {
                const index = occludedRelationship.occludedBy.indexOf(elementId);
                if (index > -1) {
                    occludedRelationship.occludedBy.splice(index, 1);
                }
            }
        });
        
        // Recalculate layer depths
        this.calculateLayerDepths();
    }

    /**
     * Get detailed analysis report
     */
    getAnalysisReport() {
        const totalElements = this.elements.length;
        const visibleElements = Array.from(this.occlusionMap.values())
            .filter(r => r.isVisible).length;
        const occludedElements = totalElements - visibleElements;
        
        return {
            totalElements,
            visibleElements,
            occludedElements,
            semanticGroups: this.semanticGroups.size,
            layerDepths: this.getLayerDepthDistribution(),
            topologicalOrder: this.topologicalOrder.length
        };
    }

    /**
     * Get distribution of layer depths
     */
    getLayerDepthDistribution() {
        const distribution = new Map();
        
        this.occlusionMap.forEach(relationship => {
            const depth = relationship.layerDepth;
            distribution.set(depth, (distribution.get(depth) || 0) + 1);
        });
        
        return Object.fromEntries(distribution);
    }
}
