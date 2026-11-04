import { expect, test } from 'vitest';
import { bucketCorsRules } from '../scripts/set-bucket-cors';

// Browsers upload straight to the bucket with a signed PUT and download with a signed GET (docs/21).
test('the bucket accepts signed uploads and downloads from the app address only', () => {
  expect(bucketCorsRules('https://pmcrm.onrender.com/')).toEqual([
    {
      AllowedOrigins: ['https://pmcrm.onrender.com'],
      AllowedMethods: ['GET', 'PUT'],
      AllowedHeaders: ['Content-Type'],
      MaxAgeSeconds: 3600,
    },
  ]);
});

test('an address with a path or no https is refused', () => {
  expect(() => bucketCorsRules('pmcrm.onrender.com')).toThrow(/https:\/\//);
  expect(() => bucketCorsRules('https://pmcrm.onrender.com/app')).toThrow(/no path/);
});
