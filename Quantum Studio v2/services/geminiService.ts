import { GoogleGenAI } from "@google/genai";
import type { FileSystemTree, FileSystemNode, AITask, FileOperation, LogMessage, WorkspaceUiState } from '../types';

if (!process.env.API_KEY) {
    throw new Error("API_KEY environment variable not set");
}

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
const model = 'gemini-2.5-flash';

const serializeFileSystem = (tree: FileSystemTree): string => {
    let fileContents = "";
    const traverse = (node: FileSystemNode, path: string) => {
        if (node.type === 'file') {
            fileContents += `[START OF FILE: ${path}]\n`;
            fileContents += node.content;
            fileContents += `\n[END OF FILE: ${path}]\n\n`;
        } else if (node.type === 'folder') {
            const sortedChildren = Object.entries(node.children).sort(([nameA], [nameB]) => nameA.localeCompare(nameB));
            for (const [name, childNode] of sortedChildren) {
                traverse(childNode, path ? `${path}/${name}` : name);
            }
        }
    };

    traverse(tree, '');
    
    if (!fileContents) {
        return "The project is currently empty.\n";
    }
    
    return `Here is the current file structure and content:\n\n${fileContents}`;
};

const serializeTaskHistory = (tasks: AITask[]): string => {
    // Get recent tasks, oldest first, to build a chronological memory.
    const relevantTasks = tasks
        .filter(t => t.userPrompt && (t.assistantResponse || t.error))
        .slice(0, 10) // Limit to last 10 relevant tasks
        .reverse();

    if (relevantTasks.length === 0) return 'This is the first message in the conversation.';

    const historySummary = relevantTasks.map(task => {
        const userLine = `User: ${task.userPrompt}`;
        let assistantLines = [];

        if (task.assistantResponse) {
            assistantLines.push(`Assistant: ${task.assistantResponse.content}`);
            
            if (task.status === 'pending_confirmation' && task.assistantResponse.operations?.length > 0) {
                 assistantLines.push(`(System note: My proposed changes are currently pending user approval.)`);
            } else if (task.status === 'pending_blueprint_approval' && task.assistantResponse.blueprint) {
                assistantLines.push(`(System note: I have proposed a blueprint and am waiting for user approval before proceeding to code.)`);
            }
        }
        
        if (task.status === 'error' && task.error) {
            assistantLines.push(`(System note: I encountered an error. Error message: "${task.error}". I must not repeat this mistake.)`);
        }
        
        return `${userLine}\n${assistantLines.join('\n')}`;
    }).join('\n\n');

    if (!historySummary) return 'This is the first message in the conversation.';

    return `For context, here is the conversation history for this session. Pay close attention to system notes about errors or pending actions:\n${historySummary}\n\n---\n`;
};

const serializeLogs = (logs: LogMessage[]): string => {
    if (logs.length === 0) return "No recent console logs.";
    return logs.slice(0, 20).map(log => `[${log.level.toUpperCase()} at ${log.timestamp.toISOString()}] ${log.message}`).join('\n');
};

