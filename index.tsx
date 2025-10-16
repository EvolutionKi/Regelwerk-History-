import React, { useState, useRef, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

function App() {
    // State management
    const [mainFile, setMainFile] = useState(null);
    const [skeletonFile, setSkeletonFile] = useState(null);
    const [denseFile, setDenseFile] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [activeTab, setActiveTab] = useState('analysis');
    const [statusMessage, setStatusMessage] = useState('');
    const [reconstructionPlan, setReconstructionPlan] = useState('');
    const [reconstructedData, setReconstructedData] = useState('');
    const [progress, setProgress] = useState(0);
    const [reconstructionLog, setReconstructionLog] = useState([]);
    const [stats, setStats] = useState({
        totalRules: 0,
        reconstructedRules: 0,
        versionsProcessed: 0,
        semanticDepth: 0
    });

    // Refs for file inputs
    const mainInputRef = useRef(null);
    const skeletonInputRef = useRef(null);
    const denseInputRef = useRef(null);

    // File handling functions
    const handleFileSelection = (event, setFileFunction) => {
        const selectedFiles = Array.from(event.target.files);
        if (selectedFiles.length > 0) {
            setFileFunction(selectedFiles[0]);
        }
    };

    const handleDrop = (event, setFileFunction) => {
        event.preventDefault();
        event.currentTarget.classList.remove('drag-over');
        
        const droppedFiles = Array.from(event.dataTransfer.files);
        if (droppedFiles.length > 0) {
            setFileFunction(droppedFiles[0]);
        }
    };

    const handleDragOver = (event) => {
        event.preventDefault();
        event.currentTarget.classList.add('drag-over');
    };

    const handleDragLeave = (event) => {
        event.preventDefault();
        event.currentTarget.classList.remove('drag-over');
    };

    const removeMainFile = () => setMainFile(null);
    const removeSkeletonFile = () => setSkeletonFile(null);
    const removeDenseFile = () => setDenseFile(null);

    // File reading utility
    const readFileContent = (file) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = reject;
            reader.readAsText(file);
        });
    };

    // Logging function
    const addLogEntry = (message, type = 'info') => {
        const timestamp = new Date().toLocaleTimeString();
        setReconstructionLog(prev => [...prev, { 
            message: `[${timestamp}] ${message}`, 
            type 
        }]);
    };

    // Core reconstruction function
    const startReconstruction = async () => {
        if (!mainFile) {
            setStatusMessage('Bitte laden Sie die Haupt-Chatverlauf-Datei hoch.');
            return;
        }

        setIsLoading(true);
        setProgress(0);
        setReconstructionLog([]);
        setReconstructedData('');
        setReconstructionPlan('');
        setStatusMessage('Starte semantische Rekonstruktion...');

        try {
            // Read all file contents
            addLogEntry('Lade Dateiinhalte...');
            setProgress(10);

            const mainContent = await readFileContent(mainFile);
            let skeletonContent = '';
            let denseContent = '';

            if (skeletonFile) {
                skeletonContent = await readFileContent(skeletonFile);
            }
            if (denseFile) {
                denseContent = await readFileContent(denseFile);
            }

            addLogEntry('Analysiere Regelwerk-Struktur...');
            setProgress(30);

            // Prepare the reconstruction prompt
            const prompt = `EVOKI REGELWERK-SEMANTISCHE REKONSTRUKTION

HAUPTDATEI (Chatverlauf mit Versionen 1.0-2.8.R):
${mainContent.substring(0, 5000)}... [Gesamtlänge: ${mainContent.length} Zeichen]

${skeletonFile ? `SKELETT-FORMAT (Komplette Regelliste, oberflächlich):
${skeletonContent.substring(0, 3000)}...` : 'KEIN SKELETT-FORMAT VORHANDEN'}

${denseFile ? `DICHTES FORMAT (Wenige Regeln, volle Tiefe):
${denseContent.substring(0, 3000)}...` : 'KEIN DICHTERES FORMAT VORHANDEN'}

REKONSTRUKTIONS-AUFGABE:

1. STRUKTURANALYSE: Analysiere das Muster aus dem dichten Format - wie werden "Was", "Warum", "Wie" für vollständig dokumentierte Regeln beschrieben?

2. MUSTERERKENNUNG: Lerne die semantische Transformationsregel:
   - Wie wird aus einer oberflächlichen Regel (nur "Was") eine tiefe Regel ("Was", "Warum", "Wie")?
   - Welche Sprachmuster, Formulierungen und Strukturen werden verwendet?

3. SEMANTISCHE REKONSTRUKTION: Wende das gelernte Muster auf ALLE Regeln im Skelett-Format an, um die fehlende Tiefe zu ergänzen.

4. VERSIONSPROZESS: Berücksichtige die chronologische Entwicklung der Regeln über die Versionen 1.0-2.8.R.

GENERIERE FOLGENDE AUSGABEN:

1. REKONSTRUKTIONSPLAN (JavaScript):
- Eine \`processReconstruction(mainContent, skeletonContent, denseContent)\` Funktion.
- Implementiere die Mustererkennung und semantische Ergänzung.
- Gib das vollständig rekonstruierte Regelwerk als JSON-Objekt zurück.

2. REKONSTRUIERTE DATEN (JSON):
- Vollständiges Regelwerk mit allen Versionen als JSON-String.
- Jede Regel mit voller semantischer Tiefe ("Was", "Warum", "Wie").
- Berücksichtige die historische Entwicklung.

Antworte im folgenden JSON-Format:
{
    "plan": "JavaScript-Code hier...",
    "data": "JSON-String der rekonstruierten Daten hier..."
}`;

            addLogEntry('Generiere Rekonstruktionslogik mit KI...');
            setProgress(50);

            const responseSchema = {
                type: Type.OBJECT,
                properties: {
                    plan: { type: Type.STRING },
                    data: { type: Type.STRING }
                },
                required: ["plan", "data"]
            };

            const response = await ai.models.generateContent({
                model: 'gemini-2.5-pro',
                contents: [{ parts: [{ text: prompt }] }],
                config: {
                    temperature: 0.1,
                    topK: 32,
                    topP: 0.8,
                    maxOutputTokens: 8192,
                    responseMimeType: "application/json",
                    responseSchema: responseSchema
                }
            });

            addLogEntry('Verarbeite KI-Antwort...');
            setProgress(70);

            const result = JSON.parse(response.text);
            
            setReconstructionPlan(result.plan);
            
            try {
                const parsedData = JSON.parse(result.data);
                setReconstructedData(JSON.stringify(parsedData, null, 2));
                
                const totalRules = countTotalRules(parsedData);
                const reconstructedRules = countReconstructedRules(parsedData);
                const versionsProcessed = countVersions(parsedData);
                const semanticDepth = calculateSemanticDepth(parsedData);
                
                setStats({
                    totalRules,
                    reconstructedRules,
                    versionsProcessed,
                    semanticDepth
                });
                
                addLogEntry(`Erfolg: ${totalRules} Regeln in ${versionsProcessed} Versionen analysiert.`, 'success');
            } catch (parseError) {
                addLogEntry(`Warnung: KI-Daten konnten nicht als JSON geparst werden: ${parseError.message}`, 'warning');
                setReconstructedData(result.data); // show raw data on error
                setStats({ totalRules: 0, reconstructedRules: 0, versionsProcessed: 0, semanticDepth: 0 });
            }

            setProgress(100);
            setStatusMessage('Semantische Rekonstruktion abgeschlossen! ✓');
            setActiveTab('analysis');

        } catch (error) {
            console.error('Fehler:', error);
            const errorMessage = error instanceof Error ? error.message : String(error);
            addLogEntry(`Fehler bei der Rekonstruktion: ${errorMessage}`, 'error');
            setStatusMessage(`Fehler: ${errorMessage}`);
        } finally {
            setIsLoading(false);
        }
    };

    // Helper functions for statistics
    const countTotalRules = (data) => {
        if (!data || typeof data !== 'object') return 0;
        let count = 0;
        Object.values(data).forEach(version => {
            if (version && version.rules && Array.isArray(version.rules)) {
                count += version.rules.length;
            }
        });
        return count;
    };

    const countReconstructedRules = (data) => {
        if (!data || typeof data !== 'object') return 0;
        let count = 0;
        Object.values(data).forEach(version => {
            if (version && version.rules && Array.isArray(version.rules)) {
                version.rules.forEach(rule => {
                    if (rule && rule.was && rule.warum && rule.wie) {
                        count++;
                    }
                });
            }
        });
        return count;
    };

    const countVersions = (data) => {
        if (!data || typeof data !== 'object') return 0;
        return Object.keys(data).length;
    };

    const calculateSemanticDepth = (data) => {
        let totalRules = 0;
        let rulesWithDepth = 0;
        if (!data || typeof data !== 'object') return 0;
        Object.values(data).forEach(version => {
            if (version && version.rules && Array.isArray(version.rules)) {
                version.rules.forEach(rule => {
                    if (rule) {
                       totalRules++;
                        if (rule.was && rule.warum && rule.wie) {
                            rulesWithDepth++;
                        } 
                    }
                });
            }
        });
        return totalRules > 0 ? Math.round((rulesWithDepth / totalRules) * 100) : 0;
    };

    // Execute reconstruction
    const executeReconstruction = async () => {
        if (!reconstructionPlan) {
            setStatusMessage('Kein Rekonstruktionsplan verfügbar.');
            return;
        }

        setIsLoading(true);
        setProgress(0);
        setReconstructionLog([]);
        setStatusMessage('Führe Rekonstruktion aus...');

        try {
            addLogEntry('Lade Dateien für Ausführung...');
            setProgress(20);

            const mainContent = await readFileContent(mainFile);
            const skeletonContent = skeletonFile ? await readFileContent(skeletonFile) : '';
            const denseContent = denseFile ? await readFileContent(denseFile) : '';

            addLogEntry('Führe Rekonstruktionsskript aus...');
            setProgress(60);
            
            let result;
            try {
                const processReconstruction = new Function('mainContent', 'skeletonContent', 'denseContent', `${reconstructionPlan}; return processReconstruction(mainContent, skeletonContent, denseContent);`);
                result = processReconstruction(mainContent, skeletonContent, denseContent);
            } catch (e) {
                throw new Error(`Skript-Fehler: ${e.message}`);
            }
            
            addLogEntry('Verarbeite Daten...');
            setProgress(80);

            const totalRules = countTotalRules(result);
            const reconstructedRules = countReconstructedRules(result);
            const versionsProcessed = countVersions(result);
            const semanticDepth = calculateSemanticDepth(result);
            
            setStats({ totalRules, reconstructedRules, versionsProcessed, semanticDepth });
            setReconstructedData(JSON.stringify(result, null, 2));
            
            addLogEntry(`Ausführung abgeschlossen: ${totalRules} Regeln verarbeitet`, 'success');
            setProgress(100);
            setStatusMessage('Rekonstruktion erfolgreich ausgeführt! ✓');
            setActiveTab('results');

        } catch (error) {
            console.error('Ausführungsfehler:', error);
            const errorMessage = error instanceof Error ? error.message : String(error);
            addLogEntry(`Ausführungsfehler: ${errorMessage}`, 'error');
            setStatusMessage(`Ausführungsfehler: ${errorMessage}`);
        } finally {
            setIsLoading(false);
        }
    };

    const downloadFile = (content, filename, mimeType) => {
         if (!content) {
            setStatusMessage(`Keine Daten zum Herunterladen für ${filename}.`);
            return;
        }
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        setStatusMessage(`${filename} heruntergeladen! ✓`);
    };

    const copyToClipboard = (text) => {
        if (!text) return;
        navigator.clipboard.writeText(text).then(() => {
            setStatusMessage('In Zwischenablage kopiert! ✓');
            setTimeout(() => setStatusMessage(''), 2000);
        });
    };
    
    // UI Rendering
    const renderFileItem = (file, onRemove, iconClass) => file && React.createElement("div", { className: "file-list" },
        React.createElement("div", { className: "file-item" },
            React.createElement("div", { className: "file-info" },
                React.createElement("i", { className: `fas ${iconClass} file-icon` }),
                React.createElement("span", null, `${file.name} (${(file.size / 1024 / (file.size > 1024*1024 ? 1024 : 1)).toFixed(2)} ${file.size > 1024*1024 ? 'MB' : 'KB'})`)
            ),
            React.createElement("button", { className: "remove-file", onClick: onRemove, title: "Datei entfernen" }, "×")
        )
    );

    const renderUploadArea = (title, description, iconClass, onDrop, onClick, inputRef, onSelect) => React.createElement("div", null,
        React.createElement("h3", null, title),
        React.createElement("div", { className: "upload-area", onDrop: onDrop, onDragOver: handleDragOver, onDragLeave: handleDragLeave, onClick: onClick },
            React.createElement("i", { className: `fas ${iconClass}` }),
            React.createElement("p", null, description),
            React.createElement("input", { ref: inputRef, type: "file", className: "file-input", onChange: onSelect })
        )
    );

    return React.createElement("div", { className: "container" },
        React.createElement("div", { className: "header" },
            React.createElement("h1", null, React.createElement("i", { className: "fas fa-robot" }), " Evoki Regelwerk-Rekonstruktor"),
            React.createElement("p", null, "Laden Sie die große Chatverlauf-Datei und optional Skelett/Dichte Formate hoch. Das System rekonstruiert automatisch die semantische Tiefe aller Regeln.")
        ),
        statusMessage && React.createElement("div", { className: `status-message ${statusMessage.includes('✓') ? 'status-success' : statusMessage.includes('Fehler') ? 'status-error' : 'status-info'}` }, statusMessage),
        React.createElement("div", { className: "upload-section" },
            React.createElement("h2", { className: "section-title" }, React.createElement("i", { className: "fas fa-file-upload" }), " Evoki Dateien hochladen"),
            React.createElement("div", { className: "upload-grid" },
                renderUploadArea("Haupt-Chatverlauf (Versionen 1.0-2.8.R)", "Große Chatverlauf-Datei hierher ziehen oder klicken", "fa-file-alt", e => handleDrop(e, setMainFile), () => mainInputRef.current?.click(), mainInputRef, e => handleFileSelection(e, setMainFile)),
                renderUploadArea("Skelett-Format (optional)", "Skelett-Datei hierher ziehen oder klicken", "fa-bone", e => handleDrop(e, setSkeletonFile), () => skeletonInputRef.current?.click(), skeletonInputRef, e => handleFileSelection(e, setSkeletonFile))
            ),
            renderUploadArea("Dichtes Format (optional)", "Dichte Datei hierher ziehen oder klicken", "fa-layer-group", e => handleDrop(e, setDenseFile), () => denseInputRef.current?.click(), denseInputRef, e => handleFileSelection(e, setDenseFile)),
            renderFileItem(mainFile, removeMainFile, "fa-file-alt"),
            renderFileItem(skeletonFile, removeSkeletonFile, "fa-bone"),
            renderFileItem(denseFile, removeDenseFile, "fa-layer-group"),
            React.createElement("button", { className: "generate-btn", onClick: startReconstruction, disabled: isLoading || !mainFile },
                isLoading ? React.createElement(React.Fragment, null, React.createElement("i", { className: "fas fa-spinner fa-spin" }), " Rekonstruktion läuft...") : React.createElement(React.Fragment, null, React.createElement("i", { className: "fas fa-magic" }), " Semantische Rekonstruktion starten")
            ),
            isLoading && React.createElement("div", { className: "progress-bar" },
                React.createElement("div", { className: "progress-fill", style: { width: `${progress}%` } }, `${progress}%`)
            )
        ),
        (reconstructionPlan || reconstructedData) && React.createElement("div", { className: "output-section" },
            React.createElement("div", { className: "tabs" },
                React.createElement("div", { className: `tab ${activeTab === 'analysis' ? 'active' : ''}`, onClick: () => setActiveTab('analysis') }, React.createElement("i", { className: "fas fa-chart-bar" }), " Analyse & Statistik"),
                React.createElement("div", { className: `tab ${activeTab === 'plan' ? 'active' : ''}`, onClick: () => setActiveTab('plan') }, React.createElement("i", { className: "fas fa-code" }), " Rekonstruktionsplan"),
                React.createElement("div", { className: `tab ${activeTab === 'results' ? 'active' : ''}`, onClick: () => setActiveTab('results') }, React.createElement("i", { className: "fas fa-database" }), " Rekonstruierte Daten"),
                React.createElement("div", { className: `tab ${activeTab === 'log' ? 'active' : ''}`, onClick: () => setActiveTab('log') }, React.createElement("i", { className: "fas fa-list" }), " Rekonstruktions-Log")
            ),
            React.createElement("div", { className: "tab-content" },
                activeTab === 'analysis' && React.createElement("div", null,
                    React.createElement("h3", null, "Rekonstruktions-Statistik"),
                    React.createElement("div", { className: "rule-stats" },
                        React.createElement("div", { className: "stat-card" }, React.createElement("div", { className: "stat-value" }, stats.totalRules), React.createElement("div", { className: "stat-label" }, "Gesamte Regeln")),
                        React.createElement("div", { className: "stat-card" }, React.createElement("div", { className: "stat-value" }, stats.reconstructedRules), React.createElement("div", { className: "stat-label" }, "Rekonstruierte Regeln")),
                        React.createElement("div", { className: "stat-card" }, React.createElement("div", { className: "stat-value" }, stats.versionsProcessed), React.createElement("div", { className: "stat-label" }, "Versionen verarbeitet")),
                        React.createElement("div", { className: "stat-card" }, React.createElement("div", { className: "stat-value" }, `${stats.semanticDepth}%`), React.createElement("div", { className: "stat-label" }, "Semantische Tiefe"))
                    ),
                    React.createElement("div", { style: { marginTop: '20px' } },
                        React.createElement("button", { className: "execute-btn", onClick: executeReconstruction, disabled: isLoading || !reconstructionPlan }, React.createElement("i", { className: "fas fa-play" }), " Rekonstruktion ausführen"),
                        React.createElement("button", { className: "download-btn", onClick: () => downloadFile(reconstructedData, 'evoki_rekonstruiert.json', 'application/json'), disabled: !reconstructedData }, React.createElement("i", { className: "fas fa-download" }), " Daten herunterladen")
                    )
                ),
                activeTab === 'plan' && reconstructionPlan && React.createElement("div", null,
                    React.createElement("h3", null, "Generierter Rekonstruktionsplan"),
                    React.createElement("div", { className: "code-block" }, React.createElement("button", { className: "copy-btn", onClick: () => copyToClipboard(reconstructionPlan) }, React.createElement("i", { className: "fas fa-copy" }), " Kopieren"), reconstructionPlan),
                    React.createElement("button", { className: "download-btn", onClick: () => downloadFile(reconstructionPlan, 'rekonstruktions_skript.js', 'text/javascript') }, React.createElement("i", { className: "fas fa-download" }), " Skript herunterladen")
                ),
                activeTab === 'results' && reconstructedData && React.createElement("div", null,
                    React.createElement("h3", null, "Rekonstruiertes Regelwerk"),
                    React.createElement("div", { className: "code-block" }, React.createElement("button", { className: "copy-btn", onClick: () => copyToClipboard(reconstructedData) }, React.createElement("i", { className: "fas fa-copy" }), " Kopieren"), reconstructedData),
                    React.createElement("button", { className: "download-btn", onClick: () => downloadFile(reconstructedData, 'evoki_rekonstruiert.json', 'application/json') }, React.createElement("i", { className: "fas fa-download" }), " JSON herunterladen")
                ),
                activeTab === 'log' && React.createElement("div", null,
                    React.createElement("h3", null, "Rekonstruktions-Log"),
                    React.createElement("div", { className: "reconstruction-log" },
                        reconstructionLog.length === 0 ? React.createElement("p", null, "Noch keine Log-Einträge.") :
                        reconstructionLog.map((entry, index) => React.createElement("div", { key: index, className: `log-entry log-${entry.type}` }, entry.message))
                    )
                )
            )
        )
    );
}

const root = createRoot(document.getElementById('root'));
root.render(React.createElement(App));