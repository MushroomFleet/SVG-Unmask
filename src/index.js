import { SVGParser } from './core/svg-parser.js';
import { PeelingEngine } from './core/peeling-engine.js';
import fs from 'fs';
import path from 'path';

/**
 * SVG-Unmask - Main orchestrator for autoregressive layer peeling
 */
export class SVGUnmask {
    constructor() {
        this.parser = null;
        this.engine = null;
        this.results = null;
    }

    /**
     * Load and analyze an SVG file
     */
    async loadSVG(svgContent) {
        try {
            // Parse the SVG content
            this.parser = new SVGParser(svgContent);
            
            // Initialize the peeling engine
            this.engine = new PeelingEngine(this.parser);
            
            console.log('SVG loaded successfully');
            console.log(`- Elements found: ${this.parser.getElements().length}`);
            console.log(`- SVG dimensions: ${JSON.stringify(this.parser.getDimensions())}`);
            
            // Get initial analysis
            const layerAnalysis = this.engine.layerGraph.getAnalysisReport();
            console.log('Layer Analysis:', layerAnalysis);
            
            return {
                success: true,
                elementCount: this.parser.getElements().length,
                dimensions: this.parser.getDimensions(),
                layerAnalysis: layerAnalysis
            };
        } catch (error) {
            console.error('Error loading SVG:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Perform complete autoregressive peeling with options
     */
    async performPeeling(options = {}) {
        if (!this.engine) {
            throw new Error('No SVG loaded. Call loadSVG() first.');
        }

        console.log('Starting autoregressive peeling...');
        
        const defaultOptions = {
            maxSteps: 20,
            stopAtBasicShapes: true,
            preserveSemanticGroups: true,
            contentRecovery: false, // Disabled for now until strategies are implemented
            outputDirectory: './output'
        };

        const config = { ...defaultOptions, ...options };
        
        try {
            // Perform the peeling process
            this.results = await this.engine.performAutoregressivePeeling(config);
            
            console.log(`Peeling completed in ${this.results.steps.length} steps`);
            console.log('Statistics:', this.results.statistics);
            
            // Save intermediate results if output directory is specified
            if (config.outputDirectory) {
                await this.saveResults(config.outputDirectory);
            }
            
            return this.results;
        } catch (error) {
            console.error('Error during peeling:', error);
            throw error;
        }
    }

    /**
     * Perform a single peeling step
     */
    async performSingleStep(options = {}) {
        if (!this.engine) {
            throw new Error('No SVG loaded. Call loadSVG() first.');
        }

        try {
            const result = await this.engine.performSinglePeelingStep(options);
            
            if (result) {
                console.log(`Step ${result.step}: ${result.description}`);
                console.log(`- Removed: ${result.removedElements.length} elements`);
                console.log(`- Remaining: ${result.remainingElements.length} elements`);
            } else {
                console.log('No more elements to remove');
            }
            
            return result;
        } catch (error) {
            console.error('Error performing peeling step:', error);
            throw error;
        }
    }

    /**
     * Get current state information
     */
    getCurrentState() {
        if (!this.engine) {
            return null;
        }

        const history = this.engine.getPeelingHistory();
        const remaining = this.engine.getRemainingElements();
        const topmost = this.engine.layerGraph.getTopmostElements();
        
        return {
            totalSteps: history.length,
            remainingElements: remaining.length,
            topmostElements: topmost.length,
            currentSVG: this.parser.toSVG(),
            lastStep: history[history.length - 1] || null
        };
    }

    /**
     * Reset to initial state
     */
    reset() {
        if (this.engine) {
            this.engine.reset();
            console.log('SVG-Unmask reset to initial state');
        }
    }

    /**
     * Save peeling results to files
     */
    async saveResults(outputDirectory) {
        if (!this.results) {
            throw new Error('No results to save. Perform peeling first.');
        }

        // Create output directory
        if (!fs.existsSync(outputDirectory)) {
            fs.mkdirSync(outputDirectory, { recursive: true });
        }

        try {
            // Save final SVG
            const finalSVGPath = path.join(outputDirectory, 'final.svg');
            fs.writeFileSync(finalSVGPath, this.results.finalSVG);
            console.log(`Final SVG saved to: ${finalSVGPath}`);

            // Save intermediate states
            const intermediateStates = this.engine.exportIntermediateStates();
            intermediateStates.forEach((state, index) => {
                const filename = `step-${String(index + 1).padStart(2, '0')}.svg`;
                const filepath = path.join(outputDirectory, filename);
                fs.writeFileSync(filepath, state.svg);
            });
            console.log(`${intermediateStates.length} intermediate states saved`);

            // Save statistics and analysis
            const reportPath = path.join(outputDirectory, 'analysis-report.json');
            const report = {
                statistics: this.results.statistics,
                layerAnalysis: this.results.layerAnalysis,
                steps: this.results.steps.map(step => ({
                    step: step.step,
                    description: step.description,
                    removedCount: step.removedElements.length,
                    remainingCount: step.remainingElements.length
                })),
                metadata: {
                    timestamp: new Date().toISOString(),
                    originalElements: this.parser.getElements().length,
                    finalElements: this.engine.getRemainingElements().length
                }
            };
            
            fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
            console.log(`Analysis report saved to: ${reportPath}`);

            // Create an HTML visualization
            await this.createVisualization(outputDirectory, intermediateStates);

        } catch (error) {
            console.error('Error saving results:', error);
            throw error;
        }
    }

    /**
     * Create HTML visualization of the peeling process
     */
    async createVisualization(outputDirectory, intermediateStates) {
        const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SVG-Unmask: Autoregressive Layer Peeling Results</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            margin: 0;
            padding: 20px;
            background-color: #f5f5f5;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            overflow: hidden;
        }
        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 30px;
            text-align: center;
        }
        .header h1 {
            margin: 0;
            font-size: 2.5em;
            font-weight: 300;
        }
        .header p {
            margin: 10px 0 0 0;
            opacity: 0.9;
        }
        .controls {
            padding: 20px;
            background: #f8f9fa;
            border-bottom: 1px solid #e9ecef;
        }
        .step-viewer {
            padding: 20px;
        }
        .step-info {
            background: #e3f2fd;
            padding: 15px;
            border-radius: 6px;
            margin-bottom: 20px;
            border-left: 4px solid #2196f3;
        }
        .svg-container {
            text-align: center;
            background: white;
            border: 2px dashed #ddd;
            border-radius: 8px;
            padding: 20px;
            margin: 20px 0;
        }
        .svg-container svg {
            max-width: 100%;
            max-height: 500px;
            border: 1px solid #ccc;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }
        .navigation {
            display: flex;
            justify-content: center;
            gap: 10px;
            margin: 20px 0;
        }
        .btn {
            padding: 10px 20px;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            font-size: 14px;
            transition: all 0.3s ease;
        }
        .btn-primary {
            background: #007bff;
            color: white;
        }
        .btn-primary:hover {
            background: #0056b3;
        }
        .btn-secondary {
            background: #6c757d;
            color: white;
        }
        .btn-secondary:hover {
            background: #545b62;
        }
        .btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }
        .step-slider {
            width: 100%;
            margin: 10px 0;
        }
        .stats {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin: 20px 0;
        }
        .stat-card {
            background: white;
            border: 1px solid #e9ecef;
            border-radius: 6px;
            padding: 15px;
            text-align: center;
        }
        .stat-value {
            font-size: 2em;
            font-weight: bold;
            color: #007bff;
        }
        .stat-label {
            color: #6c757d;
            font-size: 0.9em;
            margin-top: 5px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>SVG-Unmask</h1>
            <p>Autoregressive Layer Peeling Results</p>
        </div>
        
        <div class="controls">
            <div class="stats">
                <div class="stat-card">
                    <div class="stat-value">${intermediateStates.length + 1}</div>
                    <div class="stat-label">Total Steps</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${this.results.statistics.totalRemoved}</div>
                    <div class="stat-label">Elements Removed</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${this.results.statistics.remainingElements}</div>
                    <div class="stat-label">Final Elements</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${Math.round(this.results.statistics.removalEfficiency * 100)}%</div>
                    <div class="stat-label">Removal Efficiency</div>
                </div>
            </div>
            
            <input type="range" id="stepSlider" class="step-slider" min="0" max="${intermediateStates.length}" value="0">
            
            <div class="navigation">
                <button class="btn btn-secondary" onclick="previousStep()">← Previous</button>
                <button class="btn btn-primary" onclick="playAnimation()" id="playBtn">▶ Play Animation</button>
                <button class="btn btn-secondary" onclick="nextStep()">Next →</button>
            </div>
        </div>
        
        <div class="step-viewer">
            <div class="step-info" id="stepInfo">
                <strong>Step 0:</strong> Original SVG
            </div>
            
            <div class="svg-container" id="svgContainer">
                <!-- SVG content will be inserted here -->
            </div>
        </div>
    </div>

    <script>
        const steps = [
            {
                step: 0,
                description: "Original SVG",
                svg: \`${this.parser.toSVG().replace(/`/g, '\\`')}\`
            },
            ${intermediateStates.map(state => `{
                step: ${state.step + 1},
                description: "${state.description}",
                svg: \`${state.svg.replace(/`/g, '\\`')}\`
            }`).join(',\n            ')}
        ];
        
        let currentStep = 0;
        let isPlaying = false;
        
        function showStep(stepIndex) {
            currentStep = Math.max(0, Math.min(stepIndex, steps.length - 1));
            
            const step = steps[currentStep];
            document.getElementById('stepInfo').innerHTML = 
                \`<strong>Step \${step.step}:</strong> \${step.description}\`;
            
            document.getElementById('svgContainer').innerHTML = step.svg;
            document.getElementById('stepSlider').value = currentStep;
            
            // Update navigation buttons
            const prevBtn = document.querySelector('.btn-secondary');
            const nextBtn = document.querySelectorAll('.btn-secondary')[1];
            prevBtn.disabled = currentStep === 0;
            nextBtn.disabled = currentStep === steps.length - 1;
        }
        
        function previousStep() {
            if (currentStep > 0) {
                showStep(currentStep - 1);
            }
        }
        
        function nextStep() {
            if (currentStep < steps.length - 1) {
                showStep(currentStep + 1);
            }
        }
        
        function playAnimation() {
            if (isPlaying) {
                clearInterval(playInterval);
                isPlaying = false;
                document.getElementById('playBtn').textContent = '▶ Play Animation';
                return;
            }
            
            isPlaying = true;
            document.getElementById('playBtn').textContent = '⏸ Pause';
            
            playInterval = setInterval(() => {
                if (currentStep < steps.length - 1) {
                    nextStep();
                } else {
                    clearInterval(playInterval);
                    isPlaying = false;
                    document.getElementById('playBtn').textContent = '▶ Play Animation';
                }
            }, 1500);
        }
        
        // Slider event listener
        document.getElementById('stepSlider').addEventListener('input', function() {
            showStep(parseInt(this.value));
        });
        
        // Initialize with first step
        showStep(0);
    </script>
</body>
</html>`;

        const htmlPath = path.join(outputDirectory, 'visualization.html');
        fs.writeFileSync(htmlPath, htmlContent);
        console.log(`Interactive visualization saved to: ${htmlPath}`);
    }
}

