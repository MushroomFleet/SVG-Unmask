# Diagram Notes

## Diagram 1: Autoregressive Layer Peeling for SVG Images

This diagram illustrates the concept of autoregressive layer peeling applied to SVG format images. The process demonstrates how complex visual scenes can be progressively simplified by removing layers of detail in an autoregressive manner.

### Process Overview
The diagram shows several examples of source images undergoing autoregressive peeling, where each step removes a layer of complexity until only the most fundamental shapes remain.

### Examples Shown:

**1. Landscape Scene (Top Row)**
- **Source Image**: A detailed landscape featuring blue sky with clouds, dark mountains, green hills, trees, and a winding blue river
- **Peeling Process**: Progressive simplification through 4 stages
- **Final Shapes**: Basic geometric representations - triangle (tree), mountain silhouette, and curved line (river)

**2. Architectural Structure (Second Row)**
- **Source Image**: A mosque or palace with multiple domes, minarets, and architectural details in brown/tan colors
- **Peeling Process**: Gradual removal of architectural details
- **Final Shapes**: Simple geometric forms representing the core structural elements

**3. School Bus (Third Row)**
- **Source Image**: A detailed yellow school bus with windows, doors, and typical bus features
- **Peeling Process**: Step-by-step simplification removing details like windows and doors
- **Final Shapes**: Basic rectangular yellow shape representing the bus body

**4. Teddy Bear (Right Side, Top)**
- **Source Image**: A cute cartoon teddy bear with facial features and body details
- **Peeling Process**: Progressive abstraction removing facial features and details
- **Final Shapes**: Simple bear silhouette and basic circular forms

**5. Network/Graph Structure (Right Side, Middle)**
- **Source Image**: A complex network diagram with multiple connected nodes (red circles) and connections
- **Peeling Process**: Gradual reduction of nodes and connections
- **Final Shapes**: Single circle and basic line elements

**6. Drum/Musical Instrument (Right Side, Bottom)**
- **Source Image**: A detailed drum with decorative patterns and drumsticks
- **Peeling Process**: Removal of decorative elements and details
- **Final Shapes**: Basic circular and linear geometric forms

### Key Insights
The autoregressive peeling process reveals the hierarchical nature of visual complexity in SVG images, where:
- Complex scenes are built from layers of increasingly detailed elements
- The peeling process works in reverse, systematically removing layers of detail
- The final result preserves the essential geometric foundation of the original image
- This technique could be useful for image compression, style transfer, or hierarchical image understanding tasks

## Diagram 2: Technical Implementation of Autoregressive Layer Peeling

This diagram provides a detailed technical view of how autoregressive layer peeling is implemented using modern AI techniques, specifically Vision-Language Models (VLMs) and diffusion models.

### Pipeline Overview

The process consists of three main stages: Layer Graph Construction, Layer Peeling with Diffusion Models, and Autoregressive Peeling execution.

### Stage 1: Layer Graph Construction with VLMs

**Source Image Analysis**: Starting with a green parrot/bird image, the Vision-Language Model analyzes and decomposes the image into semantic components.

**Semantic Decomposition**: The bird is broken down into meaningful parts:
- **Eye** (black circular feature)
- **Dark green curve** (part of the wing/body contour)
- **Dark green wing** (main wing structure)
- **Blue side feather** (accent coloring)
- **Pink chest** (breast area)
- **Light green body** (main body mass)
- **Left leg** and **Right leg** (appendages)
- **Upper beak** and **Lower beak** (bill components)

**Occlusion Relationships**: Dashed blue arrows indicate spatial and layering relationships between components, showing which elements occlude or are positioned in front of others.

### Stage 2: Layer Peeling with Diffusion Models

**Global and Instance Prompts**: 
- **Global prompt**: "the eye, green curve and wing" - describes the overall context
- **Instance prompts & bounding boxes**: Specific descriptions for individual components like "black eye", "green curve", "green wing" with corresponding spatial boundaries

**Technical Architecture**:
- **Text Encoder**: Processes textual descriptions of image components
- **Diffusion Transformer with LoRA**: Core generative model enhanced with Low-Rank Adaptation for efficient fine-tuning
- **Image Encoder**: Processes visual input (xsrc)
- **Attention Control**: Manages which parts of the image to focus on during generation

**Data Flow**: The system takes encoded text (ce), noise tensor (zT), and source image (xsrc) as inputs, processing them through the attention-controlled diffusion transformer.

### Stage 3: Autoregressive Peeling Execution

**Progressive Removal**: The right side shows the step-by-step autoregressive peeling process:
1. **Original bird**: Complete parrot with all features
2. **First peel**: Removal of certain elements while maintaining core structure
3. **Second peel**: Further simplification
4. **Final result**: Most basic representation

### Key Technical Innovations

**VLM Integration**: Uses vision-language understanding to create semantically meaningful layer graphs rather than purely visual feature-based decomposition.

**Diffusion-Based Removal**: Employs diffusion models for controlled, high-quality layer removal that maintains visual coherence.

**Attention Control Mechanism**: Enables precise control over which image regions are modified during each peeling step.

**Semantic Awareness**: The process maintains semantic understanding throughout the peeling, ensuring that removed elements correspond to meaningful object parts rather than arbitrary pixels.

### Applications and Implications

This technical approach enables:
- **Semantic image editing**: Controlled removal or modification of specific object parts
- **Hierarchical image understanding**: Building structured representations of visual scenes
- **Content-aware compression**: Removing less important visual elements while preserving essential structure
- **Educational visualization**: Showing how complex objects can be understood as combinations of simpler parts