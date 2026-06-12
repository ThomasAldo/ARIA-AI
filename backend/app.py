"""
Aria Backend - Flask Application
Main API server for the Aria AI assistant
"""

import os
import jwt
import json
from datetime import datetime, timedelta
from uuid import uuid4
from flask import Flask, request, jsonify, Response
from flask_cors import CORS
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from dotenv import load_dotenv
from functools import wraps

# Load environment variables
load_dotenv()

# Import models and AI manager
from models import init_db, Base, User, Task, ChatSession, Message, Fact
from ai_manager import generate_response_stream, execute_tool

# Initialize Flask app
app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "http://localhost:5173"}})

# JWT Configuration
JWT_SECRET = os.getenv('JWT_SECRET_KEY', 'your-secret-key-change-in-production')
JWT_EXPIRATION_HOURS = int(os.getenv('JWT_EXPIRATION_HOURS', 24))

# Database setup
DATABASE_URL = os.getenv('DATABASE_URL', 'sqlite:///aria.db')
engine = init_db()
SessionLocal = sessionmaker(bind=engine)

# Global session management (for simplicity - use proper session handling in production)
_current_user_id = None


def generate_jwt_token(user_id: str, email: str) -> str:
    """Generate JWT token for user"""
    payload = {
        'user_id': user_id,
        'email': email,
        'exp': datetime.utcnow() + timedelta(hours=JWT_EXPIRATION_HOURS),
        'iat': datetime.utcnow()
    }
    return jwt.encode(payload, JWT_SECRET, algorithm='HS256')


def verify_jwt_token(token: str) -> dict:
    """Verify JWT token and return payload"""
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=['HS256'])
        return payload
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None


def token_required(f):
    """Decorator to require valid JWT token"""
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None
        
        # Check for token in Authorization header
        if 'Authorization' in request.headers:
            auth_header = request.headers['Authorization']
            try:
                token = auth_header.split(" ")[1]
            except IndexError:
                return jsonify({'error': 'Invalid Authorization header format'}), 401
        
        if not token:
            return jsonify({'error': 'Token is missing'}), 401
        
        payload = verify_jwt_token(token)
        if not payload:
            return jsonify({'error': 'Invalid or expired token'}), 401
        
        request.user_id = payload['user_id']
        request.email = payload['email']
        return f(*args, **kwargs)
    
    return decorated


def get_db_session() -> Session:
    """Get a database session"""
    return SessionLocal()


def get_or_create_user(user_id: str, email: str = None, name: str = None) -> User:
    """Get existing user or create a new one"""
    db = get_db_session()
    user = db.query(User).filter(User.id == user_id).first()

    if not user:
        user = User(
            id=user_id,
            email=email or f"user_{user_id}@aria.local",
            name=name or "User"
        )
        db.add(user)
        db.commit()

    db.close()
    return user


def get_user_context(user_id: str, date: str) -> tuple:
    """
    Get user context for AI generation
    Returns: (user, facts, active_tasks, session)
    """
    db = get_db_session()

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        db.close()
        return None, [], [], None

    # Get facts
    facts = [f.content for f in db.query(Fact).filter(Fact.user_id == user_id).all()]

    # Get active tasks
    active_tasks = db.query(Task).filter(
        Task.user_id == user_id,
        Task.completed == False
    ).all()
    active_tasks_list = [task.text for task in active_tasks]

    # Get or create chat session for the date
    chat_session = db.query(ChatSession).filter(
        ChatSession.user_id == user_id,
        ChatSession.date == date
    ).first()

    if not chat_session:
        chat_session = ChatSession(
            id=str(uuid4()),
            user_id=user_id,
            date=date
        )
        db.add(chat_session)
        db.commit()

    db.close()
    return user, facts, active_tasks_list, chat_session


# ============ API ENDPOINTS ============

