import os
from kiteconnect import KiteConnect
from dotenv import load_dotenv, set_key
load_dotenv()

kite = KiteConnect(api_key=os.environ["KITE_API_KEY"])

def get_login_url() -> str:
    return kite.login_url()

def generate_session(request_token: str) -> str:
    data = kite.generate_session(request_token, api_secret=os.environ["KITE_API_SECRET"])
    token = data["access_token"]
    set_key(".env", "KITE_ACCESS_TOKEN", token)
    kite.set_access_token(token)
    return token

def get_kite() -> KiteConnect:
    token = os.environ.get("KITE_ACCESS_TOKEN", "")
    if not token:
        raise RuntimeError("No access token. Call /auth/login first.")
    kite.set_access_token(token)
    return kite

def check_session() -> bool:
    try:
        get_kite().profile()
        return True
    except Exception:
        return False
