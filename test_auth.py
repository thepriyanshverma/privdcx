import urllib.request
import json
import uuid

# 1. Register
email = f"test_{uuid.uuid4()}@example.com"
password = "testpassword123"
reg_data = json.dumps({"full_name": "Test User", "email": email, "password": password}).encode('utf-8')
reg_req = urllib.request.Request('http://localhost:8000/api/v1/tenants/auth/register', data=reg_data, headers={'Content-Type': 'application/json'})
try:
    reg_res = urllib.request.urlopen(reg_req)
    print("Register Response:", reg_res.read().decode('utf-8'))
except Exception as e:
    print("Register Failed:", e)

# 2. Login
login_data = json.dumps({"email": email, "password": password}).encode('utf-8')
login_req = urllib.request.Request('http://localhost:8000/api/v1/tenants/auth/login', data=login_data, headers={'Content-Type': 'application/json'})
try:
    login_res = urllib.request.urlopen(login_req)
    print("Login Response:", login_res.read().decode('utf-8'))
except Exception as e:
    print("Login Failed:", e)