export const runTaskStream = async function* (
    prompt: string, 
    installedExtensions: string[], 
    fileSystem: FileSystemTree,
    taskHistory: AITask[],
    uiState: WorkspaceUiState,
    logs: LogMessage[],
    annotatedImageB64: string | null
): AsyncGenerator<string, void, undefined> {

    const systemInstruction = `You are "Quantum Architect," a world-class AI software architect and principal engineer integrated into the Quantum Code IDE. Your function is not to be a passive tool, but a driving architectural force.

---
**PRIMARY DIRECTIVE: PLAN-THEN-PROTOTYPE**

Your primary workflow is a two-step process: Plan, then Prototype.

1.  **PLANNING PHASE**: If the user provides a high-level, ambitious, or vague initial idea (e.g., "build a music player", "make an app like Obsidian.md", "create a drawing app"), you MUST NOT write code immediately. Instead, your first response MUST be a detailed "App Blueprint". This blueprint is your comprehensive plan for the application.

2.  **PROTOTYPING PHASE**: Only after the user approves your blueprint will you proceed to write code. You will receive a follow-up prompt containing the approved blueprint. Your job is then to execute that plan flawlessly. If the user's request is a small, incremental change to an existing project (e.g., "change the button color to blue", "fix this error"), you may skip the planning phase and directly generate file operations.

---
**BLUEPRINT RESPONSE FORMAT**

When you generate a blueprint, your response MUST adhere to this exact format:
1.  **Conversational Introduction**: A short message presenting the plan (e.g., "OK, here's a plan for how we'll prototype this app...").
2.  **Blueprint Separator**: A new line with the exact text: \`---JSON_BLUEPRINT---\`
3.  **JSON Block**: A single, valid JSON object matching the \`AppBlueprint\` schema:
    *   \`appName\`: A creative and fitting name for the app.
    *   \`features\`: An array of objects, each with a \`title\` and \`description\`.
    *   \`styleGuidelines\`: An array of objects, each with:
        *   \`category\`: One of "Color", "Layout", "Typography", "Iconography", "Animation".
        *   \`details\`: A string describing the style choice.
        *   \`colors\` (only for "Color" category): An array of hex color strings.

Example Blueprint JSON:
\`\`\`json
{
  "appName": "LocalMind",
  "features": [
    { "title": "Vault Init", "description": "Initialize a local folder to serve as the notes vault..." }
  ],
  "styleGuidelines": [
    { "category": "Color", "details": "A modern, dark theme with purple and blue accents.", "colors": ["#1E1E1E", "#3B82F6", "#8B5CF6"] }
  ]
}
\`\`\`

---
**CODING RESPONSE FORMAT**

When you are in the Prototyping Phase or handling an incremental request, your response MUST use this format:
1.  **Conversational Reply**: An explanation of the code you're providing.
2.  **Operations Separator**: A new line with the exact text: \`---JSON_OPERATIONS---\`
3.  **JSON Block**: A single, valid JSON object with an "operations" array.
    *   For each operation, you MUST include a \`description\` field: a concise, one-sentence summary in plain text of the changes made *for that specific file operation*.
    *   The 'content' field must be a valid, escaped JSON string.
    *   Do NOT add any text or markdown formatting (like \`\`\`json\`) after the separator.

---
**CORE PHILOSOPHY: Visionary Engineering**

Think like a seasoned, visionary principal engineer. Your goal is to vastly exceed the user's request, anticipating future needs and transforming simple ideas into robust, elegant, and powerful application features. You are expected to take creative liberties and make strong architectural decisions to ensure the final product is masterful.

---
**AUTONOMOUS MODE (Auto-Pilot)**

When the user prompt indicates you are in an autonomous or proactive mode (e.g., "Proactive AI Step"), your primary directive is to identify the single most impactful action and execute it via file operations.

---
**GUIDING PRINCIPLES & NON-NEGOTIABLE RULES**

1.  **Context is King**: Use visual and DOM context when provided.
2.  **Extreme Ambition & Complexity**: Trivial solutions are forbidden. Architect for scale.
3.  **Proactive Resource & Asset Management**: Source icons and images as needed.
4.  **Aggressive File & Folder Structuring**: Use folders like \`components\`, \`hooks\`, \`utils\`, etc.
5.  **Visually Masterful UI/UX**: Use advanced Tailwind CSS for stunning UIs.
6.  **Accessibility as a Cornerstone (a11y)**: Use semantic HTML and ARIA attributes.

---
**ENVIRONMENT & RESPONSE FORMAT**

*   **Entry Point**: The live preview renders ONLY \`src/App.tsx\`.
*   **React is Global**: Do not add \`import React from 'react';\`.
*   **CRITICAL PREVIEW CONSTRAINT (Bundling)**: The preview environment does **not** support module imports. Therefore, while you MUST create separate files for components for good organization (e.g., a \`CREATE_FILE\` operation for \`src/components/Button.tsx\`), you MUST **ALSO** update \`src/App.tsx\` to include the code from that new component. You are effectively "inlining" or "bundling" your components into \`App.tsx\` so the preview works. The user understands this is a previewer limitation and values the clean file structure you are creating.
`;
    
    const historyContext = serializeTaskHistory(taskHistory);
    const fileContext = serializeFileSystem(fileSystem);
    const extensionsContext = installedExtensions.length > 0
        ? `\n\n(Context: User has these extensions installed: [${installedExtensions.join(', ')}]. Acknowledge and use them where appropriate.)`
        : '';
    
    const realTimeContext = `
---
**REAL-TIME CONTEXT:**
- Current UI State: ${JSON.stringify(uiState)}
- Recent Console Logs:
${serializeLogs(logs)}
---
`;

    const fullPrompt = `${historyContext}${fileContext}${realTimeContext}\nUser prompt: ${prompt}${extensionsContext}`;

    const promptParts = [];
    promptParts.push({ text: fullPrompt });

    if (annotatedImageB64) {
        const base64Data = annotatedImageB64.split(',')[1];
        promptParts.push({
            inlineData: {
                mimeType: 'image/jpeg',
                data: base64Data,
            },
        });
    }

    const result = await ai.models.generateContentStream({
        model,
        contents: { parts: promptParts },
        config: {
            systemInstruction
        }
    });

    for await (const chunk of result) {
        yield chunk.text;
    }
};
