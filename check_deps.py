import sys
try:
    import fastapi
    import asyncpg
    import uvicorn
    import jinja2
    import pydantic
    import httpx
    print("All Python deps OK")
except ImportError as e:
    print(f"Missing dep: {e}")
    sys.exit(1)
