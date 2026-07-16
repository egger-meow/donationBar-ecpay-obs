const ECPAY_TIME_ZONE = 'Asia/Taipei';

// ECPay expects MerchantTradeDate as yyyy/MM/dd HH:mm:ss. Keep the value stable
// when the application runs in a UTC container or on a host with another timezone.
export function formatECPayDate(date = new Date()) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) throw new Error('Invalid ECPay date');
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: ECPAY_TIME_ZONE,
    calendar: 'gregory',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date);
  const values = Object.fromEntries(parts.filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
  return `${values.year}/${values.month}/${values.day} ${values.hour}:${values.minute}:${values.second}`;
}
