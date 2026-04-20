// src/App.jsx (Complete Modified Code)

import React, { useState, useEffect, useCallback, useRef } from 'react'; // Import useRef
import { useNavigate } from 'react-router-dom';
import './App.css'; // Make sure this path is correct
import MindMapViewer from './MindMapViewer'; // Make sure this path is correct
import VisualizationViewer from './VisualizationViewer'; // Make sure this path is correct
import Chatbot from './Chatbot'; // Make sure this path is correct
import Groq from 'groq-sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';

// --- API Configurations ---
const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY;
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

// --- API Key Status ---
const isGroqKeyMissing = !GROQ_API_KEY;
const isGeminiKeyMissing = !GEMINI_API_KEY;

// --- SDK Initializations ---
let groq = null;
let genAI = null;
let geminiModel = null;

if (!isGroqKeyMissing) {
    try {
        groq = new Groq({ apiKey: GROQ_API_KEY, dangerouslyAllowBrowser: true });
    } catch (error) {
        console.error("Error initializing Groq SDK:", error);
    }
} else {
    console.warn("Groq API Key (VITE_GROQ_API_KEY) not found.");
}

if (!isGeminiKeyMissing) {
    try {
        genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
        // Use a specific model name that supports the features you need
        geminiModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" }); // Updated Model Example
    } catch (error) {
        console.error("Error initializing Gemini SDK:", error);
    }
} else {
    console.warn("Gemini API Key not provided or invalid.");
}

const GROQ_MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct'; // Updated Groq Model Example

// --- System Prompts ---
const MINDMAP_SYSTEM_PROMPT = `
You are an assistant that generates hierarchical mind map structures for a given topic.
The output MUST be a valid JSON object following this exact structure:
{
  "nodes": [
    { "id": "unique_node_id_1", "data": { "label": "Node Label 1" }, "position": { "x": 0, "y": 0 } },
    { "id": "unique_node_id_2", "data": { "label": "Node Label 2" }, "position": { "x": 100, "y": 100 } }
  ],
  "edges": [
    { "id": "edge_id_1", "source": "source_node_id", "target": "target_node_id" }
  ]
}
Ensure node IDs are unique strings. Provide appropriate x/y positions. Make the central topic node ID 'root'. Do not include any explanations or markdown formatting. Output ONLY the JSON object.
`;

const VISUALIZATION_SYSTEM_PROMPT = `
You are an expert web developer creating **highly interactive and engaging** educational web pages.
Generate a single, self-contained HTML snippet (no \<html>\, \<head>\, or \<body>\ tags around the *entire* snippet, but you can use them *within* if needed for styling) that provides an interactive visualization for the given concept/topic.
Requirements:
1.  **Meaningful Interactivity:** User actions (clicks, inputs) should directly relate to exploring or understanding the concept. Avoid static displays.
2.  **Self-Contained:** All HTML, CSS (\<style>\), and  suitable JS (\<script>\) within the snippet. No external libraries/resources.
3.  **Informative & Clear:** Accurately represent the concept. Keep text concise. Don't make any kind of clutter in the visualization.
4.  **Safe for iframe:** Must run in \<iframe srcDoc>\ sandbox. Avoid \window.top\/etc. Use unique IDs/classes.
5.  **Output ONLY Raw HTML:** No explanations, markdown, or other text outside the HTML snippet.
6.  **Full Height Visualization:** *** CRITICAL: Style the content within your HTML snippet so it fills the entire available vertical height. Apply \height: 100%\ to the \html\ and \body\ elements *within* the snippet's \<style>\ tag. Ensure the main visual container element(s) also expand to use this full height (e.g., using \min-height: 100%\, flexbox \flex-grow: 1\, or similar techniques). The goal is NO significant empty space below the visualization content when placed in a tall container and it should be scrollable inside the container so the user can interact with the all.***
7. **Multiple Visualization Elements:** There should be more than one and different kind of visualization related to the topic within the snippet.
8. **Reset Button:** Include a functional reset button within the HTML snippet that resets the state of the interactive elements to their initial appearance, allowing the user to interact with them again.
9. **Make sure to make precise and accurate 2d interactive elements in the visualization so user can understand better**
Add a footnote at the bottom: "Note: If this visualization isn't quite right, try clicking the mind map node again for a different perspective."
`;

