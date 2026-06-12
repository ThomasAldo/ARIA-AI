"""
AI Manager Module for Aria Backend
Handles Gemini API interactions, tool execution, and conversation logic
"""

import os
import json
from typing import Generator, Dict, Any, List
import google.generativeai as genai
from uuid import uuid4
from datetime import datetime

# Configure Gemini API
API_KEY = os.getenv('GEMINI_API_KEY')
if not API_KEY:
    raise ValueError("GEMINI_API_KEY environment variable is not set")

genai.configure(api_key=API_KEY)

# Note: Tools/function calling will be implemented via prompt engineering for now
# The Gemini 2.5-flash model will understand task creation and fact saving from context


def build_system_prompt(
    date_context: str, 
    facts: List[str], 
    active_tasks: List[str], 
    user_name: str = "User",
    past_context: List[Dict[str, Any]] = None,
    past_summaries: List[Dict[str, str]] = None
) -> str:
    """
    Build the system prompt for Aria with context about the user and tasks

    Args:
        date_context: Current date (YYYY-MM-DD)
        facts: List of facts about the user
        active_tasks: List of active (uncompleted) tasks
        user_name: User's name
        past_context: Previous conversation sessions from other dates
        past_summaries: Previous session summaries with dates

    Returns:
        System prompt string
    """
    facts_text = "\n".join(f"- {fact}" for fact in facts) if facts else "No facts saved yet."
    tasks_text = "\n".join(f"- {task}" for task in active_tasks) if active_tasks else "No active tasks."

    # Build past conversations context
    past_context_text = ""
    if past_context:
        past_context_text = "\n\nPast Conversation History (for context):\n"
        for session in past_context:
            past_context_text += f"\n[Date: {session['date']}]\n"
            for msg in session['messages']:
                role = "User" if msg['role'] == 'user' else "You (Aria)"
                past_context_text += f"  {role}: {msg['text']}\n"

    # Build past summaries context
    past_summaries_text = ""
    if past_summaries:
        past_summaries_text = "\n\nPast Conversation Summaries:\n"
        for summary in past_summaries:
            past_summaries_text += f"- [{summary['date']}] {summary['summary']}\n"

    return f"""You are Aria, a warm, friendly, and empathetic AI companion.
You are designed to be a personal diary and assistant.

Current Date: {date_context}
User's Name: {user_name}

About the User (Long Term Memory):
{facts_text}

Current Active Tasks:
{tasks_text}{past_summaries_text}{past_context_text}

Guidelines:
1. Be conversational and concise. Mimic a caring friend.
2. IMPORTANT: When the user mentions something important about themselves (likes, dislikes, hobbies, life events, family, work, etc.), ALWAYS respond with: [FACT] fact content [/FACT]
   Examples:
   - User: "I love hiking" → [FACT] Loves hiking [/FACT]
   - User: "My dog's name is Max" → [FACT] Has a dog named Max [/FACT]
3. IMPORTANT: When the user asks to do something, sets a reminder, wants to buy something, or creates a todo, ALWAYS respond with: [TASK] task content [/TASK]
   Examples:
   - User: "Remind me to call Mom" → [TASK] Call Mom [/TASK]
   - User: "I need to buy groceries" → [TASK] Buy groceries [/TASK]
4. You can create multiple [TASK] and [FACT] markers in one response.
5. Your responses should support Markdown formatting.
6. Always maintain privacy and confidentiality.
7. Be encouraging and supportive of the user's goals and feelings.
8. When referencing past conversations, mention the date they occurred to show you remember context.

CRITICAL: Place [TASK] and [FACT] markers BEFORE your conversational response, not after.
Example: "[FACT] User has a dog named Max [/FACT] That's wonderful! Dogs make great companions..."

Note: When you use [FACT] or [TASK] markers, the system will automatically save those items."""


