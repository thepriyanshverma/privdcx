import jwt as pyjwt
from jose import jwt as jose_jwt
from datetime import datetime, timedelta

SECRET_KEY = "infraos_super_secret_key_for_jwt_32_chars"
ALGORITHM = "HS256"

# 1. Create token with python-jose (simulating infra-tenant)
expire = datetime.utcnow() + timedelta(minutes=60)
to_encode = {
    "exp": expire, 
    "sub": "44015694-82af-4fc8-999d-19df25983711",
    "email": "test@example.com"
}
jose_token = jose_jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
print(f"Jose Token: {jose_token}")

# 2. Try to decode with PyJWT (simulating infra-gateway)
try:
    decoded = pyjwt.decode(jose_token, SECRET_KEY, algorithms=[ALGORITHM])
    print(f"Decoded with PyJWT: {decoded}")
except Exception as e:
    print(f"Failed to decode with PyJWT: {e}")

# 3. Try reversed
pyjwt_token = pyjwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
try:
    decoded = jose_jwt.decode(pyjwt_token, SECRET_KEY, algorithms=[ALGORITHM])
    print(f"Decoded with Jose: {decoded}")
except Exception as e:
    print(f"Failed to decode with Jose: {e}")
