import { JSDOM } from 'jsdom';

/**
 * SVG Parser - Core component for analyzing SVG structure and elements
 */
export class SVGParser {
    constructor(svgContent) {
        this.svgContent = svgContent;
        
        // Clean and prepare SVG content
        let cleanSvgContent = svgContent.trim();
        
        // Remove any BOM characters and other problematic characters
        cleanSvgContent = cleanSvgContent.replace(/^\uFEFF/, '');
        cleanSvgContent = cleanSvgContent.replace(/^[^\<]*/, ''); // Remove any non-XML characters before the first <
        cleanSvgContent = cleanSvgContent.replace(/\u0000/g, ''); // Remove null bytes
        
        console.log('SVG Content length:', cleanSvgContent.length);
        console.log('SVG Content preview:', cleanSvgContent.substring(0, 100));
        
        // Create JSDOM with the SVG as the main document
        this.dom = new JSDOM(cleanSvgContent, {
            contentType: 'image/svg+xml'
        });
        
        this.document = this.dom.window.document;
        
        // In SVG documents, the root element is the SVG element itself
        this.svgElement = this.document.documentElement;
        
        console.log('SVG element found:', !!this.svgElement);
        console.log('SVG element tag name:', this.svgElement?.tagName);
        
        if (!this.svgElement || this.svgElement.tagName.toLowerCase() !== 'svg') {
            throw new Error('No valid SVG element found in the provided content');
        }
        
        this.elements = [];
        this.layerGraph = new Map();
        
        this.parseElements();
    }

    /**
     * Parse all drawable elements from the SVG
     */
    parseElements() {
        const drawableSelectors = [
            'path', 'rect', 'circle', 'ellipse', 'polygon', 'polyline', 
            'line', 'text', 'image', 'use', 'g'
        ];
        
        drawableSelectors.forEach(selector => {
            const elements = this.document.querySelectorAll(selector);
            elements.forEach(element => {
                const elementData = this.extractElementData(element);
                if (elementData) {
                    this.elements.push(elementData);
                }
            });
        });

        // Sort elements by z-index (rendering order)
        this.elements.sort((a, b) => a.zIndex - b.zIndex);
    }

    /**
     * Extract comprehensive data from an SVG element
     */
    extractElementData(element) {
        const computedStyle = this.dom.window.getComputedStyle(element);
        const bbox = this.calculateBoundingBox(element);
        
        if (!bbox || bbox.width === 0 || bbox.height === 0) {
            return null; // Skip invisible elements
        }

        return {
            id: element.id || this.generateId(),
            tagName: element.tagName.toLowerCase(),
            element: element,
            bbox: bbox,
            zIndex: this.getZIndex(element),
            opacity: parseFloat(computedStyle.opacity || 1),
            fill: computedStyle.fill || 'none',
            stroke: computedStyle.stroke || 'none',
            strokeWidth: parseFloat(computedStyle.strokeWidth || 0),
            transform: element.getAttribute('transform') || '',
            parent: element.parentElement?.tagName === 'g' ? element.parentElement : null,
            children: this.getChildren(element),
            isGroup: element.tagName.toLowerCase() === 'g',
            semanticGroup: null, // Will be assigned during semantic analysis
            pathData: element.getAttribute('d'), // For path elements
            attributes: this.getRelevantAttributes(element)
        };
    }

    /**
     * Calculate bounding box for an element
     */
    calculateBoundingBox(element) {
        try {
            // For basic shapes, calculate bbox directly
            const tagName = element.tagName.toLowerCase();
            
            switch (tagName) {
                case 'rect':
                    return {
                        x: parseFloat(element.getAttribute('x') || 0),
                        y: parseFloat(element.getAttribute('y') || 0),
                        width: parseFloat(element.getAttribute('width') || 0),
                        height: parseFloat(element.getAttribute('height') || 0)
                    };
                    
                case 'circle':
                    const cx = parseFloat(element.getAttribute('cx') || 0);
                    const cy = parseFloat(element.getAttribute('cy') || 0);
                    const r = parseFloat(element.getAttribute('r') || 0);
                    return {
                        x: cx - r,
                        y: cy - r,
                        width: r * 2,
                        height: r * 2
                    };
                    
                case 'ellipse':
                    const ecx = parseFloat(element.getAttribute('cx') || 0);
                    const ecy = parseFloat(element.getAttribute('cy') || 0);
                    const rx = parseFloat(element.getAttribute('rx') || 0);
                    const ry = parseFloat(element.getAttribute('ry') || 0);
                    return {
                        x: ecx - rx,
                        y: ecy - ry,
                        width: rx * 2,
                        height: ry * 2
                    };
                    
                case 'line':
                    const x1 = parseFloat(element.getAttribute('x1') || 0);
                    const y1 = parseFloat(element.getAttribute('y1') || 0);
                    const x2 = parseFloat(element.getAttribute('x2') || 0);
                    const y2 = parseFloat(element.getAttribute('y2') || 0);
                    return {
                        x: Math.min(x1, x2),
                        y: Math.min(y1, y2),
                        width: Math.abs(x2 - x1),
                        height: Math.abs(y2 - y1)
                    };
                    
                case 'path':
                    // For paths, we need to parse the path data
                    return this.calculatePathBoundingBox(element.getAttribute('d'));
                    
                default:
                    // For groups and other elements, calculate from children or use approximation
                    return this.calculateApproximateBoundingBox(element);
            }
        } catch (error) {
            console.warn(`Error calculating bounding box for ${element.tagName}:`, error);
            return { x: 0, y: 0, width: 0, height: 0 };
        }
    }

