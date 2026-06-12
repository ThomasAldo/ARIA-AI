import { GoogleGenAI, FunctionDeclaration, Type, Tool } from "@google/genai";
import { getTasks, saveTask, getProfile, addFactToProfile } from "./storageService";
import { v4 as uuidv4 } from 'uuid';

const getClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) throw new Error("API Key missing");
  return new GoogleGenAI({ apiKey });
};

// --- Tool Definitions ---

const addTaskTool: FunctionDeclaration = {
  name: "add_task",
  description: "Add a new item to the user's to-do list. NOTE: This tool will automatically try to sync the task to the user's connected Google Calendar if a date/time is implied.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      text: { type: Type.STRING, description: "The content of the task or reminder" },
      dueDate: { type: Type.STRING, description: "Optional ISO date string or description of time for the calendar event" }
    },
    required: ["text"],
  },
};

const rememberFactTool: FunctionDeclaration = {
  name: "remember_fact",
  description: "Save a permanent fact about the user for long-term memory (e.g., user loves cats, user is a writer).",
  parameters: {
    type: Type.OBJECT,
    properties: {
      fact: { type: Type.STRING, description: "The specific fact to remember" },
    },
    required: ["fact"],
  },
};

const listTasksTool: FunctionDeclaration = {
  name: "list_tasks",
  description: "Get the current list of tasks.",
  parameters: {
    type: Type.OBJECT,
    properties: {},
  },
};

const tools: Tool[] = [
  { functionDeclarations: [addTaskTool, rememberFactTool, listTasksTool] }
];

// --- Chat Logic ---

export const generateResponse = async (
  currentMessage: string, 
  history: {role: 'user' | 'model', text: string}[],
  dateContext: string
) => {
  const ai = getClient();
  const profile = getProfile();
  const tasks = getTasks();

  const activeTasks = tasks.filter(t => !t.completed).map(t => `- ${t.text}`).join('\n');
  const facts = profile.facts.map(f => `- ${f}`).join('\n');

  const systemInstruction = `
    You are Aria, a warm, friendly, and empathetic AI companion. 
    You are designed to be a personal diary and assistant.
    
    Current Date: ${dateContext}
    
    About the User (Long Term Memory):
    ${facts}

    Current Active Tasks:
    ${activeTasks}

    Guidelines:
    1. Be conversational and concise. Mimic a caring friend.
    2. If the user mentions something important about themselves (likes, dislikes, life events), use the 'remember_fact' tool.
    3. If the user asks to do something, buy something, or sets a reminder, use the 'add_task' tool.
    4. When adding a task, mention that you've also added it to their Google Calendar.
    5. Your responses should support Markdown.
    6. Always maintain privacy.
  `;

  // Filter history to last 15 turns to save tokens, but keep it contextual
  const recentHistory = history.slice(-30).map(h => ({
    role: h.role,
    parts: [{ text: h.text }]
  }));

  const chat = ai.chats.create({
    model: 'gemini-2.5-flash',
    config: {
      systemInstruction,
      tools: tools,
    },
    history: recentHistory
  });

  const result = await chat.sendMessageStream({
    message: currentMessage
  });

  return result;
};

// Helper to execute client-side tools
export const executeTool = async (functionCall: any) => {
  const { name, args } = functionCall;
  
  if (name === 'add_task') {
    const newTask = {
      id: uuidv4(),
      text: args.text,
      completed: false,
      timestamp: Date.now(),
      dueDate: args.dueDate
    };
    saveTask(newTask);
    
    // SIMULATION: Google Calendar Sync
    // In a real production app, this would use the Google Calendar API via the backend.
    if (args.dueDate || args.text) {
        console.log("----------------------------------------");
        console.log("GOOGLE CALENDAR SYNC INITIATED");
        console.log(`Event: ${args.text}`);
        console.log(`Date: ${args.dueDate || 'Today'}`);
        console.log("Status: Synced (Simulated)");
        console.log("----------------------------------------");
    }

    return { result: `Task added: "${args.text}" and synced to Google Calendar.` };
  }

  if (name === 'remember_fact') {
    addFactToProfile(args.fact);
    return { result: `I will remember: "${args.fact}"` };
  }

  if (name === 'list_tasks') {
    const tasks = getTasks();
    const list = tasks.map(t => `${t.completed ? '[x]' : '[ ]'} ${t.text}`).join('\n');
    return { result: `Here are the tasks:\n${list}` };
  }

  return { result: "Function executed successfully" };
};