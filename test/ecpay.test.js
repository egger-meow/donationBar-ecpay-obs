import test from 'node:test';
import assert from 'node:assert/strict';
import { generateCheckMacValueForCredentials, verifyCheckMacValueForCredentials, verifyCheckMacValueForRawBody } from '../ecpay.js';

const credentials = { hashKey: '5294y06JbISpM5x9', hashIV: 'v77hoKGq4kWxNNIS' };
const fixture = {
  MerchantID: '3002607', MerchantTradeNo: 'SUB202607110001', RtnCode: '1', TradeAmt: '70',
  TradeNo: '2607111234567890', CustomField1: 'sandbox-user', SimulatePaid: '0'
};

test('ECPay callback checksum validates the unmodified form fields', () => {
  const signed = { ...fixture, CheckMacValue: generateCheckMacValueForCredentials(fixture, credentials) };
  assert.equal(verifyCheckMacValueForCredentials(signed, credentials), true);
});

test('ECPay callback checksum rejects tampered amounts', () => {
  const signed = { ...fixture, CheckMacValue: generateCheckMacValueForCredentials(fixture, credentials) };
  assert.equal(verifyCheckMacValueForCredentials({ ...signed, TradeAmt: '7000' }, credentials), false);
});

test('ECPay callback checksum can verify the captured raw form body', () => {
  const signed = { ...fixture, CheckMacValue: generateCheckMacValueForCredentials(fixture, credentials) };
  const rawBody = new URLSearchParams(signed).toString();
  assert.equal(verifyCheckMacValueForRawBody(Buffer.from(rawBody), credentials), true);
  assert.equal(verifyCheckMacValueForRawBody(Buffer.from(`${rawBody}&TradeAmt=7000`), credentials), false, 'duplicate signed fields are rejected');
});
