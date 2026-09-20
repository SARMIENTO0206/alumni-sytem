import QRCode from 'qrcode';

export function paymentQrPayload(payment) {
  const code = payment.request_code || payment.requestCode || `PAY-${payment.id}`;
  const amount = Number(payment.amount_centavos != null ? payment.amount_centavos / 100 : payment.amount || 0).toFixed(2);
  const ref = payment.reference_id || payment.referenceId || payment.gateway_intent_id || payment.gatewayIntentId || `payment-${payment.id}`;
  return [code, `PHP ${amount}`, ref].join(' | ');
}

export async function identifierQrDataUri(text) {
  const payload = String(text || '').trim();
  if (!payload) return '';
  return QRCode.toDataURL(payload, {
    width: 360,
    margin: 2,
    errorCorrectionLevel: 'M',
    color: { dark: '#1e293b', light: '#ffffff' }
  });
}