    /**
     * Calculate bounding box for path elements by parsing path data
     */
    calculatePathBoundingBox(pathData) {
        if (!pathData) return { x: 0, y: 0, width: 0, height: 0 };
        
        // Simple path data parser for basic bounding box calculation
        const commands = pathData.match(/[MmLlHhVvCcSsQqTtAaZz][^MmLlHhVvCcSsQqTtAaZz]*/g) || [];
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        let currentX = 0, currentY = 0;
        
        commands.forEach(command => {
            const cmd = command[0];
            const params = command.slice(1).trim().split(/[\s,]+/).map(Number).filter(n => !isNaN(n));
            
            switch (cmd.toLowerCase()) {
                case 'm': // Move to
                case 'l': // Line to
                    if (params.length >= 2) {
                        if (cmd === cmd.toLowerCase()) { // Relative
                            currentX += params[0];
                            currentY += params[1];
                        } else { // Absolute
                            currentX = params[0];
                            currentY = params[1];
                        }
                        minX = Math.min(minX, currentX);
                        minY = Math.min(minY, currentY);
                        maxX = Math.max(maxX, currentX);
                        maxY = Math.max(maxY, currentY);
                    }
                    break;
                case 'h': // Horizontal line
                    if (params.length >= 1) {
                        currentX += cmd === cmd.toLowerCase() ? params[0] : params[0] - currentX;
                        minX = Math.min(minX, currentX);
                        maxX = Math.max(maxX, currentX);
                    }
                    break;
                case 'v': // Vertical line
                    if (params.length >= 1) {
                        currentY += cmd === cmd.toLowerCase() ? params[0] : params[0] - currentY;
                        minY = Math.min(minY, currentY);
                        maxY = Math.max(maxY, currentY);
                    }
                    break;
            }
        });
        
        if (minX === Infinity) return { x: 0, y: 0, width: 0, height: 0 };
        
        return {
            x: minX,
            y: minY,
            width: maxX - minX,
            height: maxY - minY
        };
    }

    /**
     * Calculate approximate bounding box for complex elements
     */
    calculateApproximateBoundingBox(element) {
        // For groups, calculate bounding box of all children
        if (element.tagName.toLowerCase() === 'g') {
            const children = Array.from(element.children);
            if (children.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
            
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            
            children.forEach(child => {
                const childBbox = this.calculateBoundingBox(child);
                if (childBbox.width > 0 && childBbox.height > 0) {
                    minX = Math.min(minX, childBbox.x);
                    minY = Math.min(minY, childBbox.y);
                    maxX = Math.max(maxX, childBbox.x + childBbox.width);
                    maxY = Math.max(maxY, childBbox.y + childBbox.height);
                }
            });
            
            return minX === Infinity ? 
                { x: 0, y: 0, width: 0, height: 0 } :
                { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
        }
        
        return { x: 0, y: 0, width: 100, height: 100 }; // Fallback
    }

    /**
     * Determine z-index (rendering order) of an element
     */
    getZIndex(element) {
        let zIndex = 0;
        let current = element;
        
        // Calculate z-index based on DOM position and hierarchy
        while (current && current !== this.svgElement) {
            const siblings = Array.from(current.parentElement?.children || []);
            zIndex += siblings.indexOf(current);
            current = current.parentElement;
            zIndex *= 1000; // Weight parent hierarchy heavily
        }
        
        return zIndex;
    }

    /**
     * Get child elements for groups
     */
    getChildren(element) {
        if (element.tagName.toLowerCase() !== 'g') return [];
        return Array.from(element.children).map(child => child.id || this.generateId());
    }

    /**
     * Extract relevant attributes from element
     */
    getRelevantAttributes(element) {
        const relevantAttrs = ['class', 'style', 'clip-path', 'mask', 'filter'];
        const attrs = {};
        
        relevantAttrs.forEach(attr => {
            const value = element.getAttribute(attr);
            if (value) attrs[attr] = value;
        });
        
        return attrs;
    }

    /**
     * Generate unique ID for elements without IDs
     */
    generateId() {
        return `svg-unmask-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Get all elements sorted by rendering order (z-index)
     */
    getElements() {
        return [...this.elements];
    }

    /**
     * Get SVG dimensions
     */
    getDimensions() {
        const viewBox = this.svgElement.getAttribute('viewBox');
        if (viewBox) {
            const [x, y, width, height] = viewBox.split(/\s+/).map(Number);
            return { x, y, width, height };
        }
        
        return {
            x: 0,
            y: 0,
            width: parseFloat(this.svgElement.getAttribute('width') || 300),
            height: parseFloat(this.svgElement.getAttribute('height') || 150)
        };
    }

    /**
     * Export current state as SVG string
     */
    toSVG() {
        return this.svgElement.outerHTML;
    }
}