const generateChatbotSystemPrompt = (topic, level, isPlayful) => {
    const basePrompt = `You are an expert AI tutor specializing in "${topic}". The user's current expertise level is "${level}". Your goal is to help the user understand this topic better through conversation. Initiate the topic-specific conversation by explaining why the particular topic is important, where it is used, and focusing on the core concepts. Answer questions clearly, provide explanations, give real-life examples, and offer intuition-based answers tailored to the user's level. Ask clarifying questions to make the conversation more engaging and human-like. You can understand and discuss images uploaded by the user. Use Markdown for formatting (like **bold**, *italics*, \`code\`, lists) when appropriate and don't use latex formatting.`;
    const playfulPrefix = `Adopt a fun, encouraging, and slightly playful tone! Use lots of emojis and play funny jokes and methaphoriacal stories according to the topic and level. Let's make learning an adventure! Always provide a playful examples, appropriate for their level, to make it more memorable. `;
    return isPlayful ? playfulPrefix + basePrompt : basePrompt;
};
// ---------------------------------

function App() {
    // --- State variables ---
    const [topic, setTopic] = useState('');
    const [level, setLevel] = useState('Novice Explorer');
    const [isPlayful, setIsPlayful] = useState(false);
    const [mindMapData, setMindMapData] = useState({ nodes: [], edges: [] });
    const [isMapLoading, setIsMapLoading] = useState(false);
    const [mapError, setMapError] = useState(null);
    const [visualizationHtml, setVisualizationHtml] = useState('');
    const [isVisLoading, setIsVisLoading] = useState(false); // Controls visualization loading AND mind map clicking
    const [visError, setVisError] = useState(null);
    const [selectedNodeLabel, setSelectedNodeLabel] = useState('');
    const [isChatActive, setIsChatActive] = useState(false);
    const [chatbotSystemPrompt, setChatbotSystemPrompt] = useState('');
    // ---------------------

    // --- Navigation Hook ---
    const navigate = useNavigate();
    // ----------------------

    // --- ADDED: Ref for Visualization Container ---
    const visualizationContainerRef = useRef(null);
    // --- END ADDED ---

    // --- Redirect Logic ---
    useEffect(() => {
        const hasVisitedLanding = sessionStorage.getItem('visitedLanding');
        if (!hasVisitedLanding) {
            console.log("App mounted without visiting landing page first in this session. Redirecting to /");
            navigate('/', { replace: true });
        }
    }, [navigate]);
    // --- END: Redirect Logic ---

    // --- Theme Effect ---
    useEffect(() => {
        if (isGroqKeyMissing && !mapError) {
           setMapError("Groq API Key missing. Mind map generation disabled.");
        }
        if (isGeminiKeyMissing && !visError) {
           // Setting an initial state is okay, but handle errors within API calls
           // setVisError("Gemini API Key missing. Visualization disabled.");
        }
        const themeClass = isPlayful ? 'theme-playful' : 'theme-focused';
        document.body.className = themeClass;
        return () => { document.body.className = ''; }; // Cleanup
    }, [isPlayful, isGroqKeyMissing, isGeminiKeyMissing, mapError, visError]); // Added missing keys to dependency array
    // --------------------

    // --- Card Definitions ---
     const gridCardDefinitions = [
        { id: 'mind-map', icon: '🧠', iconPlayful: '🤪', title: 'Mind Map', titlePlayful: 'Cosmic Map', description: 'Explore connections within [topic]. Click a node!', descriptionPlayful: 'Chart the constellations of [topic]! Click a node!', apiKeyMissing: isGroqKeyMissing, },
        { id: 'chatbot', icon: '💬', iconPlayful: '🤖', title: 'AI Tutor (Tanya)', titlePlayful: 'Adventure Guide (Tanya)', description: '', descriptionPlayful: '', apiKeyMissing: isGroqKeyMissing, }, // Chatbot also depends on Groq
        { id: 'visualization', icon: '💡', iconPlayful: '🧪', title: 'Visualization', titlePlayful: 'Idea Lab', apiKeyMissing: isGeminiKeyMissing, },
    ];
    // ----------------------

    // --- Callbacks ---
    const handleGenerateMindMap = useCallback(async (e) => {
        if (e) e.preventDefault();

        if (isGroqKeyMissing) { setMapError("Groq API Key missing."); return; }
        if (!groq) { setMapError("Configuration Error: Groq SDK failed to initialize."); return; }
        if (!topic.trim()) { setMapError('Please enter a topic.'); return; }

        console.log('Generating Mind Map for:', topic, 'Level:', level, 'Playful:', isPlayful);
        setIsMapLoading(true);
        setMapError(null);
        setMindMapData({ nodes: [], edges: [] }); // Reset map data
        setVisualizationHtml(''); // Clear previous visualization
        setVisError(null); // Clear previous visualization error
        setSelectedNodeLabel(''); // Clear selected node
        setIsChatActive(true); // Activate chat for the new topic
        setChatbotSystemPrompt(generateChatbotSystemPrompt(topic, level, isPlayful)); // Set prompt

        try {
            const chatCompletion = await groq.chat.completions.create({
                messages: [
                    { role: "system", content: MINDMAP_SYSTEM_PROMPT },
                    { role: "user", content: `Generate a mind map for the topic: ${topic}` }
                ],
                model: GROQ_MODEL,
                temperature: 0.3,
                stream: false, // Ensure stream is false for JSON format
                response_format: { type: "json_object" } // Request JSON output
            });
            const messageContent = chatCompletion.choices[0]?.message?.content;
            if (!messageContent) {
                throw new Error("No content received from Groq API for mind map.");
            }
            // Attempt to clean potential markdown fences (though response_format should prevent this)
            const cleanedJsonString = messageContent.replace(/^\`\`\`(?:json)?\s*|\s*\`\`\`$/g, '').trim();
            let jsonData;
            try {
                jsonData = JSON.parse(cleanedJsonString);
            } catch (parseError) {
                console.error("Raw Mindmap Content:", messageContent); // Log raw content on error
                throw new SyntaxError(`Failed to parse mind map JSON: ${parseError.message}`);
            }
            // Validate structure
            if (!jsonData || typeof jsonData !== 'object' || !Array.isArray(jsonData.nodes) || !Array.isArray(jsonData.edges)) {
                throw new Error("Invalid JSON structure received for mind map.");
            }
            setMindMapData(jsonData);
            console.log(`Mind Map generated: ${jsonData.nodes.length} nodes, ${jsonData.edges.length} edges.`);
        } catch (err) {
            console.error('Error during Mind Map generation (Groq):', err);
            setMapError(err.message || 'Failed to generate mind map.');
            setMindMapData({ nodes: [], edges: [] }); // Ensure reset on error
        } finally {
            setIsMapLoading(false);
        }
    }, [topic, level, isPlayful, isGroqKeyMissing]); // Removed groq from deps as it's initialized outside

    // --- MODIFIED: handleNodeClickGenerateVisualization ---
    const handleNodeClickGenerateVisualization = useCallback(async (nodeLabel) => {
        // Prevent triggering if already loading or Gemini key is missing
        if (isVisLoading || isGeminiKeyMissing) return;

        if (!geminiModel) { setVisError("Configuration Error: Gemini SDK failed to initialize."); return; }
        if (!topic || !nodeLabel) { setVisError("Please generate a map and click a node first."); return; }

        // --- Scroll into view BEFORE starting the load ---
        // Ensure the ref is attached before scrolling
        if (visualizationContainerRef.current) {
             visualizationContainerRef.current.scrollIntoView({
                 behavior: 'smooth',
                 block: 'start' // Scrolls so the top edge of the container aligns with the top of the viewport
             });
        }
        // ----------------------------------------------

        const fullConcept = `${topic}: ${nodeLabel}`;
        console.log('Generating Visualization for:', fullConcept);
        setIsVisLoading(true); // <<< SET LOADING STATE (disables map clicks)
        setVisError(null); // Clear previous error
        setVisualizationHtml(''); // Clear previous visualization
        setSelectedNodeLabel(nodeLabel);

        try {
            const prompt = `${VISUALIZATION_SYSTEM_PROMPT}\n\nGenerate an interactive visualization for the concept: ${fullConcept}`;
            const result = await geminiModel.generateContent(prompt);
            const response = await result.response;

            // Check for safety blocks
            if (response.promptFeedback?.blockReason) {
                throw new Error(`Visualization blocked due to: ${response.promptFeedback.blockReason}`);
            }

            const text = response.text();
            if (!text) {
                throw new Error("Empty response received from Gemini for visualization.");
            }
             // Clean potential markdown fences just in case
            const cleanedHtml = text.replace(/^\`\`\`(?:html)?\s*|\s*\`\`\`$/g, '').trim();
            setVisualizationHtml(cleanedHtml);
        } catch (err) {
            console.error('Error during Visualization generation (Gemini):', err);
            setVisError(err.message || 'Failed to generate visualization.');
            setVisualizationHtml(''); // Clear on error
        } finally {
            setIsVisLoading(false); // <<< CLEAR LOADING STATE (re-enables map clicks)
        }
    }, [topic, isGeminiKeyMissing, geminiModel, isVisLoading, visualizationContainerRef]); // Added isVisLoading and ref to dependencies
    // ---------------

    // --- Render Logic Variables ---
    const displayTopic = topic.trim() || 'the Topic';
    // isAnythingLoading is still useful for general dimming/disabling elsewhere if needed
    const isAnythingLoading = isMapLoading || isVisLoading;
    // Disable main topic input/level/button if map is loading OR Groq key missing
    const disableMainControls = isMapLoading || isGroqKeyMissing;
    // Show the whole visualization section if a node was clicked, or it's loading, or content/error exists
    const showVisualizationSection = !!(selectedNodeLabel || isVisLoading || visualizationHtml || visError);
    // ----------------------------

    // --- Return Statement (JSX) ---
    return (
        <div className={`app-container`}>
            <h1>Visual-Tutor<span role="img" aria-label={isPlayful ? 'party popper' : 'robot'}>{isPlayful ? '🥳' : '🤖'}</span></h1>

            {/* API Key Missing Errors */}
            {isGroqKeyMissing && <p className="error-message critical-error">⚠️ Groq API Key missing. Mind Map & Chatbot disabled.</p>}
            {isGeminiKeyMissing && <p className="error-message critical-error">⚠️ Gemini API Key missing. Visualization disabled.</p>}

            {/* Input Panel */}
            <form className="input-panel" onSubmit={handleGenerateMindMap}>
                <div className="form-group" style={{ flexGrow: 2 }}>
                    <label htmlFor="topic-input" className="input-label">Topic</label>
                    <input
                        type="text"
                        id="topic-input"
                        value={topic}
                        onChange={(e) => setTopic(e.target.value)}
                        placeholder={isGroqKeyMissing ? "Groq Key Missing" : "Enter topic..."}
                        aria-label="Learning Topic"
                        disabled={disableMainControls} // Use specific disable flag
                    />
                </div>
                <div className="form-group">
                    <label htmlFor="level-select" className="input-label">Level</label>
                    <select
                        id="level-select"
                        value={level}
                        onChange={(e) => setLevel(e.target.value)}
                        aria-label="Select Learning Level"
                        disabled={disableMainControls} // Use specific disable flag
                    >
                        <option value="Novice Explorer">{isPlayful ? '🌱 Space Cadet' : '🌱 Novice Explorer'}</option>
                        <option value="Curious Apprentice">{isPlayful ? '🧐 Star Gazer' : '🧐 Curious Apprentice'}</option>
                        <option value="Adept Scholar">{isPlayful ? '🎓 Galaxy Brain' : '🎓 Adept Scholar'}</option>
                        <option value="Wise Master">{isPlayful ? '🧙 Cosmic Sage' : '🧙 Wise Master'}</option>
                    </select>
                </div>
                <div className="button-container">
                    <span className="button-description">Click to see the magic!</span>
                    <button type="submit" className="submit-button" disabled={disableMainControls || !topic.trim()}>
                        {isMapLoading ? 'Generating...' : '✨ Generate Map ✨'}
                    </button>
                </div>
            </form>

            {/* Map Generation Error */}
            {mapError && !isGroqKeyMissing && <p className="error-message main-error">Mind Map Error: {mapError}</p>}

            {/* Theme Controls Panel */}
            <div className="controls-panel">
                <div className="switch-container">
                    <span className={`switch-label ${!isPlayful ? 'active' : ''}`}>Focused</span>
                    <label className="switch">
                        <input
                           type="checkbox"
                           checked={isPlayful}
                           onChange={() => setIsPlayful(!isPlayful)}
                           aria-label="Toggle Focused/Playful modes"
                           // Disable toggle if any API key is missing or map is loading
                           disabled={isGroqKeyMissing || isGeminiKeyMissing || isMapLoading}
                         />
                        <span className="slider"></span>
                    </label>
                    <span className={`switch-label ${isPlayful ? 'active' : ''}`}>Playful</span>
                </div>
            </div>

            {/* Content Grid (Mind Map & Chatbot) */}
            <div className="content-grid-two-cards" style={{ gridTemplateColumns: '1fr 1fr' }}>
                {gridCardDefinitions.slice(0, 2).map((card, index) => {
                    const baseTitle = isPlayful ? card.titlePlayful : card.title;
                    const currentTitle = baseTitle.replace('[topic]', displayTopic);
                    const currentIcon = isPlayful ? card.iconPlayful : card.icon;
                    const animationDelay = `${0.3 + index * 0.1}s`;
                    // Card is permanently disabled if its specific API key is missing
                    const isCardPermanentlyDisabled = card.apiKeyMissing;
                    // Dim the card if it's disabled OR if *any* API call is loading (unless it's the map loading its own data)
                    const cardIsMapLoadingItself = card.id === 'mind-map' && isMapLoading;
                    const dimCard = isCardPermanentlyDisabled || (isAnythingLoading && !cardIsMapLoadingItself);

                    // --- Determine if MindMap interaction should be temporarily disabled ---
                    // Disable clicks if the card is permanently disabled OR if visualization is currently loading
                    const disableMindMapInteraction = isCardPermanentlyDisabled || (card.id === 'mind-map' && isVisLoading);
                    // ----------------------------------------------------------------------

                    return (
                        <div key={card.id} className={`content-card ${isCardPermanentlyDisabled ? 'disabled-card' : ''}`} style={{ animationDelay, opacity: dimCard ? 0.6 : 1, position: 'relative' }}>
                            {/* Overlay for permanent disable */}
                            {isCardPermanentlyDisabled && <div className="api-key-missing-overlay">API Key Missing</div>}

                            {/* Card Header */}
                            <div className="card-header">
                                <span className="card-icon" role="img" aria-label={`${currentTitle} icon`}>{currentIcon}</span>
                                <h3 className="card-title">{currentTitle}</h3>
                            </div>

                            {/* Card Description (Mind Map only) */}
                            {card.id === 'mind-map' && (
                                <p className="card-description">
                                    {(isPlayful ? card.descriptionPlayful : card.description).replace('[topic]', displayTopic)}
                                </p>
                            )}

                            {/* Card Content Area */}
                            <div className="card-content-area" style={{ marginTop: card.id === 'mind-map' ? 'auto' : '0' }}> {/* Adjust margin */}
                                {card.id === 'mind-map' ? (
                                    <MindMapViewer
                                        key={topic || 'initial-map'} // Re-mount on topic change
                                        nodes={mindMapData.nodes}
                                        edges={mindMapData.edges}
                                        isLoading={isMapLoading} // Pass map's own loading state
                                        isDisabled={isCardPermanentlyDisabled} // Pass permanent disable state
                                        // --- MODIFIED: Conditionally disable onNodeClick ---
                                        onNodeClick={disableMindMapInteraction ? undefined : handleNodeClickGenerateVisualization}
                                        // --------------------------------------------------
                                    />
                                ) : card.id === 'chatbot' ? (
                                    <Chatbot
                                        key={topic || 'initial-chat'} // Re-mount on topic change
                                        isChatActive={isChatActive}
                                        systemPrompt={chatbotSystemPrompt}
                                        groq={groq} // Pass initialized Groq SDK
                                        displayTopic={displayTopic}
                                        isPlayful={isPlayful}
                                        isDisabled={isCardPermanentlyDisabled} // Chatbot also needs Groq key
                                    />
                                ) : null}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Visualization Section (Conditionally Rendered) */}
            {showVisualizationSection && (
                (() => {
                    const visCard = gridCardDefinitions.find(card => card.id === 'visualization');
                    if (!visCard) return null; // Should not happen, but safe guard
                    const isVisCardPermanentlyDisabled = visCard.apiKeyMissing;
                    const visCardTitle = isPlayful ? visCard.titlePlayful : visCard.title;
                    const visCardIcon = isPlayful ? visCard.iconPlayful : visCard.icon;

                    return (
                        // --- ADDED: ref to the container div ---
                        <div
                           ref={visualizationContainerRef} // Assign the ref here
                           className={`visualization-container content-card ${isVisCardPermanentlyDisabled ? 'disabled-card' : ''}`}
                        >
                            {/* Overlay for permanent disable */}
                            {isVisCardPermanentlyDisabled && <div className="api-key-missing-overlay">API Key Missing</div>}

                            {/* Card Header */}
                            <div className="card-header">
                                <span className="card-icon" role="img" aria-label={`${visCardTitle} icon`}>{visCardIcon}</span>
                                <h3 className="card-title">{selectedNodeLabel ? `${selectedNodeLabel} Visualization` : visCardTitle}</h3>
                            </div>

                            {/* Visualization Generation Error (Only show if not permanently disabled) */}
                            {visError && !isVisCardPermanentlyDisabled && <p className="error-message small">Visualization Error: {visError}</p>}

                            {/* Card Content Area for Visualization */}
                            <div className="card-content-area">
                                <VisualizationViewer
                                    htmlContent={visualizationHtml}
                                    isLoading={isVisLoading} // Pass visualization loading state
                                    error={visError} // Pass visualization error state
                                    isDisabled={isVisCardPermanentlyDisabled} // Pass permanent disable state
                                />
                            </div>
                        </div>
                    );
                })() // Immediately invoke the function
            )}
        </div> // End app-container
    );
    // -----------------------------
}

export default App;
