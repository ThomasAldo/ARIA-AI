#!/usr/bin/env python3
"""
Quick test script for the chat endpoint
"""

import requests
import json
import time
from uuid import uuid4

BASE_URL = "http://localhost:5000"

# Create test user first
print("[1] Creating test user...")
user_id = str(uuid4())

response = requests.post(
    f"{BASE_URL}/api/auth/signup",
    json={
        "name": "Test User",
        "email": f"test{int(time.time())}@example.com",
        "password": "password123"
    }
)

if response.status_code == 201:
    data = response.json()
    user_id = data.get('user_id', user_id)
    token = data.get('token')
    print(f"✓ User created: {user_id}")
else:
    print(f"✗ Failed to create user: {response.status_code}")
    print(response.text)
    exit(1)

# Test chat endpoint
print("\n[2] Testing chat endpoint...")
headers = {
    'Authorization': f'Bearer {token}',
    'Content-Type': 'application/json'
}

test_messages = [
    "Hi, I'm learning Python programming",
    "I like coffee and long walks"
]

for msg in test_messages:
    print(f"\n  Sending: {msg}")
    
    response = requests.post(
        f"{BASE_URL}/api/chat",
        json={
            "message": msg,
            "user_id": user_id,
            "date": "2025-12-21"
        },
        headers=headers,
        stream=True
    )
    
    print(f"  Status: {response.status_code}")
    
    if response.status_code == 200:
        print("  Response stream:")
        full_response = ""
        for line in response.iter_lines():
            if line:
                line_str = line.decode('utf-8') if isinstance(line, bytes) else line
                if line_str.startswith('data: '):
                    data_str = line_str[6:]  # Remove 'data: ' prefix
                    try:
                        data = json.loads(data_str)
                        if data.get('type') == 'text':
                            text = data.get('text', '')
                            full_response += text
                            print(f"    {text}", end='', flush=True)
                        elif data.get('type') == 'done':
                            print("\n  ✓ Response complete")
                    except json.JSONDecodeError:
                        pass
    else:
        print(f"  ✗ Error: {response.status_code}")
        print(response.text)

# Check if tasks were created
print("\n[3] Checking created tasks...")
response = requests.get(
    f"{BASE_URL}/api/tasks?user_id={user_id}",
    headers=headers
)

if response.status_code == 200:
    tasks = response.json()
    print(f"✓ Tasks created: {len(tasks)}")
    for task in tasks:
        print(f"  - {task.get('text')}")
else:
    print(f"✗ Failed to get tasks: {response.status_code}")

# Check if facts were learned
print("\n[4] Checking learned facts...")
response = requests.get(
    f"{BASE_URL}/api/facts?user_id={user_id}",
    headers=headers
)

if response.status_code == 200:
    facts = response.json()
    print(f"✓ Facts learned: {len(facts)}")
    for fact in facts:
        print(f"  - {fact.get('content')}")
else:
    print(f"✗ Failed to get facts: {response.status_code}")

print("\n✓ Test complete!")
