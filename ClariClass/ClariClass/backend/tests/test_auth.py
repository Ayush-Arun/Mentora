from services.otp_service import generate_otp, create_access_token, verify_token

def test_otp_generation():
    otp = generate_otp(6)
    assert len(otp) == 6
    assert otp.isdigit()

def test_jwt_issuance_and_verification():
    payload = {"sub": "1", "email": "teacher@clariclass.edu", "role": "teacher"}
    token = create_access_token(payload)
    decoded = verify_token(token)
    assert decoded["email"] == "teacher@clariclass.edu"
    assert decoded["role"] == "teacher"
