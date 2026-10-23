import { OFFICIAL_URL } from '@lobechat/const';
import urlJoin from 'url-join';

const isVercelPreview = process.env.VERCEL === '1' && process.env.VERCEL_ENV !== 'production';

const vercelPreviewUrl = `https://${process.env.VERCEL_URL}`;

// White-label: canonical host must follow the deployment's own app URL, not the
// upstream marketing domain. Feeds robots.txt `Host`, manifest
// `related_applications`, og:url and JSON-LD.
const siteUrl = (isVercelPreview ? vercelPreviewUrl : undefined) ?? OFFICIAL_URL;

export const getCanonicalUrl = (...paths: string[]) => urlJoin(siteUrl, ...paths);
