"""
Vercel Serverless Entry Point for Hotel PMS Backend
Imports the FastAPI app from backend/server.py
"""
import sys
import os

# Add backend directory to Python path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

from server import app