@app.route('/api/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({'status': 'ok', 'message': 'Aria Backend is running'})


@app.route('/api/auth/signup', methods=['POST'])
def signup():
    """
    Sign up a new user with email and password
    Returns JWT token on success
    """
    try:
        data = request.json or {}
        email = data.get('email', '').strip()
        password = data.get('password', '').strip()
        name = data.get('name', 'User').strip()

        # Validate input
        if not email or '@' not in email:
            return jsonify({'error': 'Valid email is required'}), 400
        
        if not password or len(password) < 6:
            return jsonify({'error': 'Password must be at least 6 characters'}), 400

        db = get_db_session()
        
        # Check if user already exists
        existing_user = db.query(User).filter(User.email == email).first()
        if existing_user:
            db.close()
            return jsonify({'error': 'Email already registered'}), 400

        try:
            # Create new user
            user_id = str(uuid4())
            user = User(
                id=user_id,
                email=email,
                name=name or 'User'
            )
            user.set_password(password)
            
            db.add(user)
            db.commit()
            
            # Generate JWT token
            token = generate_jwt_token(user_id, email)
            
            return jsonify({
                'status': 'success',
                'message': 'User created successfully',
                'token': token,
                'user': {
                    'id': user.id,
                    'email': user.email,
                    'name': user.name
                }
            }), 201
        finally:
            db.close()

    except Exception as e:
        print(f'Signup error: {str(e)}')
        return jsonify({'error': f'Signup failed: {str(e)}'}), 500


@app.route('/api/auth/login', methods=['POST'])
def login():
    """
    Login with email and password
    Returns JWT token on success
    """
    try:
        data = request.json or {}
        email = data.get('email', '').strip()
        password = data.get('password', '').strip()

        # Validate input
        if not email or not password:
            return jsonify({'error': 'Email and password are required'}), 400

        db = get_db_session()
        
        try:
            # Find user by email
            user = db.query(User).filter(User.email == email).first()
            
            if not user or not user.check_password(password):
                db.close()
                return jsonify({'error': 'Invalid email or password'}), 401

            # Generate JWT token
            token = generate_jwt_token(user.id, user.email)
            
            return jsonify({
                'status': 'success',
                'message': 'Login successful',
                'token': token,
                'user': {
                    'id': user.id,
                    'email': user.email,
                    'name': user.name
                }
            }), 200
        finally:
            db.close()

    except Exception as e:
        print(f'Login error: {str(e)}')
        return jsonify({'error': f'Login failed: {str(e)}'}), 500


@app.route('/api/auth/verify', methods=['GET'])
@token_required
def verify_token():
    """
    Verify that the JWT token is valid
    """
    db = get_db_session()
    try:
        user = db.query(User).filter(User.id == request.user_id).first()
        if not user:
            return jsonify({'error': 'User not found'}), 404
        
        return jsonify({
            'status': 'valid',
            'user': {
                'id': user.id,
                'email': user.email,
                'name': user.name
            }
        }), 200
    finally:
        db.close()


@app.route('/api/state', methods=['GET'])
def get_state():
    """
    Get initial app state for the frontend
    Returns current day's messages, all active tasks, and user facts
    """
    # Get user_id from query params for backward compatibility
    # In a real app, use token-based auth
    user_id = request.args.get('user_id')
    date = request.args.get('date', datetime.now().strftime('%Y-%m-%d'))

    if not user_id:
        return jsonify({'error': 'user_id is required'}), 400

    db = get_db_session()

    try:
        # Get user
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            return jsonify({'error': 'User not found'}), 404

        # Get chat session for the date
        session = db.query(ChatSession).filter(
            ChatSession.user_id == user_id,
            ChatSession.date == date
        ).first()

        messages = []
        if session:
            messages = [msg.to_dict() for msg in session.messages]

        # Get all active tasks
        tasks = db.query(Task).filter(Task.user_id == user_id).all()
        tasks_list = [task.to_dict() for task in tasks]

        # Get facts
        facts = db.query(Fact).filter(Fact.user_id == user_id).all()
        facts_list = [fact.content for fact in facts]

        return jsonify({
            'messages': messages,
            'tasks': tasks_list,
            'facts': facts_list,
            'user': {
                'name': user.name,
                'email': user.email
            }
        }), 200

    finally:
        db.close()


@app.route('/api/chat', methods=['POST'])
def chat():
    """
    Chat endpoint with streaming support
    Accepts: { message: string, date: string, user_id: string }
    Returns: Server-Sent Events stream
    """
    data = request.json or {}
    user_message = data.get('message', '').strip()
    date = data.get('date', datetime.now().strftime('%Y-%m-%d'))
    user_id = data.get('user_id')

    print(f"[Chat] Received message from {user_id}: {user_message[:50]}...", flush=True)

    if not user_message:
        return jsonify({'error': 'message is required'}), 400
    
    if not user_id:
        return jsonify({'error': 'user_id is required'}), 400

    db = get_db_session()

    try:
        # Get user context
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            # Auto-create user if not found (for development/testing)
            print(f"[Chat] Creating user: {user_id}", flush=True)
            user = User(
                id=user_id,
                email=f"user_{user_id[:8]}@aria.local",
                name="User",
                password_hash=""
            )
            db.add(user)
            db.commit()

        # Get chat session
        session = db.query(ChatSession).filter(
            ChatSession.user_id == user_id,
            ChatSession.date == date
        ).first()

        if not session:
            session = ChatSession(
                id=str(uuid4()),
                user_id=user_id,
                date=date
            )
            db.add(session)
            db.commit()

        # Save user message
        user_msg = Message(
            id=str(uuid4()),
            session_id=session.id,
            role='user',
            text=user_message
        )
        db.add(user_msg)
        db.commit()

        # Get context for AI
        facts = [f.content for f in db.query(Fact).filter(Fact.user_id == user_id).all()]
        active_tasks = [t.text for t in db.query(Task).filter(
            Task.user_id == user_id,
            Task.completed == False
        ).all()]

        # Get message history from current session (last 20 messages for context)
        history_messages = db.query(Message).filter(
            Message.session_id == session.id
        ).order_by(Message.created_at).all()

        history = [
            {'role': msg.role, 'text': msg.text}
            for msg in history_messages[:-1]  # Exclude the message we just added
        ]

        # Get relevant past sessions for cross-date memory (last 5 days with conversations)
        past_sessions = db.query(ChatSession).filter(
            ChatSession.user_id == user_id,
            ChatSession.date != date  # Exclude current date
        ).order_by(ChatSession.updated_at.desc()).limit(5).all()

        # Build past context string and summaries
        past_context = []
        past_summaries = []
        for past_session in past_sessions:
            # Add summary if available
            if past_session.summary:
                past_summaries.append({
                    'date': past_session.date,
                    'summary': past_session.summary
                })
            
            # Get first 2 and last 2 messages from each past session as summary
            past_messages = db.query(Message).filter(
                Message.session_id == past_session.id
            ).order_by(Message.created_at).all()
            
            if len(past_messages) > 0:
                past_context.append({
                    'date': past_session.date,
                    'messages': [
                        {'role': msg.role, 'text': msg.text[:200]}  # Truncate to 200 chars
                        for msg in (past_messages[:2] + past_messages[-2:] if len(past_messages) > 4 else past_messages)
                    ]
                })

        # Store user info before closing session
        user_name = user.name

        db.close()

        # Generate streaming response
        def stream_response():
            ai_text = ""
            db_tool = get_db_session()

            try:
                for chunk in generate_response_stream(
                    user_message=user_message,
                    history=history,
                    date_context=date,
                    facts=facts,
                    active_tasks=active_tasks,
                    user_name=user_name,
                    db_session=db_tool,
                    past_context=past_context,  # Pass past conversations
                    past_summaries=past_summaries  # Pass past summaries
                ):
                    if chunk['type'] == 'text':
                        ai_text += chunk['text']
                        # Send as proper JSON
                        response_data = json.dumps({'type': 'text', 'text': chunk['text']})
                        yield f"data: {response_data}\n\n"

                # Parse and execute [TASK] and [FACT] markers from response
                import re
                
                # Extract tasks from [TASK] ... [/TASK] markers
                task_matches = re.findall(r'\[TASK\](.*?)\[/TASK\]', ai_text, re.DOTALL)
                created_tasks = []
                for task_text in task_matches:
                    task_text = task_text.strip()
                    if task_text:
                        task = Task(
                            id=str(uuid4()),
                            user_id=user_id,
                            text=task_text,
                            completed=False
                        )
                        db_tool.add(task)
                        created_tasks.append(task_text)
                        print(f"[Task] Created: {task_text[:50]}", flush=True)
                
                # Extract facts from [FACT] ... [/FACT] markers
                fact_matches = re.findall(r'\[FACT\](.*?)\[/FACT\]', ai_text, re.DOTALL)
                created_facts = []
                for fact_text in fact_matches:
                    fact_text = fact_text.strip()
                    if fact_text:
                        existing = db_tool.query(Fact).filter(
                            Fact.user_id == user_id,
                            Fact.content == fact_text
                        ).first()
                        
                        if not existing:
                            fact = Fact(
                                id=str(uuid4()),
                                user_id=user_id,
                                content=fact_text
                            )
                            db_tool.add(fact)
                            created_facts.append(fact_text)
                            print(f"[Fact] Learned: {fact_text[:50]}", flush=True)
                
                # Commit any changes
                if task_matches or fact_matches:
                    db_tool.commit()
                    # Send confirmation with count of created items
                    tool_summary = []
                    if created_tasks:
                        tool_summary.append(f"Created {len(created_tasks)} task(s)")
                    if created_facts:
                        tool_summary.append(f"Learned {len(created_facts)} fact(s)")
                    
                    response_data = json.dumps({
                        'type': 'tool_call',
                        'tool': 'auto_save',
                        'summary': ', '.join(tool_summary)
                    })
                    yield f"data: {response_data}\n\n"

                # Save AI response to database (without markers)
                clean_text = re.sub(r'\[TASK\](.*?)\[/TASK\]', '', ai_text, flags=re.DOTALL)
                clean_text = re.sub(r'\[FACT\](.*?)\[/FACT\]', '', clean_text, flags=re.DOTALL)
                clean_text = clean_text.strip()
                
                ai_msg = Message(
                    id=str(uuid4()),
                    session_id=session.id,
                    role='model',
                    text=clean_text
                )
                db_tool.add(ai_msg)
                db_tool.commit()
                
            finally:
                db_tool.close()

            yield "data: {\"type\": \"done\"}\n\n"

        return Response(stream_response(), mimetype='text/event-stream')

    except Exception as e:
        db.close()
        return jsonify({'error': str(e)}), 500


@app.route('/api/tasks', methods=['GET'])
def get_tasks():
    """Get all tasks for the user"""
    user_id = request.args.get('user_id')

    if not user_id:
        return jsonify({'error': 'user_id is required'}), 400

    db = get_db_session()
    try:
        tasks = db.query(Task).filter(Task.user_id == user_id).all()
        return jsonify([task.to_dict() for task in tasks]), 200
    finally:
        db.close()


@app.route('/api/tasks', methods=['POST'])
def create_task():
    """
    Create a new task manually
    Accepts: { text: string, dueDate?: string, user_id: string }
    """
    data = request.json or {}
    user_id = data.get('user_id')
    text = data.get('text', '').strip()
    due_date = data.get('dueDate')

    if not user_id or not text:
        return jsonify({'error': 'user_id and text are required'}), 400

    db = get_db_session()
    try:
        task = Task(
            id=str(uuid4()),
            user_id=user_id,
            text=text,
            due_date=due_date,
            completed=False
        )
        db.add(task)
        db.commit()
        return jsonify(task.to_dict()), 201
    finally:
        db.close()


@app.route('/api/tasks/<task_id>', methods=['PATCH'])
def update_task(task_id):
    """
    Update a task (toggle completion or delete)
    Accepts: { completed?: boolean, action?: 'delete' }
    """
    data = request.json or {}
    user_id = data.get('user_id')
    action = data.get('action')

    if not user_id:
        return jsonify({'error': 'user_id is required'}), 400

    db = get_db_session()
    try:
        task = db.query(Task).filter(
            Task.id == task_id,
            Task.user_id == user_id
        ).first()

        if not task:
            return jsonify({'error': 'Task not found'}), 404

        if action == 'delete':
            db.delete(task)
        else:
            # Toggle completion
            task.completed = data.get('completed', not task.completed)

        db.commit()
        return jsonify(task.to_dict() if action != 'delete' else {'status': 'deleted'}), 200
    finally:
        db.close()


@app.route('/api/facts', methods=['GET'])
def get_facts():
    """Get all facts for the user"""
    user_id = request.args.get('user_id')

    if not user_id:
        return jsonify({'error': 'user_id is required'}), 400

    db = get_db_session()
    try:
        facts = db.query(Fact).filter(Fact.user_id == user_id).all()
        return jsonify([fact.content for fact in facts]), 200
    finally:
        db.close()


@app.route('/api/facts', methods=['POST'])
def create_fact():
    """
    Create a new fact about the user
    Accepts: { content: string, user_id: string }
    """
    data = request.json or {}
    user_id = data.get('user_id')
    content = data.get('content', '').strip()

    if not user_id or not content:
        return jsonify({'error': 'user_id and content are required'}), 400

    db = get_db_session()
    try:
        # Check if fact already exists
        existing = db.query(Fact).filter(
            Fact.user_id == user_id,
            Fact.content == content
        ).first()

        if existing:
            return jsonify({'error': 'Fact already exists'}), 409

        fact = Fact(
            id=str(uuid4()),
            user_id=user_id,
            content=content
        )
        db.add(fact)
        db.commit()
        return jsonify({'id': fact.id, 'content': fact.content}), 201
    finally:
        db.close()


@app.route('/api/chat_sessions', methods=['GET'])
def get_chat_sessions():
    """
    Get all chat sessions for a user
    Query params: user_id (required)
    Returns: List of sessions with date, message count, and last updated
    """
    user_id = request.args.get('user_id')
    
    if not user_id:
        return jsonify({'error': 'user_id is required'}), 400
    
    db = get_db_session()
    try:
        sessions = db.query(ChatSession).filter(
            ChatSession.user_id == user_id
        ).order_by(ChatSession.date.desc()).all()
        
        result = []
        for session in sessions:
            message_count = db.query(Message).filter(Message.session_id == session.id).count()
            result.append({
                'id': session.id,
                'date': session.date,
                'title': session.title,  # Include title
                'message_count': message_count,
                'updated_at': session.updated_at.isoformat() if session.updated_at else None
            })
        
        return jsonify(result), 200
    finally:
        db.close()


@app.route('/api/chat_sessions/<session_id>', methods=['PATCH'])
def update_chat_session(session_id):
    """
    Update a chat session (rename title)
    Body: { user_id: string, title: string }
    """
    data = request.json or {}
    user_id = data.get('user_id')
    title = data.get('title', '').strip()
    
    if not user_id:
        return jsonify({'error': 'user_id is required'}), 400
    
    db = get_db_session()
    try:
        session = db.query(ChatSession).filter(
            ChatSession.id == session_id,
            ChatSession.user_id == user_id
        ).first()
        
        if not session:
            return jsonify({'error': 'Session not found'}), 404
        
        if title:
            session.title = title
            db.commit()
            print(f"[Session] Renamed: {title[:50]}", flush=True)
        
        return jsonify({
            'status': 'updated',
            'session_id': session_id,
            'title': session.title
        }), 200
    finally:
        db.close()


@app.route('/api/chat_sessions/<session_id>', methods=['DELETE'])
def delete_chat_session(session_id):
    """
    Delete a specific chat session and all its messages
    Body: { user_id: string }
    """
    data = request.json or {}
    user_id = data.get('user_id')
    
    if not user_id:
        return jsonify({'error': 'user_id is required'}), 400
    
    db = get_db_session()
    try:
        session = db.query(ChatSession).filter(
            ChatSession.id == session_id,
            ChatSession.user_id == user_id
        ).first()
        
        if not session:
            return jsonify({'error': 'Session not found'}), 404
        
        # Delete all messages in the session (cascade should handle this, but being explicit)
        db.query(Message).filter(Message.session_id == session_id).delete()
        
        # Delete the session
        db.delete(session)
        db.commit()
        
        return jsonify({'status': 'deleted', 'session_id': session_id}), 200
    finally:
        db.close()


@app.route('/api/chat_sessions/by_date', methods=['DELETE'])
def delete_chat_session_by_date():
    """
    Delete chat session(s) by date
    Body: { user_id: string, date: string (YYYY-MM-DD) }
    """
    data = request.json or {}
    user_id = data.get('user_id')
    date = data.get('date')
    
    if not user_id or not date:
        return jsonify({'error': 'user_id and date are required'}), 400
    
    db = get_db_session()
    try:
        session = db.query(ChatSession).filter(
            ChatSession.user_id == user_id,
            ChatSession.date == date
        ).first()
        
        if not session:
            return jsonify({'error': 'No session found for this date'}), 404
        
        # Delete all messages
        db.query(Message).filter(Message.session_id == session.id).delete()
        
        # Delete the session
        db.delete(session)
        db.commit()
        
        return jsonify({'status': 'deleted', 'date': date}), 200
    finally:
        db.close()


@app.route('/api/chat_sessions/clear_all', methods=['DELETE'])
def clear_all_chat_sessions():
    """
    Delete ALL chat sessions for a user
    Body: { user_id: string, confirm: boolean }
    """
    data = request.json or {}
    user_id = data.get('user_id')
    confirm = data.get('confirm', False)
    
    if not user_id:
        return jsonify({'error': 'user_id is required'}), 400
    
    if not confirm:
        return jsonify({'error': 'confirm must be true to delete all sessions'}), 400
    
    db = get_db_session()
    try:
        # Get all sessions for the user
        sessions = db.query(ChatSession).filter(ChatSession.user_id == user_id).all()
        session_ids = [s.id for s in sessions]
        
        # Delete all messages
        for session_id in session_ids:
            db.query(Message).filter(Message.session_id == session_id).delete()
        
        # Delete all sessions
        db.query(ChatSession).filter(ChatSession.user_id == user_id).delete()
        db.commit()
        
        return jsonify({'status': 'all_deleted', 'count': len(session_ids)}), 200
    finally:
        db.close()


@app.route('/api/chat_sessions/<session_id>/summary', methods=['POST'])
def save_session_summary(session_id):
    """
    Generate and save a summary for a chat session
    Body: { user_id: string }
    Returns: { session_id: string, summary: string }
    """
    data = request.json or {}
    user_id = data.get('user_id')
    
    if not user_id:
        return jsonify({'error': 'user_id is required'}), 400
    
    db = get_db_session()
    try:
        session = db.query(ChatSession).filter(
            ChatSession.id == session_id,
            ChatSession.user_id == user_id
        ).first()
        
        if not session:
            return jsonify({'error': 'Session not found'}), 404
        
        # Get all messages from the session
        messages = db.query(Message).filter(
            Message.session_id == session_id
        ).order_by(Message.created_at).all()
        
        if not messages:
            return jsonify({'error': 'No messages in session'}), 400
        
        # Convert to format for summarization
        history = [{'role': msg.role, 'text': msg.text} for msg in messages]
        
        # Generate summary
        from ai_manager import generate_session_summary
        summary = generate_session_summary(history, session.date)
        
        if not summary:
            return jsonify({'error': 'Failed to generate summary'}), 500
        
        # Save summary
        session.summary = summary
        db.commit()
        
        return jsonify({
            'session_id': session_id,
            'date': session.date,
            'summary': summary
        }), 200
    finally:
        db.close()


@app.route('/api/chat/search', methods=['GET', 'OPTIONS'])
def search_chat():
    """
    Search chat messages by keyword and optional date filter
    Query Params: 
      - user_id (required): User ID
      - q (required): Search query/keyword
      - date (optional): Specific date in YYYY-MM-DD format
      - start_date (optional): Date range start in YYYY-MM-DD format
      - end_date (optional): Date range end in YYYY-MM-DD format
    Returns: { results: [{ sessionId, date, title, snippet, role, timestamp }] }
    """
    if request.method == 'OPTIONS':
        return jsonify({'status': 'ok'}), 200

    user_id = request.args.get('user_id')
    query = request.args.get('q', '').strip().lower()
    date = request.args.get('date')
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')
    
    if not user_id:
        return jsonify({'error': 'user_id is required'}), 400
    
    if not query:
        return jsonify({'error': 'q (search query) is required'}), 400
    
    db = get_db_session()
    try:
        # Start with all messages from this user's sessions
        message_query = db.query(Message, ChatSession).join(
            ChatSession, Message.session_id == ChatSession.id
        ).filter(
            ChatSession.user_id == user_id,
            Message.text.ilike(f'%{query}%')  # Case-insensitive search
        )
        
        # Apply date filters
        if date:
            message_query = message_query.filter(ChatSession.date == date)
        else:
            if start_date:
                message_query = message_query.filter(ChatSession.date >= start_date)
            if end_date:
                message_query = message_query.filter(ChatSession.date <= end_date)
        
        # Execute query
        results = message_query.order_by(Message.created_at.desc()).all()
        
        # Format results
        formatted_results = []
        for msg, session in results:
            # Find the context snippet (truncate to 100 chars around the match)
            text_lower = msg.text.lower()
            match_idx = text_lower.find(query)
            
            snippet_start = max(0, match_idx - 30)
            snippet_end = min(len(msg.text), match_idx + len(query) + 30)
            snippet = msg.text[snippet_start:snippet_end]
            
            if snippet_start > 0:
                snippet = '...' + snippet
            if snippet_end < len(msg.text):
                snippet = snippet + '...'
            
            formatted_results.append({
                'sessionId': session.id,
                'date': session.date,
                'title': session.title or session.date,
                'snippet': snippet,
                'role': msg.role,
                'timestamp': int(msg.created_at.timestamp() * 1000) if msg.created_at else 0
            })
        
        return jsonify({'results': formatted_results}), 200
    finally:
        db.close()


@app.route('/api/chat_sessions/<session_id>/export', methods=['GET'])
def export_chat_session(session_id):
    """
    Export a chat session in different formats
    Query Params:
      - user_id (required): User ID
      - format (optional): 'txt', 'md', or 'json' (default: 'txt')
    Returns: File download or JSON
    """
    user_id = request.args.get('user_id')
    format_type = request.args.get('format', 'txt').lower()
    
    if not user_id:
        return jsonify({'error': 'user_id is required'}), 400
    
    if format_type not in ['txt', 'md', 'json']:
        return jsonify({'error': 'format must be txt, md, or json'}), 400
    
    db = get_db_session()
    try:
        session = db.query(ChatSession).filter(
            ChatSession.id == session_id,
            ChatSession.user_id == user_id
        ).first()
        
        if not session:
            return jsonify({'error': 'Session not found'}), 404
        
        # Get all messages from the session
        messages = db.query(Message).filter(
            Message.session_id == session_id
        ).order_by(Message.created_at).all()
        
        # Get user name for formatting
        user = db.query(User).filter(User.id == user_id).first()
        user_name = user.name if user else "User"
        
        if format_type == 'json':
            # Return JSON format
            export_data = {
                'session_id': session_id,
                'date': session.date,
                'title': session.title,
                'summary': session.summary,
                'exported_at': datetime.utcnow().isoformat(),
                'messages': [
                    {
                        'role': msg.role,
                        'text': msg.text,
                        'timestamp': msg.created_at.isoformat() if msg.created_at else None
                    }
                    for msg in messages
                ]
            }
            return jsonify(export_data), 200
        
        elif format_type == 'md':
            # Markdown format
            content = f"# Chat Export: {session.title or session.date}\n\n"
            content += f"**Date**: {session.date}\n"
            if session.summary:
                content += f"**Summary**: {session.summary}\n"
            content += f"**Exported**: {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')}\n\n"
            content += "---\n\n"
            
            for msg in messages:
                role = user_name if msg.role == 'user' else 'Aria'
                timestamp = msg.created_at.strftime('%H:%M') if msg.created_at else 'Unknown'
                content += f"**{role}** _{timestamp}_\n\n"
                content += f"{msg.text}\n\n"
            
            response = Response(content, mimetype='text/markdown')
            response.headers['Content-Disposition'] = f'attachment; filename="chat-export-{session.date}.md"'
            return response
        
        else:  # txt format
            # Plain text format
            content = f"CHAT EXPORT: {session.title or session.date}\n"
            content += f"Date: {session.date}\n"
            if session.summary:
                content += f"Summary: {session.summary}\n"
            content += f"Exported: {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')}\n"
            content += "=" * 70 + "\n\n"
            
            for msg in messages:
                role = user_name if msg.role == 'user' else 'Aria'
                timestamp = msg.created_at.strftime('%H:%M') if msg.created_at else 'Unknown'
                content += f"[{role} - {timestamp}]\n"
                content += f"{msg.text}\n\n"
            
            response = Response(content, mimetype='text/plain')
            response.headers['Content-Disposition'] = f'attachment; filename="chat-export-{session.date}.txt"'
            return response
    
    finally:
        db.close()


# Error handlers
@app.errorhandler(404)
def not_found(error):
    return jsonify({'error': 'Not found'}), 404


@app.errorhandler(500)
def internal_error(error):
    return jsonify({'error': 'Internal server error'}), 500


if __name__ == '__main__':
    # Ensure tables are created
    Base.metadata.create_all(engine)

    # Run the Flask app
    app.run(debug=True, host='0.0.0.0', port=5000, use_reloader=False)
