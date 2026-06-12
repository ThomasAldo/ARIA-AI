"""
Database Models for Aria Backend
SQLAlchemy ORM models mapping to SQLite database
"""

from datetime import datetime
from sqlalchemy import create_engine, Column, String, Integer, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship
from werkzeug.security import generate_password_hash, check_password_hash

Base = declarative_base()


class User(Base):
    """User model for authentication and profile management"""
    __tablename__ = 'users'

    id = Column(String(36), primary_key=True)
    email = Column(String(255), unique=True, nullable=False)
    name = Column(String(255), nullable=False, default='User')
    password_hash = Column(String(255), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    def set_password(self, password: str):
        """Hash and set password"""
        self.password_hash = generate_password_hash(password)

    def check_password(self, password: str) -> bool:
        """Verify password against hash"""
        return check_password_hash(self.password_hash, password)

    # Relationships
    facts = relationship('Fact', back_populates='user', cascade='all, delete-orphan')
    tasks = relationship('Task', back_populates='user', cascade='all, delete-orphan')
    chat_sessions = relationship('ChatSession', back_populates='user', cascade='all, delete-orphan')

    def __repr__(self):
        return f'<User {self.email}>'


class Fact(Base):
    """Long-term memory facts about the user"""
    __tablename__ = 'facts'

    id = Column(String(36), primary_key=True)
    user_id = Column(String(36), ForeignKey('users.id'), nullable=False)
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    user = relationship('User', back_populates='facts')

    def __repr__(self):
        return f'<Fact {self.id}>'


class Task(Base):
    """Task/Todo items for the user"""
    __tablename__ = 'tasks'

    id = Column(String(36), primary_key=True)
    user_id = Column(String(36), ForeignKey('users.id'), nullable=False)
    text = Column(Text, nullable=False)
    completed = Column(Boolean, default=False, nullable=False)
    due_date = Column(String(10), nullable=True)  # ISO format YYYY-MM-DD
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    user = relationship('User', back_populates='tasks')

    def __repr__(self):
        return f'<Task {self.text}>'

    def to_dict(self):
        """Convert Task to dictionary for JSON serialization"""
        return {
            'id': self.id,
            'text': self.text,
            'completed': self.completed,
            'dueDate': self.due_date,
            'timestamp': int(self.created_at.timestamp() * 1000)
        }


class ChatSession(Base):
    """Chat session for a specific day"""
    __tablename__ = 'chat_sessions'

    id = Column(String(36), primary_key=True)
    user_id = Column(String(36), ForeignKey('users.id'), nullable=False)
    date = Column(String(10), nullable=False)  # YYYY-MM-DD format
    title = Column(String(255), nullable=True)  # User-editable title
    summary = Column(Text, nullable=True)  # Auto-generated summary
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    user = relationship('User', back_populates='chat_sessions')
    messages = relationship('Message', back_populates='session', cascade='all, delete-orphan')

    def __repr__(self):
        return f'<ChatSession {self.date}>'


class Message(Base):
    """Individual message in a chat session"""
    __tablename__ = 'messages'

    id = Column(String(36), primary_key=True)
    session_id = Column(String(36), ForeignKey('chat_sessions.id'), nullable=False)
    role = Column(String(10), nullable=False)  # 'user' or 'model'
    text = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    session = relationship('ChatSession', back_populates='messages')

    def __repr__(self):
        return f'<Message {self.role}>'

    def to_dict(self):
        """Convert Message to dictionary for JSON serialization"""
        return {
            'id': self.id,
            'role': self.role,
            'text': self.text,
            'timestamp': int(self.created_at.timestamp() * 1000)
        }


def init_db(database_url: str = 'sqlite:///aria.db'):
    """Initialize the database"""
    engine = create_engine(database_url)
    Base.metadata.create_all(engine)
    return engine
