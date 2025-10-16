import React, { useState, useRef, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI, Type } from "@google/genai";

// Fix: Define types for the structured data to ensure type safety.
interface Rule {
    id: string;
    was: string;
    warum: string;
    wie: string;
}

interface Version {
    version: string;
    rules: Rule[];
}

type ReconstructedData = Record<string, Version>;

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

function App() {
    // State management
    const [mainFile, setMainFile] = useState(null);
    const [skeletonFile, setSkeletonFile] = useState(null);
    const [denseFile, setDenseFile] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [activeTab, setActiveTab] = useState('analysis');
    const [statusMessage, setStatusMessage] = useState('');
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
        setStatusMessage('Starte semantische Rekonstruktion...');

        try {
            // Read all file contents
            addLogEntry('Lade Dateiinhalte...');
            setProgress(10);

            const mainContent = await readFileContent(mainFile);
            const skeletonContent = skeletonFile ? await readFileContent(skeletonFile) : '';
            const denseContent = denseFile ? await readFileContent(denseFile) : '';

            addLogEntry('Analysiere Regelwerk-Struktur...');
            setProgress(30);

            // Prepare the reconstruction prompt
            const prompt = `EVOKI REGELWERK-SEMANTISCHE REKONSTRUKTION

AUFGABE:
Du bist ein KI-Assistent, der darauf spezialisiert ist, ein versioniertes Regelwerk aus einem Chatverlauf zu rekonstruieren.
Analysiere die bereitgestellten Dateiinhalte, um ein vollständiges, strukturiertes JSON-Objekt des Regelwerks zu erstellen.

KONTEXTDATEIEN:

1.  **HAUPTDATEI (Primärquelle):**
    Ein langer Chatverlauf, der die Entwicklung des Regelwerks von Version 1.0 bis 2.8.R dokumentiert.
    ---
    {/* Fix: Cast file content to string before using substring to avoid type errors. */}
    ${String(mainContent).substring(0, 15000)}...
    ---

2.  **SKELETT-FORMAT (Strukturübersicht, falls vorhanden):**
    Eine Liste aller Regeln, aber nur mit oberflächlichen "Was"-Beschreibungen.
    ---
    {/* Fix: Cast file content to string before using substring to avoid type errors. */}
    ${skeletonFile ? String(skeletonContent).substring(0, 5000) + '...' : 'Nicht vorhanden.'}
    ---

3.  **DICHTES FORMAT (Tiefenbeispiel, falls vorhanden):**
    Einige wenige Regeln, die vollständig mit "Was" (Der exakte Wortlaut), "Warum" (Die Seele), und "Wie" (Die Funktion) beschrieben sind. Dies dient als Musterbeispiel.
    ---
    {/* Fix: Cast file content to string before using substring to avoid type errors. */}
    ${denseFile ? String(denseContent).substring(0, 5000) + '...' : 'Nicht vorhanden.'}
    ---

REKONSTRUKTIONSSCHRITTE:

1.  **Muster lernen:** Analysiere das "Dichte Format" (falls vorhanden), um zu verstehen, wie eine vollständige Regel mit "Was", "Warum" und "Wie" strukturiert ist. Lerne die semantische Tiefe und den typischen Sprachstil.

2.  **Struktur extrahieren:** Identifiziere alle Versionen (z.B. "1.0", "1.1", ...) und die dazugehörigen Regeln aus der "HAUPTDATEI" und dem "SKELETT-FORMAT".

3.  **Tiefe ergänzen:** Wende das gelernte Muster auf ALLE Regeln an. Für jede Regel, die nur eine oberflächliche Beschreibung hat, musst du die fehlenden "Warum"- und "Wie"-Teile semantisch sinnvoll aus dem Kontext des gesamten Chatverlaufs ("HAUPTDATEI") rekonstruieren.

4.  **JSON generieren:** Erstelle ein einziges, valides JSON-Objekt, das das gesamte Regelwerk abbildet.

FINALES JSON-FORMAT:
Gib NUR das JSON-Objekt zurück. Das JSON-Objekt soll so strukturiert sein:
{
  "1.0": {
    "version": "1.0",
    "rules": [
      {
        "id": "Regel-1",
        "was": "Der exakte Wortlaut der Regel.",
        "warum": "Die Absicht oder der Zweck hinter der Regel.",
        "wie": "Die technische oder funktionale Umsetzung der Regel."
      }
    ]
  }
}

Antworte ausschließlich mit dem finalen, vollständigen JSON-String. Kein einleitender Text, keine Erklärungen, nur der JSON-Code.`;


            addLogEntry('Generiere rekonstruierte Daten mit KI...');
            setProgress(50);

            const response = await ai.models.generateContent({
                model: 'gemini-2.5-pro',
                contents: [{ parts: [{ text: prompt }] }],
                config: {
                    temperature: 0.1,
                    topK: 32,
                    topP: 0.8,
                    maxOutputTokens: 8192,
                    responseMimeType: "application/json",
                }
            });

            addLogEntry('Verarbeite KI-Antwort...');
            setProgress(80);
            
            try {
                const parsedData = JSON.parse(response.text);
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
                
                addLogEntry(`Erfolg: ${totalRules} Regeln in ${versionsProcessed} Versionen rekonstruiert.`, 'success');
            } catch (parseError) {
                addLogEntry(`Warnung: KI-Daten konnten nicht als JSON geparst werden: ${parseError.message}`, 'warning');
                setReconstructedData(response.text); // show raw data on error
                setStats({ totalRules: 0, reconstructedRules: 0, versionsProcessed: 0, semanticDepth: 0 });
            }

            setProgress(100);
            setStatusMessage('Semantische Rekonstruktion abgeschlossen! ✓');
            setActiveTab('results'); // Go straight to results

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
    // Fix: Add type annotation for 'data' to resolve property access errors.
    const countTotalRules = (data: ReconstructedData) => {
        if (!data || typeof data !== 'object') return 0;
        let count = 0;
        Object.values(data).forEach(version => {
            if (version && version.rules && Array.isArray(version.rules)) {
                count += version.rules.length;
            }
        });
        return count;
    };

    // Fix: Add type annotation for 'data' to resolve property access errors.
    const countReconstructedRules = (data: ReconstructedData) => {
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

    // Fix: Add type annotation for 'data' to resolve property access errors.
    const countVersions = (data: ReconstructedData) => {
        if (!data || typeof data !== 'object') return 0;
        return Object.keys(data).length;
    };

    // Fix: Add type annotation for 'data' to resolve property access errors.
    const calculateSemanticDepth = (data: ReconstructedData) => {
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
        reconstructedData && React.createElement("div", { className: "output-section" },
            React.createElement("div", { className: "tabs" },
                React.createElement("div", { className: `tab ${activeTab === 'analysis' ? 'active' : ''}`, onClick: () => setActiveTab('analysis') }, React.createElement("i", { className: "fas fa-chart-bar" }), " Analyse & Statistik"),
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
                        React.createElement("button", { className: "download-btn", onClick: () => downloadFile(reconstructedData, 'evoki_rekonstruiert.json', 'application/json'), disabled: !reconstructedData }, React.createElement("i", { className: "fas fa-download" }), " Daten herunterladen")
                    )
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
