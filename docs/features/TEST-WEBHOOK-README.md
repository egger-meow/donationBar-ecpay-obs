# ECPay Webhook Testing Guide

## Overview
This guide explains how to test the ECPay webhook endpoint locally using mock data.

## Prerequisites
1. Server must be running on `http://localhost:3000`
2. ECPay credentials must be configured (MERCHANT_ID, HASH_KEY, HASH_IV)

## Test Script: `test-webhook.js`

### Features
- ✅ Generates properly encrypted ECPay webhook payloads
- ✅ Calculates correct CheckMacValue signatures
- ✅ Tests multiple scenarios (normal donation, large donation, simulated payment)
- ✅ Uses your actual ECPay credentials from `.env`

### How to Run

#### Run all test cases:
```bash
node test-webhook.js
```

#### Run specific test case:
```bash
node test-webhook.js 1  # Normal donation (NT$100)
node test-webhook.js 2  # Large donation (NT$500)
node test-webhook.js 3  # Simulated payment (should be ignored)
```

## Test Scenarios

### Test 1: Normal Donation (NT$100)
- **Patron Name**: 王小明
- **Message**: 加油！支持你！
- **Amount**: NT$100
- **Expected**: Should be added to donation total

### Test 2: Large Donation (NT$500)
- **Patron Name**: Anonymous
- **Message**: 感謝分享
- **Amount**: NT$500
- **Expected**: Should be added to donation total

### Test 3: Simulated Payment (NT$1)
- **Patron Name**: 測試用戶
- **Message**: 這是模擬付款
- **Amount**: NT$1
- **SimulatePaid**: 1 (marked as simulation)
- **Expected**: Should be acknowledged but NOT added to donation total

## Expected Server Responses

### Success Response
```
1|OK
```

### Error Responses
```
0|Invalid merchant     # Merchant ID mismatch
0|Invalid signature    # CheckMacValue verification failed
0|Decryption failed    # Failed to decrypt Data field
0|Server error         # Internal server error
```

## Server Logs to Watch

When testing, the server will log:
- 📨 ECPay webhook received
- 📦 Decrypted data (full JSON)
- ✅ Donation processed (with details)
- ⚠️ Warnings (simulated payment, duplicate, etc.)
- ❌ Errors (validation failures)

## Troubleshooting

### "Connection refused" error
**Problem**: Server is not running
**Solution**: Start the server with `npm start`

### "Invalid signature" error
**Problem**: HASH_KEY or HASH_IV mismatch
**Solution**: Check your `.env` file has the correct ECPay credentials

### "Merchant ID mismatch" error
**Problem**: MERCHANT_ID doesn't match
**Solution**: Update MERCHANT_ID in `.env` or test script

### Donation not appearing
**Check**:
1. Server logs for any errors
2. Database file `db.json` for the new donation
3. Trade number isn't duplicate (check `seenTradeNos`)

## Manual Testing with cURL

You can also test manually with cURL (requires pre-generated encrypted payload):

```bash
curl -X POST http://localhost:3000/webhook/ecpay \
  -H "Content-Type: application/json" \
  -H "Accept: text/html" \
  -d @test-payload.json
```

## Notes

1. **Encryption**: The Data field is encrypted using AES-128-CBC with your HASH_KEY and HASH_IV
2. **Signature**: CheckMacValue is calculated using SHA256 with ECPay's special URL encoding rules
3. **Idempotency**: Duplicate trade numbers are automatically ignored by the server
4. **Simulated Payments**: Marked with `SimulatePaid: 1` and won't be added to the database

## Next Steps

After successful local testing:
1. Deploy your application
2. Set the ReturnURL in ECPay merchant backend to your production webhook URL
3. Use ECPay's "模擬付款" (Simulate Payment) feature for final testing
4. Monitor real payments in production