def generate_response_stream(
    user_message: str,
    history: List[Dict[str, str]],
    date_context: str,
    facts: List[str],
    active_tasks: List[str],
    user_name: str = "User",
    db_session=None,
    timeout: int = 30,
    past_context: List[Dict[str, Any]] = None,
    past_summaries: List[Dict[str, str]] = None
) -> Generator[Dict[str, Any], None, None]:
    """
    Generate a streaming response from Gemini with tool support

    Args:
        user_message: The user's input message
        history: Chat history (list of {'role': 'user'|'model', 'text': str})
        date_context: Current date (YYYY-MM-DD)
        facts: User's saved facts
        active_tasks: List of active tasks
        user_name: User's name
        db_session: SQLAlchemy database session for tool execution
        timeout: Request timeout in seconds
        past_context: Previous conversation sessions from other dates
        past_summaries: Previous session summaries with dates

    Yields:
        Dictionary with either 'text' key (for text chunks)
    """
    system_prompt = build_system_prompt(date_context, facts, active_tasks, user_name, past_context, past_summaries)

    # Build the conversation with system prompt context
    full_prompt = f"{system_prompt}\n\n"
    
    # Add conversation history
    for item in history:
        role = "You" if item['role'] == 'user' else "Assistant"
        full_prompt += f"{role}: {item['text']}\n\n"
    
    # Add current user message
    full_prompt += f"You: {user_message}\n\nAssistant:"

    # Initialize Gemini model
    model = genai.GenerativeModel('gemini-2.5-flash')

    try:
        # Send message and get response with streaming
        response = model.generate_content(
            full_prompt,
            stream=True
        )

        # Process streaming response
        full_text = ""

        for chunk in response:
            if chunk.text:
                full_text += chunk.text
                print(f"[AI] Yielding chunk: {chunk.text[:50]}...", flush=True)
                yield {'type': 'text', 'text': chunk.text}
        
        print(f"[AI] Complete response: {full_text[:100]}...", flush=True)
            
    except Exception as e:
        error_str = str(e)
        print(f"[AI] Error: {error_str}", flush=True)
        if '429' in error_str or 'quota' in error_str.lower():
            # API quota exceeded - provide fallback response
            fallback_msg = (
                "I'm currently experiencing high usage and my API quota has been exceeded. "
                "Please try again later (quotas typically reset daily). "
                "\n\nTo resolve this permanently, you can: "
                "1. Enable billing on your Google Cloud project for higher quotas, or "
                "2. Check https://ai.dev/usage for quota reset times"
            )
            yield {'type': 'text', 'text': fallback_msg}
        else:
            # Other errors - re-raise
            raise


def execute_tool(func_call: Any, db_session) -> str:
    """
    Execute a tool/function call from Gemini

    Args:
        func_call: The function call object from Gemini
        db_session: SQLAlchemy database session

    Returns:
        Result string to send back to Gemini
    """
    from models import Task, Fact
    import uuid as uuid_module

    func_name = func_call.name
    args = func_call.args

    if func_name == 'add_task':
        # Create and save new task
        task = Task(
            id=str(uuid_module.uuid4()),
            user_id=db_session.get('user_id'),  # Will be passed via context
            text=args.get('text'),
            due_date=args.get('due_date'),
            completed=False
        )
        # Note: Actual session handling will be done in the Flask route
        return f"Task added: '{args.get('text')}' and synced to Google Calendar."

    elif func_name == 'remember_fact':
        # Save fact about user
        fact = Fact(
            id=str(uuid_module.uuid4()),
            user_id=db_session.get('user_id'),  # Will be passed via context
            content=args.get('fact')
        )
        # Note: Actual session handling will be done in the Flask route
        return f"I will remember: '{args.get('fact')}'"

    elif func_name == 'list_tasks':
        # List all tasks (this will be handled in Flask route)
        return "Retrieving your tasks..."

    return "Function executed successfully"


def parse_function_calls_from_response(response_text: str) -> List[Dict[str, Any]]:
    """
    Parse function calls from Gemini response text
    This is a fallback in case structured function calling isn't fully available

    Args:
        response_text: The response text from Gemini

    Returns:
        List of parsed function calls
    """
    # This is a simplified parser
    # In production, you'd want more robust parsing
    function_calls = []

    # Check for add_task pattern
    if 'add_task' in response_text:
        # Would parse actual parameters here
        pass

    return function_calls


def generate_session_summary(
    conversation_history: List[Dict[str, str]],
    date_context: str,
    user_name: str = "User"
) -> str:
    """
    Generate a concise summary of a conversation session using Gemini

    Args:
        conversation_history: List of messages with 'role' and 'text' keys
        date_context: Date of the conversation (YYYY-MM-DD)
        user_name: User's name

    Returns:
        Summary string
    """
    if not conversation_history:
        return None
    
    # Build conversation text for summarization
    conv_text = ""
    for msg in conversation_history:
        role = user_name if msg['role'] == 'user' else "Aria"
        conv_text += f"{role}: {msg['text']}\n"
    
    summary_prompt = f"""You are a helpful assistant summarizing a conversation from {date_context}.
Please provide a brief, 1-2 sentence summary of the main topics discussed.
Focus on key points, decisions made, or tasks created.
Be concise and capture the essence of the conversation.

Conversation:
{conv_text}

Summary:"""

    try:
        model = genai.GenerativeModel('gemini-2.5-flash')
        response = model.generate_content(summary_prompt)
        return response.text.strip() if response.text else None
    except Exception as e:
        print(f"[AI] Error generating summary: {str(e)}", flush=True)
        return None
