#!/bin/bash

# Test Script for Cline Compatibility
# Tests the role normalization fix with actual HTTP requests

echo "🧪 Testing Cline Compatibility with Role Normalization"
echo "======================================================"

# Server URL (adjust if needed)
SERVER_URL="http://localhost:3000"

# Test function
test_request() {
    local test_name="$1"
    local request_data="$2"
    local expected_status="$3"
    
    echo ""
    echo "Testing: $test_name"
    echo "Request: $request_data"
    
    response=$(curl -s -w "\nHTTP_STATUS:%{http_code}" \
        -X POST "$SERVER_URL/v1/chat/completions" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer test-token" \
        -d "$request_data")
    
    # Extract HTTP status
    http_status=$(echo "$response" | grep "HTTP_STATUS:" | cut -d: -f2)
    response_body=$(echo "$response" | sed '/HTTP_STATUS:/d')
    
    if [ "$http_status" = "$expected_status" ]; then
        echo "✅ PASS: HTTP $http_status (expected $expected_status)"
        if [ "$expected_status" = "200" ]; then
            echo "Response: $(echo "$response_body" | jq -r '.choices[0].message.content // .error.message' 2>/dev/null || echo "$response_body")"
        fi
    else
        echo "❌ FAIL: HTTP $http_status (expected $expected_status)"
        echo "Response: $response_body"
    fi
}

echo ""
echo "1. Testing Standard Roles (Should Work)"
echo "--------------------------------------"

test_request "Standard lowercase roles" '{
    "model": "gpt-4",
    "messages": [
        {"role": "system", "content": "You are a helpful assistant"},
        {"role": "user", "content": "Hello"}
    ]
}' "200"

echo ""
echo "2. Testing Capitalized Roles (Cline Style)"
echo "------------------------------------------"

test_request "Capitalized System role" '{
    "model": "gpt-4", 
    "messages": [
        {"role": "System", "content": "You are Cline, a helpful AI assistant"}
    ]
}' "200"

test_request "Capitalized User role" '{
    "model": "gpt-4",
    "messages": [
        {"role": "User", "content": "Can you help me code?"}
    ]
}' "200"

test_request "Capitalized Assistant role" '{
    "model": "gpt-4",
    "messages": [
        {"role": "Assistant", "content": "Of course!"}
    ]
}' "200"

test_request "Mixed capitalized roles" '{
    "model": "gpt-4",
    "messages": [
        {"role": "System", "content": "You are Cline"},
        {"role": "User", "content": "Hello"},
        {"role": "Assistant", "content": "Hi there!"}
    ]
}' "200"

echo ""
echo "3. Testing Alternative Role Names"
echo "--------------------------------"

test_request "Human role (should map to user)" '{
    "model": "gpt-4",
    "messages": [
        {"role": "human", "content": "Hello from human"}
    ]
}' "200"

test_request "AI role (should map to assistant)" '{
    "model": "gpt-4",
    "messages": [
        {"role": "ai", "content": "Hello from AI"}
    ]
}' "200"

test_request "Bot role (should map to assistant)" '{
    "model": "gpt-4",
    "messages": [
        {"role": "bot", "content": "Hello from bot"}
    ]
}' "200"

echo ""
echo "4. Testing Whitespace Handling"
echo "------------------------------"

test_request "Role with spaces" '{
    "model": "gpt-4",
    "messages": [
        {"role": " user ", "content": "Hello with spaces"}
    ]
}' "200"

echo ""
echo "5. Testing Invalid Roles (Should Fail)"
echo "--------------------------------------"

test_request "Invalid role" '{
    "model": "gpt-4",
    "messages": [
        {"role": "admin", "content": "Should fail"}
    ]
}' "400"

test_request "Empty role" '{
    "model": "gpt-4",
    "messages": [
        {"role": "", "content": "Should fail"}
    ]
}' "400"

echo ""
echo "6. Testing Complete Cline-Style Request"
echo "---------------------------------------"

test_request "Full Cline request simulation" '{
    "model": "gpt-4",
    "messages": [
        {
            "role": "System",
            "content": "You are Cline, a helpful AI assistant that can help with coding tasks. You have access to tools and can read/write files."
        },
        {
            "role": "User", 
            "content": "Hello Cline! Can you help me write a TypeScript function that calculates the factorial of a number?"
        }
    ],
    "temperature": 0.7,
    "max_tokens": 500
}' "200"

echo ""
echo "🎉 Testing Complete!"
echo "==================="
echo ""
echo "If all tests passed, the role normalization fix is working correctly"
echo "and Cline should now be able to connect to the GitHub Copilot API server."
echo ""
echo "To test with actual Cline:"
echo "1. Start the GitHub Copilot API server"
echo "2. Configure Cline to use: $SERVER_URL"
echo "3. Try sending a message from Cline"
echo ""
echo "The server should now accept Cline's capitalized role format!"