/**
 * Command-line interface for SVG-Unmask
 */
async function main() {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
        console.log(`
SVG-Unmask - Autoregressive Layer Peeling for SVG Images

Usage:
  node src/index.js <svg-file> [options]

Options:
  --max-steps <n>        Maximum number of peeling steps (default: 20)
  --output <dir>         Output directory for results (default: ./output)
  --no-semantic-groups   Disable semantic grouping
  --no-basic-shapes      Don't stop at basic shapes
  --single-step          Perform only one peeling step

Examples:
  node src/index.js sample.svg
  node src/index.js sample.svg --max-steps 10 --output results
  node src/index.js sample.svg --single-step
        `);
        return;
    }

    const svgFile = args[0];
    
    // Parse command line options
    const options = {
        maxSteps: 20,
        outputDirectory: './output',
        preserveSemanticGroups: true,
        stopAtBasicShapes: true,
        singleStep: false
    };

    for (let i = 1; i < args.length; i++) {
        switch (args[i]) {
            case '--max-steps':
                options.maxSteps = parseInt(args[++i]);
                break;
            case '--output':
                options.outputDirectory = args[++i];
                break;
            case '--no-semantic-groups':
                options.preserveSemanticGroups = false;
                break;
            case '--no-basic-shapes':
                options.stopAtBasicShapes = false;
                break;
            case '--single-step':
                options.singleStep = true;
                break;
        }
    }

    try {
        // Check if file exists
        if (!fs.existsSync(svgFile)) {
            console.error(`Error: File ${svgFile} not found`);
            return;
        }

        // Read SVG file
        const svgContent = fs.readFileSync(svgFile, 'utf8');
        
        // Initialize SVG-Unmask
        const unmask = new SVGUnmask();
        
        // Load SVG
        console.log(`Loading SVG: ${svgFile}`);
        const loadResult = await unmask.loadSVG(svgContent);
        
        if (!loadResult.success) {
            console.error(`Failed to load SVG: ${loadResult.error}`);
            return;
        }

        // Perform peeling
        if (options.singleStep) {
            const result = await unmask.performSingleStep(options);
            if (result) {
                console.log('Single step completed');
                console.log('Current state:', unmask.getCurrentState());
            }
        } else {
            const results = await unmask.performPeeling(options);
            console.log('Autoregressive peeling completed successfully!');
            console.log(`Check the results in: ${options.outputDirectory}`);
        }

    } catch (error) {
        console.error('Error:', error.message);
    }
}

// Run CLI if this file is executed directly
if (process.argv[1].endsWith('index.js')) {
    main().catch(console.error);
}

export default SVGUnmask;
