#!/usr/bin/env python3
"""
ARIA Setup Script
Helps with initial configuration and testing
"""

import os
import sys
import subprocess
from pathlib import Path

def print_header(text):
    print(f"\n{'='*60}")
    print(f"  {text}")
    print(f"{'='*60}\n")

def print_success(text):
    print(f"✅ {text}")

def print_error(text):
    print(f"❌ {text}")

def print_info(text):
    print(f"ℹ️  {text}")

def check_python():
    print_header("Checking Python Version")
    version = sys.version_info
    if version.major >= 3 and version.minor >= 9:
        print_success(f"Python {version.major}.{version.minor}.{version.micro} found")
        return True
    else:
        print_error(f"Python 3.9+ required, found {version.major}.{version.minor}")
        return False

def check_dependencies():
    print_header("Checking Python Dependencies")
    try:
        import flask
        print_success("Flask installed")
    except ImportError:
        print_error("Flask not found - run: pip install -r requirements.txt")
        return False
    
    try:
        import sqlalchemy
        print_success("SQLAlchemy installed")
    except ImportError:
        print_error("SQLAlchemy not found - run: pip install -r requirements.txt")
        return False
    
    try:
        import google.generativeai
        print_success("Google Generative AI installed")
    except ImportError:
        print_error("Google Generative AI not found - run: pip install -r requirements.txt")
        return False
    
    return True

def check_env_file():
    print_header("Checking Environment Configuration")
    if os.path.exists('.env'):
        print_success(".env file found")
        
        with open('.env', 'r') as f:
            content = f.read()
        
        if 'GEMINI_API_KEY=' in content and 'your-google-gemini-api-key-here' not in content:
            print_success("GEMINI_API_KEY configured")
            return True
        else:
            print_error("GEMINI_API_KEY not configured")
            print_info("Get your key from: https://aistudio.google.com/app/apikey")
            return False
    else:
        print_error(".env file not found")
        print_info("Create it with: cp .env.example .env")
        return False

def check_database():
    print_header("Checking Database")
    if os.path.exists('aria.db'):
        print_success("Database file found")
        return True
    else:
        print_info("Database will be created on first run")
        return True

def test_api():
    print_header("Testing API Connection")
    try:
        import requests
        response = requests.get('http://localhost:5000/api/health', timeout=2)
        if response.status_code == 200:
            print_success("API is running and responding")
            return True
        else:
            print_error(f"API returned status {response.status_code}")
            return False
    except requests.exceptions.ConnectionError:
        print_error("Cannot connect to API - is Flask running?")
        print_info("Start Flask with: python app.py")
        return False
    except ImportError:
        print_info("requests library not installed - skipping live test")
        return True

def main():
    print("\n")
    print("  ╔═══════════════════════════════════════════════════════╗")
    print("  ║         🌟 ARIA - Setup & Configuration 🌟          ║")
    print("  ║      Personal AI Journal & Assistant Setup          ║")
    print("  ╚═══════════════════════════════════════════════════════╝")
    
    all_good = True
    
    # Run checks
    if not check_python():
        all_good = False
    
    if not check_dependencies():
        all_good = False
    
    if not check_env_file():
        all_good = False
    
    if not check_database():
        all_good = False
    
    # Optional test if API is running
    print_header("Additional Checks (Optional)")
    test_api()
    
    # Summary
    print_header("Setup Summary")
    
    if all_good:
        print_success("All checks passed! ARIA is ready to run.")
        print("\n📝 Next steps:")
        print("  1. Start the Flask backend:")
        print("     $ python app.py")
        print("\n  2. In another terminal, start the frontend (from project root):")
        print("     $ npm run dev")
        print("\n  3. Open http://localhost:5173 in your browser")
    else:
        print_error("Some checks failed. Please fix the issues above.")
        print("\n📚 For help, see:")
        print("  - ARCHITECTURE.md for detailed documentation")
        print("  - README.md for setup instructions")

if __name__ == '__main__':
    main()
