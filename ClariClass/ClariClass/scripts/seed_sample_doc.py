"""
Seed script to create a sample session with mock lecture chunks for local testing.
"""
import requests
import json

BASE_URL = "http://127.0.0.1:8000"

def seed():
    print("🌱 Checking backend health...")
    try:
        health = requests.get(f"{BASE_URL}/health")
        print(f"Health Status: {health.json()}")
    except Exception as e:
        print(f"❌ Backend not reachable at {BASE_URL}: {e}")
        return

    print("🌱 Requesting Dev OTP for Teacher...")
    otp_res = requests.post(f"{BASE_URL}/auth/request-otp", json={
        "email": "teacher@clariclass.edu",
        "name": "Prof. Ada Lovelace",
        "role": "teacher"
    }).json()
    print("OTP Response:", otp_res)

    print("✨ Seeding completed.")

if __name__ == "__main__":
    seed()
