/* eslint-disable sort-keys-fix/sort-keys-fix , typescript-sort-keys/interface */

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace NodeJS {
    interface ProcessEnv {
      ACCESS_CODE?: string;
      CUSTOM_MODELS?: string;

      OPENAI_API_KEY?: string;
      OPENAI_PROXY_URL?: string;

      AZURE_API_KEY?: string;
      AZURE_API_VERSION?: string;
      USE_AZURE_OPENAI?: string;

      IMGUR_CLIENT_ID?: string;

      AGENTS_INDEX_URL?: string;

      PLUGINS_INDEX_URL?: string;
      PLUGIN_SETTINGS?: string;
    }
  }
}

// we apply a free imgur app to get a client id
// refs: https://apidocs.imgur.com/
const DEFAULT_IMAGUR_CLIENT_ID = 'e415f320d6e24f9';

function parseDate(yyyyMMdd:string) {
  if (yyyyMMdd && yyyyMMdd.length === 8) {
    const year = Number.parseInt(yyyyMMdd.substring(0, 4));
    const month = Number.parseInt(yyyyMMdd.substring(4, 6));
    const day = Number.parseInt(yyyyMMdd.substring(6, 8));
    return new Date(year, month - 1, day);
  } else {
    return null;
  }
}

export const getServerConfig = () => {
  if (typeof process === 'undefined') {
    throw new Error('[Server Config] you are importing a server-only module outside of server');
  }

  // region format: iad1,sfo1 3333
  let regions: string[] = [];
  if (process.env.OPENAI_FUNCTION_REGIONS) {
    regions = process.env.OPENAI_FUNCTION_REGIONS.split(',');
  }

  // const ACCESS_CODES = process.env.ACCESS_CODE?.split(',').filter(Boolean) || [];
  // Parse ACCESS_CODES with their expiration dates
  
  console.log("process.env.ACCESS_CODE="+process.env.ACCESS_CODE);
  const ACCESS_CODES_WITH_EXPIRY = process.env.ACCESS_CODE
    ? process.env.ACCESS_CODE.split(',').map((entry) => {
        const [code, expiry] = entry.split(':');
        console.log("process.env.ACCESS_CODE"+code + expiry);
        console.log("process.env.ACCESS_CODE"+code + expiry);
        return { code, expiry: parseDate(expiry) };
      
      })
    : [];
    console.log("ACCESS_CODES_WITH_EXPIRY.length"+ACCESS_CODES_WITH_EXPIRY.length);
  return {
    ACCESS_CODES:ACCESS_CODES_WITH_EXPIRY,
    CUSTOM_MODELS: process.env.CUSTOM_MODELS,

    SHOW_ACCESS_CODE_CONFIG: !!ACCESS_CODES_WITH_EXPIRY.length,

    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_PROXY_URL: process.env.OPENAI_PROXY_URL,
    OPENAI_FUNCTION_REGIONS: regions,

    AZURE_API_KEY: process.env.AZURE_API_KEY,
    AZURE_API_VERSION: process.env.AZURE_API_VERSION,
    USE_AZURE_OPENAI: process.env.USE_AZURE_OPENAI === '1',

    IMGUR_CLIENT_ID: process.env.IMGUR_CLIENT_ID || DEFAULT_IMAGUR_CLIENT_ID,

    AGENTS_INDEX_URL: !!process.env.AGENTS_INDEX_URL
      ? process.env.AGENTS_INDEX_URL
      : 'https://chat-agents.lobehub.com',

    PLUGINS_INDEX_URL: !!process.env.PLUGINS_INDEX_URL
      ? process.env.PLUGINS_INDEX_URL
      : 'https://chat-plugins.lobehub.com',

    PLUGIN_SETTINGS: process.env.PLUGIN_SETTINGS,
  };
};
