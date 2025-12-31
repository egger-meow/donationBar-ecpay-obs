#!/usr/bin/env python3
"""
Automated ECPay Webhook Tester
Generates encrypted test payload and executes the webhook call
"""

import requests
import subprocess
import json
import sys

# Configuration
GENERATE_PAYLOAD_URL = "https://donationbar-ecpay-obs.onrender.com/webhook/ecpay/generate-test-payload"
WEBHOOK_TEST_SECRET = "YOUR_WEBHOOK_TEST_SECRET"

def generate_test_payload(amount=200, nickname="FullTestUser", message="Testing full encryption flow"):
    """
    Step 1: Generate encrypted test payload
    """
    print(f"Step 1: Generating test payload...")
    print(f"  Amount: ${amount}")
    print(f"  Nickname: {nickname}")
    print(f"  Message: {message}\n")
    
    headers = {
        "Content-Type": "application/json",
        "X-Test-Secret": WEBHOOK_TEST_SECRET
    }
    
    payload = {
        "amount": amount,
        "nickname": nickname,
        "message": message
    }
    
    try:
        response = requests.post(GENERATE_PAYLOAD_URL, headers=headers, json=payload)
        response.raise_for_status()
        return response.json()
    except requests.exceptions.RequestException as e:
        print(f"Error generating payload: {e}")
        sys.exit(1)

def execute_curl_command(curl_command):
    """
    Step 2: Execute the returned curl command
    """
    print("Step 2: Executing webhook call...\n")
    print(f"Command: {curl_command[:100]}...\n")
    
    try:
        # Execute the curl command
        result = subprocess.run(
            curl_command,
            shell=True,
            capture_output=True,
            text=True,
            timeout=30
        )
        
        return {
            "returncode": result.returncode,
            "stdout": result.stdout,
            "stderr": result.stderr
        }
    except subprocess.TimeoutExpired:
        print("Error: Command timed out after 30 seconds")
        sys.exit(1)
    except Exception as e:
        print(f"Error executing command: {e}")
        sys.exit(1)

def main():
    print("=" * 60)
    print("ECPay Webhook Automated Tester")
    print("=" * 60 + "\n")
    
    # Step 1: Generate encrypted payload
    response_data = generate_test_payload()
    
    if not response_data.get("success"):
        print(f"Failed to generate payload: {response_data.get('message', 'Unknown error')}")
        sys.exit(1)
    
    print(f"✓ Payload generated successfully")
    print(f"  Message: {response_data.get('message', 'N/A')}\n")
    
    # Display decrypted data preview
    if "decryptedDataPreview" in response_data:
        print("Decrypted Data Preview:")
        print(json.dumps(response_data["decryptedDataPreview"], indent=2))
        print()
    
    # Step 2: Execute the curl command
    curl_command = response_data.get("curlCommand")
    if not curl_command:
        print("Error: No curlCommand found in response")
        sys.exit(1)
    
    result = execute_curl_command(curl_command)
    
    # Display results
    print("=" * 60)
    print("Webhook Response")
    print("=" * 60)
    print(f"Exit Code: {result['returncode']}")
    print(f"Response: {result['stdout']}")
    
    if result['stderr']:
        print(f"Errors: {result['stderr']}")
    
    if result['returncode'] == 0:
        print("\n✓ Webhook test completed successfully!")
    else:
        print("\n✗ Webhook test failed")
        sys.exit(1)

if __name__ == "__main__":
    main()
