import React, { useState, useRef, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI, Type } from "@google/genai";

// Fix: Define types for the structured data to ensure type safety.
interface Rule {
    id: string;
    was: string;
    warum: string;
    wie: string;
    accepted?: boolean;
}

interface VersionRules {
    [ruleId: string]: Omit<Rule, 'id'>;
}

interface VersionData {
    rules: VersionRules;
}

interface ReconstructedData {
    versions: {
        [version: string]: VersionData;
    }
}


const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

function App() {
    // State management
    const [mainFile, setMainFile] = useState(null);
    const [skeletonFile, setSkeletonFile] = useState(null);
    const [denseFile, setDenseFile] = useState(null);
    const [indexFile, setIndexFile] = useState(null);
    const [processOnlyAccepted, setProcessOnlyAccepted] = useState(false); // New state for acceptance filter
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
    const indexInputRef = useRef(null);

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
    const removeIndexFile = () => {
        setIndexFile(null);
        setProcessOnlyAccepted(false); // Reset toggle when file is removed
    };

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
    
    // Helper to filter rules based on "accepted: true"
    const filterAcceptedRules = (data) => {
        const filteredData = { meta: data.meta, versions: {} };
        let originalCount = 0;
        let filteredCount = 0;

        for (const versionKey in data.versions) {
            const version = data.versions[versionKey];
            const filteredRules = {};
            let hasAcceptedRules = false;

            for (const ruleKey in version.rules) {
                originalCount++;
                const rule = version.rules[ruleKey];
                if (rule.accepted === true) {
                    filteredRules[ruleKey] = rule;
                    hasAcceptedRules = true;
                    filteredCount++;
                }
            }

            if (hasAcceptedRules) {
                filteredData.versions[versionKey] = { rules: filteredRules };
            }
        }
        return { filteredData, originalCount, filteredCount };
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

        const callWithRetry = async (apiCall) => {
            const maxRetries = 3;
            const baseDelay = 1000;
            let lastError;

            for (let i = 0; i < maxRetries; i++) {
                try {
                    return await apiCall();
                } catch (error) {
                    lastError = error;
                    const errorMessage = error instanceof Error ? error.message : String(error);
                    const isRetryable = /500|UNKNOWN|UNAVAILABLE/i.test(errorMessage);

                    if (isRetryable && i < maxRetries - 1) {
                        const waitTime = baseDelay * Math.pow(2, i) + Math.random() * 200;
                        const waitSeconds = (waitTime / 1000).toFixed(1);
                        
                        const retryMessage = `[API Fehler] Versuch ${i + 1}/${maxRetries} fehlgeschlagen. Neuer Versuch in ${waitSeconds}s...`;
                        addLogEntry(retryMessage, 'warning');
                        setStatusMessage(`Verbindungsfehler. Starte neuen Versuch (${i + 2}/${maxRetries})...`);

                        await new Promise(resolve => setTimeout(resolve, waitTime));
                    } else {
                        throw error;
                    }
                }
            }
            throw lastError;
        };

        try {
            addLogEntry('Lade Dateiinhalte...');
            setProgress(10);

            const mainContent = await readFileContent(mainFile);
            const skeletonContent = skeletonFile ? await readFileContent(skeletonFile) : '';
            const denseContent = denseFile ? await readFileContent(denseFile) : '';
            let indexContent = indexFile ? await readFileContent(indexFile) : '';

            if (indexFile && processOnlyAccepted && indexContent) {
                addLogEntry('Filtere Regel-Index: Verarbeite nur Regeln mit "accepted: true"...', 'info');
                try {
                    const parsedIndex = JSON.parse(indexContent as string);
                    const { filteredData, originalCount, filteredCount } = filterAcceptedRules(parsedIndex);
                    indexContent = JSON.stringify(filteredData, null, 2);
                    addLogEntry(`Filterung abgeschlossen: ${filteredCount} von ${originalCount} Regeln werden verarbeitet.`, 'success');
                } catch (e) {
                    addLogEntry('Fehler beim Filtern des Regel-Index. Verarbeite den gesamten Index.', 'warning');
                }
            }


            addLogEntry('Analysiere Regelwerk-Struktur...');
            setProgress(30);

            const prompt = `EVOKI REGELWERK-SEMANTISCHE REKONSTRUKTION

AUFGABE:
Du bist ein KI-Assistent, der darauf spezialisiert ist, ein versioniertes Regelwerk aus einem Chatverlauf zu rekonstruieren.
Analysiere die bereitgestellten Dateiinhalte, um ein vollständiges, strukturiertes JSON-Objekt des Regelwerks zu erstellen.

KONTEXTDATEIEN:

1.  **HAUPTDATEI (Primärquelle):**
    Ein langer Chatverlauf, der die Entwicklung des Regelwerks von Version 1.0 bis 2.8.R dokumentiert.
    ---
    ${String(mainContent).substring(0, 15000)}...
    ---

2.  **SKELETT-FORMAT (Strukturübersicht, falls vorhanden):**
    Eine Liste aller Regeln, aber nur mit oberflächlichen "Was"-Beschreibungen.
    ---
    ${skeletonFile ? String(skeletonContent).substring(0, 5000) + '...' : 'Nicht vorhanden.'}
    ---

3.  **DICHTES FORMAT (Tiefenbeispiel, falls vorhanden):**
    Einige wenige Regeln, die vollständig mit "Was" (Der exakte Wortlaut), "Warum" (Die Seele), und "Wie" (Die Funktion) beschrieben sind. Dies dient als Musterbeispiel.
    ---
    ${denseFile ? String(denseContent).substring(0, 5000) + '...' : 'Nicht vorhanden.'}
    ---
${indexFile ? `
4.  **VORSTRUKTURIERTER INDEX (Starke Anleitung):**
    Dies ist eine bereits extrahierte JSON-Struktur aus einer Offline-Build-Pipeline. Nutze sie als primäre Grundlage für die Rekonstruktion.
    ${processOnlyAccepted ? `HINWEIS: Dieser Index wurde VOR-GEFILTERT und enthält nur Regeln, die manuell als "accepted": true markiert wurden. Konzentriere dich ausschließlich auf diese Regeln.` : ''}
    ---
    ${String(indexContent).substring(0, 8000)}...
    ---
` : ''}

REKONSTRUKTIONSSCHRITTE:
${indexFile ? `
1.  **Index als Basis nehmen:** Deine Hauptaufgabe ist es, den bereitgestellten "VORSTRUKTURIERTEN INDEX" zu vervollständigen. Die Struktur (Versionen, Regel-IDs) ist bereits korrekt.
2.  **Tiefe ergänzen:** Gehe jede Regel im Index durch. Lies den Kontext in der "HAUPTDATEI", um die semantische Tiefe zu verstehen, und fülle die Felder "warum" (die Absicht, Seele) und "wie" (die Funktion, Umsetzung) präzise und vollständig aus.
3.  **Wortlaut validieren:** Stelle sicher, dass das "was" oder "wortlaut"-Feld mit dem finalen Zustand in der "HAUPTDATEI" übereinstimmt. Korrigiere bei Bedarf.
4.  **JSON generieren:** Erstelle das finale, vollständige JSON-Objekt basierend auf dem angereicherten Index.
` : `
1.  **Muster lernen:** Analysiere das "Dichte Format" (falls vorhanden), um zu verstehen, wie eine vollständige Regel mit "was"/"wortlaut", "warum"/"seele" und "wie"/"funktion" strukturiert ist. Lerne die semantische Tiefe und den typischen Sprachstil.
2.  **Struktur extrahieren:** Identifiziere alle Versionen (z.B. "1.0", "1.1", ...) und die dazugehörigen Regeln aus der "HAUPTDATEI" und dem "SKELETT-FORMAT".
3.  **Tiefe ergänzen:** Wende das gelernte Muster auf ALLE Regeln an. Für jede Regel, die nur eine oberflächliche Beschreibung hat, musst du die fehlenden "Warum"- und "Wie"-Teile semantisch sinnvoll aus dem Kontext des gesamten Chatverlaufs ("HAUPTDATEI") rekonstruieren.
4.  **JSON generieren:** Erstelle ein einziges, valides JSON-Objekt, das das gesamte Regelwerk abbildet.
`}

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
Oder, falls der Input-Index das Format "wortlaut", "seele", "funktion" nutzt, passe das Output-Format entsprechend an.

Antworte ausschließlich mit dem finalen, vollständigen JSON-String. Kein einleitender Text, keine Erklärungen, nur der JSON-Code.`;


            addLogEntry('Generiere rekonstruierte Daten mit KI...');
            setProgress(50);

            const response = await callWithRetry(async () => {
                return await ai.models.generateContent({
                    model: 'gemini-2.5-pro',
                    contents: [{ parts: [{ text: prompt }] }],
                    config: {
                        temperature: 0.1,
                        topK: 32,
                        topP: 0.8,
                        maxOutputTokens: 65536,
                        responseMimeType: "application/json",
                    }
                });
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
                setProgress(100);
                setStatusMessage('Semantische Rekonstruktion abgeschlossen! ✓');
                setActiveTab('results');
            } catch (parseError) {
                const errorDetails = `Fehler beim Parsen der KI-Antwort: ${parseError.message}. Dies geschieht oft, wenn die Antwort zu lang ist und abgeschnitten wird. Die unvollständige Antwort wird zur Analyse im Ergebnis-Tab angezeigt.`;
                addLogEntry(errorDetails, 'error');
                console.error("Unparsable JSON response from AI:", response.text);
                
                setReconstructedData(response.text);
                setStats({ totalRules: 0, reconstructedRules: 0, versionsProcessed: 0, semanticDepth: 0 });
                setStatusMessage('Fehler: Die KI-Antwort war kein valides JSON.');
                setActiveTab('results');
            }

        } catch (error) {
            console.error('Fehler:', error);
            const errorMessage = error instanceof Error ? error.message : String(error);
            addLogEntry(`Fehler bei der Rekonstruktion: ${errorMessage}`, 'error');
            setStatusMessage(`Fehler: ${errorMessage}`);
        } finally {
            setIsLoading(false);
        }
    };
    
    const countRulesFromLegacy = (version) => {
        return version.rules && Array.isArray(version.rules) ? version.rules.length : 0;
    };
    
    const countRulesFromNewIndex = (version) => {
         return version.rules && typeof version.rules === 'object' ? Object.keys(version.rules).length : 0;
    };

    const countTotalRules = (data) => {
        if (!data || typeof data !== 'object') return 0;
        let count = 0;
        const dataToProcess = data.versions || data; // Handle both index and final format
        Object.values(dataToProcess).forEach((version : any) => {
            if(version) {
               count += countRulesFromLegacy(version) + countRulesFromNewIndex(version);
            }
        });
        return count;
    };
    
    const isRuleComplete = (rule) => {
        const legacy = rule.was && rule.warum && rule.wie;
        const newFormat = rule.wortlaut && rule.seele && rule.funktion;
        return legacy || newFormat;
    };

    const countReconstructedRules = (data) => {
        if (!data || typeof data !== 'object') return 0;
        let count = 0;
        const dataToProcess = data.versions || data; // Handle both index and final format
         Object.values(dataToProcess).forEach((version : any) => {
            if(version) {
                if (version.rules && Array.isArray(version.rules)) { // Legacy format
                    version.rules.forEach(rule => {
                        if (rule && isRuleComplete(rule)) count++;
                    });
                } else if (version.rules && typeof version.rules === 'object') { // New index format
                     Object.values(version.rules).forEach(rule => {
                        if (rule && isRuleComplete(rule)) count++;
                    });
                }
            }
        });
        return count;
    };

    const countVersions = (data) => {
        if (!data || typeof data !== 'object') return 0;
        const dataToProcess = data.versions || data;
        return Object.keys(dataToProcess).length;
    };

    const calculateSemanticDepth = (data) => {
        const total = countTotalRules(data);
        const reconstructed = countReconstructedRules(data);
        return total > 0 ? Math.round((reconstructed / total) * 100) : 0;
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
    
    const renderAcceptanceToggle = () => indexFile && React.createElement("div", { className: "toggle-container" },
        React.createElement("label", { htmlFor: "acceptance-toggle" }, "Nur 'akzeptierte' Regeln verarbeiten"),
        React.createElement("label", { className: "switch" },
            React.createElement("input", {
                type: "checkbox",
                id: "acceptance-toggle",
                checked: processOnlyAccepted,
                onChange: (e) => setProcessOnlyAccepted(e.target.checked)
            }),
            React.createElement("span", { className: "slider round" })
        )
    );


    return React.createElement("div", { className: "container" },
        React.createElement("div", { className: "header" },
            React.createElement("h1", null, React.createElement("i", { className: "fas fa-robot" }), " Evoki Regelwerk-Rekonstruktor"),
            React.createElement("p", null, "Laden Sie die große Chatverlauf-Datei und optional Skelett/Dichte Formate hoch. Das System rekonstruiert automatisch die semantische Tiefe aller Regeln.")
        ),
        statusMessage && React.createElement("div", { className: `status-message ${statusMessage.includes('✓') ? 'status-success' : statusMessage.includes('Fehler') ? 'status-error' : 'status-info'}`}, statusMessage),
        React.createElement("div", { className: "upload-section" },
            React.createElement("h2", { className: "section-title" }, React.createElement("i", { className: "fas fa-file-upload" }), " 1. Quelldateien hochladen"),
            renderUploadArea("Haupt-Chatverlauf-Datei (Erforderlich)", "Ziehen Sie die .txt-Datei hierher oder klicken Sie zum Auswählen. Dies ist die primäre Quelle für die Rekonstruktion.", "fa-file-alt", (e) => handleDrop(e, setMainFile), () => mainInputRef.current.click(), mainInputRef, (e) => handleFileSelection(e, setMainFile)),
            renderFileItem(mainFile, removeMainFile, 'fa-file-alt'),
            React.createElement("h3", { style: { marginTop: '20px', color: '#4a5568' } }, "Optionale Hilfsdateien"),
            React.createElement("div", { className: "upload-grid" },
                React.createElement("div", null,
                    renderUploadArea("Skelett-Format", "Eine Liste von Regeln, nur mit 'Was'-Beschreibungen.", "fa-bone", (e) => handleDrop(e, setSkeletonFile), () => skeletonInputRef.current.click(), skeletonInputRef, (e) => handleFileSelection(e, setSkeletonFile)),
                    renderFileItem(skeletonFile, removeSkeletonFile, 'fa-bone')
                ),
                React.createElement("div", null,
                    renderUploadArea("Dichtes Format", "Einige wenige Regeln, vollständig mit 'Was', 'Warum', 'Wie'.", "fa-compress-arrows-alt", (e) => handleDrop(e, setDenseFile), () => denseInputRef.current.click(), denseInputRef, (e) => handleFileSelection(e, setDenseFile)),
                    renderFileItem(denseFile, removeDenseFile, 'fa-compress-arrows-alt')
                ),
                 React.createElement("div", null,
                    renderUploadArea("Regel-Index (.json)", "Eine vorstrukturierte `RegelIndex.json` von der Build-Pipeline.", "fa-file-code", (e) => handleDrop(e, setIndexFile), () => indexInputRef.current.click(), indexInputRef, (e) => handleFileSelection(e, setIndexFile)),
                    renderFileItem(indexFile, removeIndexFile, 'fa-file-code'),
                    renderAcceptanceToggle()
                )
            ),
            React.createElement("button", { className: "generate-btn", onClick: startReconstruction, disabled: isLoading || !mainFile },
                isLoading ? 'Rekonstruiere...' : React.createElement("span", null, React.createElement("i", { className: "fas fa-cogs" }), " Rekonstruktion starten")
            )
        ),
        (isLoading || reconstructedData) && React.createElement("div", { className: "output-section" },
            React.createElement("div", { className: "tabs" },
                React.createElement("div", { className: `tab ${activeTab === 'analysis' ? 'active' : ''}`, onClick: () => setActiveTab('analysis') }, "Analyse & Log"),
                React.createElement("div", { className: `tab ${activeTab === 'results' ? 'active' : ''}`, onClick: () => setActiveTab('results') }, "Ergebnisse (JSON)")
            ),
            React.createElement("div", { className: "tab-content" },
                activeTab === 'analysis' && React.createElement("div", null,
                    isLoading && React.createElement("div", null,
                        React.createElement("div", { className: "progress-bar" },
                            React.createElement("div", { className: "progress-fill", style: { width: `${progress}%` } }, `${progress}%`)
                        ),
                        React.createElement("p", null, "Der Prozess kann einige Minuten dauern, bitte haben Sie Geduld.")
                    ),
                     React.createElement("div", { className: "rule-stats" },
                        React.createElement("div", { className: "stat-card" },
                            React.createElement("div", { className: "stat-value" }, stats.totalRules),
                            React.createElement("div", { className: "stat-label" }, "Regeln Insgesamt")
                        ),
                        React.createElement("div", { className: "stat-card" },
                            React.createElement("div", { className: "stat-value" }, stats.reconstructedRules),
                            React.createElement("div", { className: "stat-label" }, "Vollständig Rekonstruiert")
                        ),
                        React.createElement("div", { className: "stat-card" },
                            React.createElement("div", { className: "stat-value" }, stats.versionsProcessed),
                            React.createElement("div", { className: "stat-label" }, "Versionen Verarbeitet")
                        ),
                        React.createElement("div", { className: "stat-card" },
                            React.createElement("div", { className: "stat-value" }, `${stats.semanticDepth}%`),
                            React.createElement("div", { className: "stat-label" }, "Semantische Tiefe")
                        )
                    ),
                    React.createElement("h3", null, "Rekonstruktions-Log"),
                    React.createElement("div", { className: "reconstruction-log" },
                        reconstructionLog.map((log, index) => React.createElement("div", { key: index, className: `log-entry log-${log.type}` }, log.message))
                    )
                ),
                activeTab === 'results' && React.createElement("div", null,
                    React.createElement("div", { className: "code-block" },
                        React.createElement("button", { className: "copy-btn", onClick: () => copyToClipboard(reconstructedData) }, "Kopieren"),
                        reconstructedData ? React.createElement("pre", null, React.createElement("code", null, reconstructedData)) : "Noch keine Daten generiert."
                    ),
                    React.createElement("button", { className: "download-btn", onClick: () => downloadFile(reconstructedData, 'Regelwerk_Rekonstruktion.json', 'application/json'), disabled: !reconstructedData }, React.createElement("i", { className: "fas fa-download" }), " JSON Herunterladen")
                )
            )
        )
    );
}

const container = document.getElementById('root');
const root = createRoot(container);
root.render(React.createElement(App));