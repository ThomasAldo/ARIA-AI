#!/usr/bin/env python3
"""Quick test of the AI manager"""

import sys
sys.path.insert(0, '.')
from dotenv import load_dotenv
load_dotenv()

from ai_manager import generate_response_stream

try:
    print("Testing generate_response_stream...")
    generator = generate_response_stream(
        user_message='Hello',
        history=[],
        date_context='2024-12-21',
        facts=[],
        active_tasks=[],
        user_name='TestUser',
        db_session=None
    )
    
    for chunk in generator:
        chunk_type = chunk.get('type')
        print(f'Got chunk type: {chunk_type}')
        if chunk_type == 'text':
            text = chunk.get('text', '')
            print(f'Text: {text}')
            
except Exception as e:
    print(f'Error: {str(e)}')
